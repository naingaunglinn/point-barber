-- Point Barbershop — Part 5 v1 (🔒 D-DB-09) · Commission / Payroll / Attendance · DBML မှာ ရေးလို့မရတဲ့ constraint
-- v1.1 (30/Sep — audit): payroll_attendance_items minutes / day_portion · attendance_exceptions minutes CHECK မှာ NULL ကျော်တာ ပြင် (IS NOT NULL ထပ်ထည့်) · schema မပြောင်း
-- v1.2 (02/Oct/2026 — G (owner one-sheet 02/Oct 00:06) · G (a)(b)) = DB Part 5 v1.1: attendance_records_void_chk အသစ် · attendance_records_one_open / attendance_records_no_overlap = voided မပါ
--      · employee_receivables / employee_receivable_repayments.client_request_id (uuid UNIQUE NULL — DBML column unique) · payroll repayment = Mark paid မှာ INSERT (D-PAYR-04) · cash ပြန်ဆပ် ဗီရို ✖ (owner C3)
-- v1.3 (02/Oct/2026 — owner "OPEN-40 OK" · OPEN-40 (b) = B · review §0.9) = DB Part 5 v1.2 (🔒 D-DB-09 v1.2): employee_salaries_archive_chk + employee_commission_plans_archive_chk အသစ်
--      (archived_at ⇔ archived_by_user_id ⇔ archive_reason — all-or-none · reason ဗလာ ✖) · employee_salaries_no_overlap + employee_commission_plans_no_overlap = WHERE (archived_at IS NULL)
--      (archived row က ရက်တူ row အသစ် / ရှေ့ row ပြန်ချိတ်တာကို မပိတ်ဆို့ — Part 2 v1.3 archived_at ပုံစံတူ) · တခြား constraint မပြောင်း
-- btree_gist = Part 2 SQL မှာ ဖွင့်ပြီး

-- ═══════════ commission_plans / tiers ═══════════
ALTER TABLE commission_plans ADD CONSTRAINT commission_plans_status_chk CHECK (status IN (0, 1));
CREATE UNIQUE INDEX commission_plans_name_active ON commission_plans (company_id, name_mm) WHERE archived_at IS NULL;
ALTER TABLE commission_plan_tiers ADD CONSTRAINT commission_plan_tiers_range_chk
  CHECK (from_amount >= 0 AND (to_amount IS NULL OR to_amount > from_amount) AND rate_percent BETWEEN 0 AND 100 AND tier_order >= 1);
-- Tier ထပ် ✖ (D-COM-01 progressive)
ALTER TABLE commission_plan_tiers ADD CONSTRAINT commission_plan_tiers_no_overlap
  EXCLUDE USING gist (commission_plan_id WITH =, int8range(from_amount, to_amount, '[)') WITH &&);

-- ═══════════ employee_commission_plans ═══════════
ALTER TABLE employee_commission_plans ADD CONSTRAINT employee_commission_plans_dates_chk
  CHECK (effective_to IS NULL OR effective_to >= effective_from);
-- v1.3 OPEN-40 (b): archive ⇔ by + reason (all-or-none · reason ဗလာ ✖) — မှားချိတ်မိ + မသုံးရသေး assignment ကို ရုပ်သိမ်း, row မဖျက် (D-DAT-05) · P5.CPA.04
ALTER TABLE employee_commission_plans ADD CONSTRAINT employee_commission_plans_archive_chk CHECK (
  (archived_at IS NULL AND archived_by_user_id IS NULL AND archive_reason IS NULL)
  OR (archived_at IS NOT NULL AND archived_by_user_id IS NOT NULL AND archive_reason IS NOT NULL AND btrim(archive_reason) <> '')
);
-- Scope တူ (branch / all) ရက် ထပ် ✖ (D-COM-01 v5.1) — archived မပါ (v1.3 OPEN-40 b — archive ပြီး မှန်တဲ့ row အသစ် ထည့်ရ)
ALTER TABLE employee_commission_plans ADD CONSTRAINT employee_commission_plans_no_overlap
  EXCLUDE USING gist (
    employee_id WITH =,
    (COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid)) WITH =,
    daterange(effective_from, effective_to, '[]') WITH &&
  ) WHERE (archived_at IS NULL);

-- ═══════════ commission_results / lines ═══════════
ALTER TABLE commission_results ADD CONSTRAINT commission_results_amounts_chk
  CHECK (commissionable_amount >= 0 AND commission_amount >= 0 AND effective_rate_percent BETWEEN 0 AND 100);
ALTER TABLE commission_result_lines ADD CONSTRAINT commission_result_lines_kind_chk CHECK (kind IN (1, 2));
ALTER TABLE commission_result_lines ADD CONSTRAINT commission_result_lines_rate_chk CHECK (rate_percent BETWEEN 0 AND 100);
-- EARN ⇔ sale line (+) · REVERSAL ⇔ refund item + မူလ line (−)
ALTER TABLE commission_result_lines ADD CONSTRAINT commission_result_lines_kind_refs_chk CHECK (
  (kind = 1 AND sale_item_id IS NOT NULL AND refund_item_id IS NULL AND original_line_id IS NULL AND base_amount > 0 AND commission_amount >= 0)
  OR
  (kind = 2 AND refund_item_id IS NOT NULL AND original_line_id IS NOT NULL AND sale_item_id IS NULL AND base_amount < 0 AND commission_amount <= 0)
);
-- Sale line ၁ ခု ၁ ကြိမ်ပဲ commission · refund item ၁ ခု ၁ ကြိမ်ပဲ reversal
CREATE UNIQUE INDEX commission_result_lines_one_earn ON commission_result_lines (sale_item_id) WHERE kind = 1;
CREATE UNIQUE INDEX commission_result_lines_one_reversal ON commission_result_lines (refund_item_id) WHERE kind = 2;

-- ═══════════ employee_salaries ═══════════
ALTER TABLE employee_salaries ADD CONSTRAINT employee_salaries_amount_chk CHECK (basic_salary_amount >= 0);
ALTER TABLE employee_salaries ADD CONSTRAINT employee_salaries_dates_chk CHECK (effective_to IS NULL OR effective_to >= effective_from);
-- v1.3 OPEN-40 (b): archive ⇔ by + reason (all-or-none · reason ဗလာ ✖) — မှားထည့်မိ + မသုံးရသေး လစာ row ကို ရုပ်သိမ်း, row မဖျက် (D-DAT-05) · P5.EPY.04
ALTER TABLE employee_salaries ADD CONSTRAINT employee_salaries_archive_chk CHECK (
  (archived_at IS NULL AND archived_by_user_id IS NULL AND archive_reason IS NULL)
  OR (archived_at IS NOT NULL AND archived_by_user_id IS NOT NULL AND archive_reason IS NOT NULL AND btrim(archive_reason) <> '')
);
-- D-PAYR-02: ၁ ယောက် ၁ ခု — ရက် ထပ် ✖ — archived မပါ (v1.3 OPEN-40 b)
ALTER TABLE employee_salaries ADD CONSTRAINT employee_salaries_no_overlap
  EXCLUDE USING gist (employee_id WITH =, daterange(effective_from, effective_to, '[]') WITH &&) WHERE (archived_at IS NULL);

-- ═══════════ payroll_line_categories ═══════════
ALTER TABLE payroll_line_categories ADD CONSTRAINT payroll_line_categories_kind_chk   CHECK (kind IN (1, 2));
ALTER TABLE payroll_line_categories ADD CONSTRAINT payroll_line_categories_status_chk CHECK (status IN (0, 1));
ALTER TABLE payroll_line_categories ADD CONSTRAINT payroll_line_categories_system_chk
  CHECK (system_code IS NULL OR system_code BETWEEN 1 AND 8);
-- System category ⇒ kind ကိုက်ရမယ် (1 BASIC · 2 COMMISSION = EARNING; 3–8 = DEDUCTION) · archive ✖
ALTER TABLE payroll_line_categories ADD CONSTRAINT payroll_line_categories_system_kind_chk CHECK (
  system_code IS NULL
  OR (system_code IN (1, 2) AND kind = 1 AND archived_at IS NULL)
  OR (system_code BETWEEN 3 AND 8 AND kind = 2 AND archived_at IS NULL)
);
CREATE UNIQUE INDEX payroll_line_categories_system_uq ON payroll_line_categories (company_id, system_code) WHERE system_code IS NOT NULL;
CREATE UNIQUE INDEX payroll_line_categories_name_active ON payroll_line_categories (company_id, name_mm) WHERE archived_at IS NULL;

-- ═══════════ payroll_runs ═══════════
ALTER TABLE payroll_runs ADD CONSTRAINT payroll_runs_period_type_chk CHECK (period_type IN (1, 2, 3, 4));
ALTER TABLE payroll_runs ADD CONSTRAINT payroll_runs_status_chk      CHECK (status IN (0, 1, 2, 3, 4, 5));
ALTER TABLE payroll_runs ADD CONSTRAINT payroll_runs_period_chk      CHECK (period_end >= period_start);
-- D-PAYR-06: status ⇔ timestamp / by (အဆင့်တိုင်း ယခင်အဆင့် ရှိရ)
ALTER TABLE payroll_runs ADD CONSTRAINT payroll_runs_status_fields_chk CHECK (
  (status = 1 AND calculated_at IS NULL AND finalized_at IS NULL AND published_at IS NULL AND paid_at IS NULL AND cancelled_at IS NULL)
  OR (status = 2 AND calculated_at IS NOT NULL AND calculated_by_user_id IS NOT NULL AND rules_snapshot IS NOT NULL
      AND finalized_at IS NULL AND published_at IS NULL AND paid_at IS NULL AND cancelled_at IS NULL)
  OR (status = 3 AND calculated_at IS NOT NULL AND rules_snapshot IS NOT NULL AND finalized_at IS NOT NULL AND finalized_by_user_id IS NOT NULL
      AND published_at IS NULL AND paid_at IS NULL AND cancelled_at IS NULL)
  OR (status = 4 AND finalized_at IS NOT NULL AND published_at IS NOT NULL AND published_by_user_id IS NOT NULL AND paid_at IS NULL AND cancelled_at IS NULL)
  OR (status = 5 AND finalized_at IS NOT NULL AND published_at IS NOT NULL AND paid_at IS NOT NULL AND paid_by_user_id IS NOT NULL AND cancelled_at IS NULL)
  OR (status = 0 AND cancelled_at IS NOT NULL AND finalized_at IS NULL)
);
-- Reopen ⇒ reason
ALTER TABLE payroll_runs ADD CONSTRAINT payroll_runs_reopen_chk CHECK (
  (reopen_count = 0 AND last_reopened_at IS NULL AND last_reopen_reason IS NULL)
  OR (reopen_count > 0 AND last_reopened_at IS NOT NULL AND last_reopened_by_user_id IS NOT NULL AND last_reopen_reason IS NOT NULL AND btrim(last_reopen_reason) <> '')
);
-- Period ထပ် ✖ (CANCELLED မပါ)
ALTER TABLE payroll_runs ADD CONSTRAINT payroll_runs_no_overlap
  EXCLUDE USING gist (company_id WITH =, daterange(period_start, period_end, '[]') WITH &&) WHERE (status <> 0);

-- ═══════════ payroll_entries ═══════════
ALTER TABLE payroll_entries ADD CONSTRAINT payroll_entries_amounts_chk CHECK (
  basic_salary_amount >= 0 AND gross_amount >= 0 AND deduction_amount >= 0
  AND net_amount = gross_amount - deduction_amount
  AND late_count >= 0 AND late_minutes >= 0 AND absent_days >= 0 AND unpaid_leave_days >= 0 AND scheduled_days >= 0
);

-- ═══════════ payroll_lines ═══════════
ALTER TABLE payroll_lines ADD CONSTRAINT payroll_lines_kind_chk   CHECK (kind IN (1, 2));
ALTER TABLE payroll_lines ADD CONSTRAINT payroll_lines_source_chk CHECK (source IN (1, 2));
ALTER TABLE payroll_lines ADD CONSTRAINT payroll_lines_amount_chk CHECK (amount >= 0 AND (auto_amount IS NULL OR auto_amount >= 0));
-- D-PAYR-05: AUTO ⇒ auto_amount ရှိ · ပြောင်းရင် reason + by · MANUAL ⇒ auto_amount မရှိ
ALTER TABLE payroll_lines ADD CONSTRAINT payroll_lines_override_chk CHECK (
  (source = 2 AND auto_amount IS NULL AND override_reason IS NULL AND override_by_user_id IS NULL)
  OR (source = 1 AND auto_amount IS NOT NULL AND amount = auto_amount AND override_reason IS NULL AND override_by_user_id IS NULL)
  OR (source = 1 AND auto_amount IS NOT NULL AND amount <> auto_amount AND override_reason IS NOT NULL AND btrim(override_reason) <> '' AND override_by_user_id IS NOT NULL)
);

-- ═══════════ payroll_attendance_items ═══════════
ALTER TABLE payroll_attendance_items ADD CONSTRAINT payroll_attendance_items_type_chk CHECK (item_type IN (1, 2, 3, 4, 5));
ALTER TABLE payroll_attendance_items ADD CONSTRAINT payroll_attendance_items_values_chk CHECK (
  auto_deduction_amount >= 0 AND deduction_amount >= 0
  AND (item_type NOT IN (1, 2) OR (minutes IS NOT NULL AND minutes > 0))
  AND (item_type NOT IN (3, 4, 5) OR (day_portion IS NOT NULL AND day_portion IN (0.5, 1)))
);
-- Type ⇔ ref: LATE / EARLY / ABSENT ⇒ exception · UNPAID_LEAVE ⇒ leave · LATE_TO_ABSENT ⇒ မရှိ
ALTER TABLE payroll_attendance_items ADD CONSTRAINT payroll_attendance_items_refs_chk CHECK (
  (item_type IN (1, 2, 3) AND attendance_exception_id IS NOT NULL AND leave_id IS NULL)
  OR (item_type = 4 AND leave_id IS NOT NULL AND attendance_exception_id IS NULL)
  OR (item_type = 5 AND attendance_exception_id IS NULL AND leave_id IS NULL)
);
CREATE UNIQUE INDEX payroll_attendance_items_one_per_exception
  ON payroll_attendance_items (payroll_entry_id, attendance_exception_id) WHERE attendance_exception_id IS NOT NULL;
ALTER TABLE payroll_attendance_items ADD CONSTRAINT payroll_attendance_items_override_chk CHECK (
  (deduction_amount = auto_deduction_amount AND override_reason IS NULL AND override_by_user_id IS NULL)
  OR (deduction_amount <> auto_deduction_amount AND override_reason IS NOT NULL AND btrim(override_reason) <> '' AND override_by_user_id IS NOT NULL)
);

-- ═══════════ payroll_entry_branch_allocations ═══════════
ALTER TABLE payroll_entry_branch_allocations ADD CONSTRAINT payroll_entry_branch_allocations_chk
  CHECK (ratio > 0 AND ratio <= 1 AND allocated_gross_amount >= 0 AND basis IN (1, 2, 3, 4));

-- ═══════════ employee_receivables / repayments ═══════════
ALTER TABLE employee_receivables ADD CONSTRAINT employee_receivables_kind_chk   CHECK (kind IN (1, 2));
ALTER TABLE employee_receivables ADD CONSTRAINT employee_receivables_status_chk CHECK (status IN (0, 1, 2));
ALTER TABLE employee_receivables ADD CONSTRAINT employee_receivables_amounts_chk
  CHECK (principal_amount > 0 AND (installment_amount IS NULL OR (installment_amount > 0 AND installment_amount <= principal_amount)));
ALTER TABLE employee_receivables ADD CONSTRAINT employee_receivables_settled_chk CHECK ((status = 2) = (settled_at IS NOT NULL));
ALTER TABLE employee_receivable_repayments ADD CONSTRAINT employee_receivable_repayments_amount_chk CHECK (amount > 0);
-- Payroll line XOR cash · payroll = run Mark paid မှာ INSERT (v1.2 — G b, D-PAYR-04) · cash = owner / admin လက်ထဲ, ဗီရို ✖ (owner C3 — Part 7 closing မပါ)
-- client_request_id (v1.2 — G b) = P5.RCV.03 / P5.RCV.05 Idempotency-Key · column UNIQUE (NULL ရ — payroll repayment / ဗီရို advance)
ALTER TABLE employee_receivable_repayments ADD CONSTRAINT employee_receivable_repayments_source_chk CHECK (
  (payroll_line_id IS NOT NULL AND received_at IS NULL AND received_by_user_id IS NULL)
  OR (payroll_line_id IS NULL AND received_at IS NOT NULL AND received_by_user_id IS NOT NULL)
);

-- ═══════════ branch_attendance_qr_tokens ═══════════
ALTER TABLE branch_attendance_qr_tokens ADD CONSTRAINT branch_attendance_qr_tokens_revoke_chk
  CHECK ((revoked_at IS NULL) = (revoked_by_user_id IS NULL));
CREATE UNIQUE INDEX branch_attendance_qr_tokens_one_active ON branch_attendance_qr_tokens (branch_id) WHERE revoked_at IS NULL;

-- ═══════════ attendance_records ═══════════
ALTER TABLE attendance_records ADD CONSTRAINT attendance_records_method_chk CHECK (method IN (1, 2));
ALTER TABLE attendance_records ADD CONSTRAINT attendance_records_clock_out_source_chk CHECK (clock_out_source IS NULL OR clock_out_source IN (1, 2, 3));
ALTER TABLE attendance_records ADD CONSTRAINT attendance_records_manual_reason_chk CHECK (manual_reason IS NULL OR manual_reason IN (1, 9));
ALTER TABLE attendance_records ADD CONSTRAINT attendance_records_time_chk
  CHECK ((clock_out_at IS NULL OR clock_out_at >= clock_in_at) AND late_minutes >= 0 AND early_leave_minutes >= 0);
ALTER TABLE attendance_records ADD CONSTRAINT attendance_records_business_date_chk
  CHECK (business_date = (clock_in_at AT TIME ZONE 'Asia/Yangon')::date);
-- D-ATT-01 / D-ATT-06: QR_GPS ⇒ token + GPS · MANUAL ⇒ reason + ထည့်သူ (OTHER ⇒ note)
ALTER TABLE attendance_records ADD CONSTRAINT attendance_records_method_fields_chk CHECK (
  (method = 1 AND qr_token_id IS NOT NULL AND clock_in_latitude IS NOT NULL AND clock_in_longitude IS NOT NULL AND clock_in_distance_meters IS NOT NULL
     AND manual_reason IS NULL AND entered_by_user_id IS NULL)
  OR
  (method = 2 AND manual_reason IS NOT NULL AND entered_by_user_id IS NOT NULL
     AND (manual_reason <> 9 OR (manual_note IS NOT NULL AND btrim(manual_note) <> '')))
);
-- clock_out ⇔ source
ALTER TABLE attendance_records ADD CONSTRAINT attendance_records_clock_out_pair_chk
  CHECK ((clock_out_at IS NULL) = (clock_out_source IS NULL));
-- D-ATT-05: correction ⇔ reason + by
ALTER TABLE attendance_records ADD CONSTRAINT attendance_records_correction_chk CHECK (
  (corrected_at IS NULL AND corrected_by_user_id IS NULL AND correction_reason IS NULL)
  OR (corrected_at IS NOT NULL AND corrected_by_user_id IS NOT NULL AND correction_reason IS NOT NULL AND btrim(correction_reason) <> '')
);
-- v1.2 G (a): void ⇔ by + reason (all-or-none · reason ဗလာ ✖) — row မဖျက် (D-DAT-05) · P5.ATR.06
ALTER TABLE attendance_records ADD CONSTRAINT attendance_records_void_chk CHECK (
  (voided_at IS NULL AND voided_by_user_id IS NULL AND void_reason IS NULL)
  OR (voided_at IS NOT NULL AND voided_by_user_id IS NOT NULL AND void_reason IS NOT NULL AND btrim(void_reason) <> '')
);
-- Employee ၁ ယောက် active (clock-out မလုပ်ရသေး) ၁ ခု — voided မပါ (v1.2 G a)
CREATE UNIQUE INDEX attendance_records_one_open ON attendance_records (employee_id) WHERE clock_out_at IS NULL AND voided_at IS NULL;
-- အချိန်ထပ် ✖ (branch မတူလည်း) — open record = ∞ · voided မပါ (v1.2 G a — void ပြီး မှန်တဲ့ record အသစ် ထည့်ရ)
ALTER TABLE attendance_records ADD CONSTRAINT attendance_records_no_overlap
  EXCLUDE USING gist (employee_id WITH =, tstzrange(clock_in_at, COALESCE(clock_out_at, 'infinity'::timestamptz), '[)') WITH &&) WHERE (voided_at IS NULL);
-- Manual count report (D-ATT-06)
CREATE INDEX attendance_records_manual ON attendance_records (employee_id, business_date) WHERE method = 2;

-- ═══════════ attendance_exceptions (D-ATT-03 auto · F-P5-05) ═══════════
ALTER TABLE attendance_exceptions ADD CONSTRAINT attendance_exceptions_type_chk   CHECK (exception_type IN (1, 2, 3, 4));
ALTER TABLE attendance_exceptions ADD CONSTRAINT attendance_exceptions_status_chk CHECK (status IN (0, 1, 2, 3, 4));
-- Type ⇔ ref
ALTER TABLE attendance_exceptions ADD CONSTRAINT attendance_exceptions_type_refs_chk CHECK (
  (exception_type IN (1, 2) AND schedule_shift_id IS NOT NULL AND attendance_record_id IS NOT NULL AND minutes IS NOT NULL AND minutes > 0)
  OR (exception_type = 3 AND schedule_shift_id IS NOT NULL AND attendance_record_id IS NULL AND minutes IS NULL)
  OR (exception_type = 4 AND attendance_record_id IS NOT NULL AND minutes IS NULL)
);
-- Status ⇔ resolution: OPEN = မရှိ · VOID / EXCUSED ⇒ reason · LEAVE ⇒ leave_id · ≠ OPEN ⇒ by + at
ALTER TABLE attendance_exceptions ADD CONSTRAINT attendance_exceptions_resolution_chk CHECK (
  (status = 1 AND resolved_by_user_id IS NULL AND resolved_at IS NULL AND resolution_reason IS NULL AND leave_id IS NULL)
  OR (status IN (0, 2) AND resolved_by_user_id IS NOT NULL AND resolved_at IS NOT NULL
      AND resolution_reason IS NOT NULL AND btrim(resolution_reason) <> '' AND leave_id IS NULL)
  OR (status = 3 AND resolved_by_user_id IS NOT NULL AND resolved_at IS NOT NULL AND leave_id IS NULL)
  OR (status = 4 AND resolved_by_user_id IS NOT NULL AND resolved_at IS NOT NULL AND leave_id IS NOT NULL)
);
-- Shift ၁ ခု type ၁ ခု ၁ ကြိမ် (VOID မပါ) · record ၁ ခု INCOMPLETE ၁ ကြိမ်
CREATE UNIQUE INDEX attendance_exceptions_one_per_shift
  ON attendance_exceptions (schedule_shift_id, exception_type) WHERE schedule_shift_id IS NOT NULL AND status <> 0;
CREATE UNIQUE INDEX attendance_exceptions_one_incomplete
  ON attendance_exceptions (attendance_record_id) WHERE exception_type = 4 AND status <> 0;
-- Admin "ဒီနေ့ / ဒီလ" list
CREATE INDEX attendance_exceptions_open ON attendance_exceptions (branch_id, business_date) WHERE status = 1;

-- ═══════════ App / Part 8 trigger က စစ်ရမယ့်ဟာ (cross-table) ═══════════
-- · payroll_lines.kind = category.kind · Σ EARNING = entry.gross · Σ DEDUCTION = entry.deduction · Σ allocation ratio = 1
-- · commission_result_lines EARN base = sale_items.line_total_amount (SERVICE, sale FINISHED, business_date ∈ period) · REVERSAL rate = original_line.rate
-- · commission_plan_tiers ကွက်လပ် ✖ (0 ကစ ဆက်တိုက်) · employee all-branch row နဲ့ branch row တစ်ချိန်တည်း ✖
-- · FINALIZED+ run ရဲ့ entries / lines / results / items UPDATE ✖ (reopen → DRAFT မှ) · PAID reopen ✖
-- · withdraw (P5.EPY.04 / P5.CPA.04 — v1.3 OPEN-40 b): "မသုံးရသေး" စစ် = app (assignment: FINALIZED / PUBLISHED / PAID run ရဲ့ commission_results မချိတ် · salary: နောက်ဆုံး finalize ပြီး period နောက်မှ စ)
--   အစဉ် = row ကို archive (archived_at / by / reason) အရင် → ပြီးမှ ရှေ့ row ရဲ့ effective_to ပြန်ချိတ် / row အသစ် (EXCLUDE = statement တိုင်း စစ် — DEFERRABLE မဟုတ်) · archived row = history ပဲ — commission / payroll တွက်ချက်မှုထဲ မပါ
-- · repayment Σ ≤ principal · SETTLED ⇔ balance 0 · run **Mark paid** မှာ ADVANCE / LOAN line (amount > 0) → repayments INSERT (v1.2 — G b, D-PAYR-04; FINALIZE ✖ — reopen မှာ ငွေ row မဖျက်)
-- · cash repayment (P5.RCV.05) = owner / admin လက်ထဲ (received_by = caller) — ဗီရို ✖, closing expected cash မပါ (owner C3) · client_request_id = Idempotency-Key (v1.2)
-- · attendance void (P5.ATR.06 — v1.2 G a): voided record ⇒ hours / allocation / detect မပါ · LATE / EARLY / INCOMPLETE exception → VOID · ABSENT ပြန်စစ် · ကိုယ့် record ✖ (owner C11)
-- · attendance QR_GPS: session user = employee.user (colleague ✖ — D-ATT-06) · distance ≤ branches.location_radius_meters (gps_required setting) · token active + branch ကိုက်
-- · exception detect: LATE = clock-in vs shift.starts_at · ABSENT = shift ဆုံးပြီး record / leave (PENDING / APPROVED) မရှိ (ညနေ job) · INCOMPLETE = clock_out NULL နေ့ကုန်
-- · payroll calculate = exceptions OPEN / CONFIRMED (period) + leaves unpaid APPROVED → payroll_attendance_items · OPEN ကျန် = သတိပေး · payslip item ⇒ exception ရဲ့ business_date = item_date
