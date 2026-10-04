-- Point Barbershop — Part 7 v1 (🔒 D-DB-11) · Finance / Daily closing / P&L · DBML မှာ ရေးလို့မရတဲ့ constraint
-- v1.1 (02/Oct/2026 — G (owner one-sheet 02/Oct 00:06) · G (d)) = DB Part 7 v1.1: cash_outs_cancel_chk + cash_returns_cancel_chk (owner E5 — all-or-none)
--      · expenses / manual_incomes.client_request_id (uuid UNIQUE NULL — DBML column unique) · comment: closing = cancelled ✖ · cash manual income PENDING + APPROVED (owner E7) · P&L = APPROVED
-- v1.2 (02/Oct/2026 — owner "OPEN-40 OK" · OPEN-40 (a) = B · review §0.9) = DB Part 7 v1.2 (🔒 D-DB-11 v1.2): payroll reopen ↔ salary expense (source 3) = soft delete, hard delete ✖ (D-DAT-05)
--      · expenses_source_refs_chk ပြန်ရေး: source 3 ⇒ (payroll_entry_branch_allocation_id IS NOT NULL OR deleted_at IS NOT NULL) — allocation NULL ကို soft delete ဖြစ်ပြီးသား row မှာပဲ ခွင့်ပြု
--      · FK expenses.payroll_entry_branch_allocation_id → payroll_entry_branch_allocations (id) = ON DELETE SET NULL — FK အားလုံးလို `_generated-tables-part1-8.sql` ထဲမှာ
--        (source = part7-finance-closing-v1.2.dbml ရဲ့ `Ref: … [delete: set null]`; ဒီဖိုင်မှာ ထပ်မရေး — FK ကို နေရာတစ်ခုတည်းက ထုတ်) · constraint နာမည် = expenses_payroll_entry_branch_allocation_id_fkey (မပြောင်း)
--      · expenses_one_per_allocation / expenses_deleted_chk မပြောင်း · column အသစ် မရှိ

-- ═══════════ Future FK ပြေ ═══════════
ALTER TABLE employee_receivables ADD CONSTRAINT employee_receivables_cash_out_fk FOREIGN KEY (cash_out_id) REFERENCES cash_outs (id);   -- Part 5
CREATE UNIQUE INDEX employee_receivables_one_per_cash_out ON employee_receivables (cash_out_id) WHERE cash_out_id IS NOT NULL;

-- ═══════════ categories ═══════════
ALTER TABLE expense_categories ADD CONSTRAINT expense_categories_status_chk CHECK (status IN (0, 1));
ALTER TABLE expense_categories ADD CONSTRAINT expense_categories_system_chk
  CHECK (system_code IS NULL OR (system_code IN (1, 2, 3) AND archived_at IS NULL));
CREATE UNIQUE INDEX expense_categories_system_uq   ON expense_categories (company_id, system_code) WHERE system_code IS NOT NULL;
CREATE UNIQUE INDEX expense_categories_name_active ON expense_categories (company_id, name_mm) WHERE archived_at IS NULL;
ALTER TABLE income_categories ADD CONSTRAINT income_categories_status_chk CHECK (status IN (0, 1));
CREATE UNIQUE INDEX income_categories_name_active ON income_categories (company_id, name_mm) WHERE archived_at IS NULL;

-- ═══════════ expenses ═══════════
ALTER TABLE expenses ADD CONSTRAINT expenses_source_chk   CHECK (source BETWEEN 1 AND 6);
ALTER TABLE expenses ADD CONSTRAINT expenses_status_chk   CHECK (status IN (1, 2, 3));
ALTER TABLE expenses ADD CONSTRAINT expenses_paid_via_chk CHECK (paid_via IS NULL OR paid_via IN (1, 2, 3));
-- Source ⇔ ref ⇔ sign (OPEN-25 reversal = အနုတ်)
-- v1.2 OPEN-40 (a): source 3 PAYROLL ⇒ allocation ရှိ (live row — မဖြစ်မနေ) ဒါမှမဟုတ် deleted_at ရှိ (payroll reopen ကြောင့် soft delete ဖြစ်ပြီး allocation ဖျက်ခံရတဲ့ row — FK ON DELETE SET NULL)
--   IS NOT NULL ၂ ခုလုံး = boolean အတိအကျ (NULL မထွက် — §6.5 #13) · soft delete မလုပ်ရသေးတဲ့ expense ရဲ့ allocation ဖျက်ရင် SET NULL ⇒ ဒီ CHECK က ပယ် (delete statement တစ်ခုလုံး fail)
ALTER TABLE expenses ADD CONSTRAINT expenses_source_refs_chk CHECK (
  (source = 1 AND amount > 0 AND paid_via IS NOT NULL
     AND cash_out_id IS NULL AND payroll_entry_branch_allocation_id IS NULL AND purchase_id IS NULL AND original_expense_id IS NULL AND cash_return_id IS NULL)
  OR (source IN (2, 5) AND amount > 0 AND cash_out_id IS NOT NULL AND paid_via IS NULL
     AND payroll_entry_branch_allocation_id IS NULL AND purchase_id IS NULL AND original_expense_id IS NULL AND cash_return_id IS NULL)
  OR (source = 3 AND amount > 0 AND (payroll_entry_branch_allocation_id IS NOT NULL OR deleted_at IS NOT NULL) AND paid_via IS NULL
     AND cash_out_id IS NULL AND purchase_id IS NULL AND original_expense_id IS NULL AND cash_return_id IS NULL)
  OR (source = 4 AND amount > 0 AND purchase_id IS NOT NULL AND branch_id IS NOT NULL AND paid_via IS NULL
     AND cash_out_id IS NULL AND payroll_entry_branch_allocation_id IS NULL AND original_expense_id IS NULL AND cash_return_id IS NULL)
  OR (source = 6 AND amount < 0 AND original_expense_id IS NOT NULL AND cash_return_id IS NOT NULL AND paid_via IS NULL
     AND cash_out_id IS NULL AND payroll_entry_branch_allocation_id IS NULL AND purchase_id IS NULL)
);
-- D-FIN-03: status ⇔ approval field · REJECTED ⇒ reason · AUTO source ⇒ APPROVED
ALTER TABLE expenses ADD CONSTRAINT expenses_status_fields_chk CHECK (
  (status = 1 AND approved_by_user_id IS NULL AND approved_at IS NULL AND rejection_reason IS NULL AND source = 1)
  OR (status = 2 AND approved_by_user_id IS NOT NULL AND approved_at IS NOT NULL AND rejection_reason IS NULL)
  OR (status = 3 AND approved_by_user_id IS NOT NULL AND approved_at IS NOT NULL AND rejection_reason IS NOT NULL AND btrim(rejection_reason) <> '' AND source = 1)
);
-- Soft delete ⇔ reason + by
ALTER TABLE expenses ADD CONSTRAINT expenses_deleted_chk CHECK (
  (deleted_at IS NULL AND deleted_by_user_id IS NULL AND deletion_reason IS NULL)
  OR (deleted_at IS NOT NULL AND deleted_by_user_id IS NOT NULL AND deletion_reason IS NOT NULL AND btrim(deletion_reason) <> '')
);
-- Cash out ၁ ခု expense ၁ ခု · allocation ၁ ခု expense ၁ ခု · purchase × branch ၁ ခု · cash return ၁ ခု reversal ၁ ခု
-- (v1.2 OPEN-40 a: expenses_one_per_allocation = deleted ✖ + allocation NULL ✖ ⇒ reopen ပြီး finalize ပြန်ရင် allocation အသစ်အတွက် row အသစ် ရ — index မပြောင်း)
CREATE UNIQUE INDEX expenses_one_per_cash_out    ON expenses (cash_out_id) WHERE cash_out_id IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX expenses_one_per_allocation  ON expenses (payroll_entry_branch_allocation_id) WHERE payroll_entry_branch_allocation_id IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX expenses_one_per_purchase_br ON expenses (purchase_id, branch_id) WHERE purchase_id IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX expenses_one_per_cash_return ON expenses (cash_return_id) WHERE cash_return_id IS NOT NULL AND deleted_at IS NULL;
-- client_request_id (v1.1 G d) = P7.EXP.03 Idempotency-Key · column UNIQUE (NULL = auto source)
-- P&L (APPROVED, deleted ✖)
CREATE INDEX expenses_pnl ON expenses (company_id, expense_date, branch_id) WHERE status = 2 AND deleted_at IS NULL;

-- ═══════════ manual_incomes ═══════════
ALTER TABLE manual_incomes ADD CONSTRAINT manual_incomes_amount_chk CHECK (amount > 0);
ALTER TABLE manual_incomes ADD CONSTRAINT manual_incomes_status_chk CHECK (status IN (1, 2, 3));
ALTER TABLE manual_incomes ADD CONSTRAINT manual_incomes_status_fields_chk CHECK (
  (status = 1 AND approved_by_user_id IS NULL AND approved_at IS NULL AND rejection_reason IS NULL)
  OR (status = 2 AND approved_by_user_id IS NOT NULL AND approved_at IS NOT NULL AND rejection_reason IS NULL)
  OR (status = 3 AND approved_by_user_id IS NOT NULL AND approved_at IS NOT NULL AND rejection_reason IS NOT NULL AND btrim(rejection_reason) <> '')
);
ALTER TABLE manual_incomes ADD CONSTRAINT manual_incomes_deleted_chk CHECK (
  (deleted_at IS NULL AND deleted_by_user_id IS NULL AND deletion_reason IS NULL)
  OR (deleted_at IS NOT NULL AND deleted_by_user_id IS NOT NULL AND deletion_reason IS NOT NULL AND btrim(deletion_reason) <> '')
);
-- P&L = APPROVED ပဲ · expected cash = cash + PENDING / APPROVED (owner E7 — app) · client_request_id (v1.1 G d) = P7.INC.03 Idempotency-Key (column UNIQUE)
CREATE INDEX manual_incomes_pnl ON manual_incomes (company_id, income_date, branch_id) WHERE status = 2 AND deleted_at IS NULL;

-- ═══════════ cash_out_reasons (D-FIN-08) ═══════════
ALTER TABLE cash_out_reasons ADD CONSTRAINT cash_out_reasons_type_chk   CHECK (accounting_type IN (1, 2, 3, 4));
ALTER TABLE cash_out_reasons ADD CONSTRAINT cash_out_reasons_status_chk CHECK (status IN (0, 1));
-- EXPENSE / MUST_RETURN ⇒ category · EMPLOYEE_BALANCE ⇒ receivable kind · CASH_MOVEMENT ⇒ ဘာမှ
ALTER TABLE cash_out_reasons ADD CONSTRAINT cash_out_reasons_type_fields_chk CHECK (
  (accounting_type IN (1, 4) AND expense_category_id IS NOT NULL AND receivable_kind IS NULL)
  OR (accounting_type = 2 AND receivable_kind IS NOT NULL AND receivable_kind IN (1, 2) AND expense_category_id IS NULL)
  OR (accounting_type = 3 AND expense_category_id IS NULL AND receivable_kind IS NULL)
);
CREATE UNIQUE INDEX cash_out_reasons_name_active ON cash_out_reasons (company_id, name_mm) WHERE archived_at IS NULL;

-- ═══════════ cash_outs (D-FIN-07) ═══════════
ALTER TABLE cash_outs ADD CONSTRAINT cash_outs_type_chk   CHECK (accounting_type IN (1, 2, 3, 4));
ALTER TABLE cash_outs ADD CONSTRAINT cash_outs_amount_chk CHECK (amount > 0);
ALTER TABLE cash_outs ADD CONSTRAINT cash_outs_business_date_chk
  CHECK (business_date = (occurred_at AT TIME ZONE 'Asia/Yangon')::date);
-- Type ⇔ field: MUST_RETURN ⇒ ယူသူ (user / name) · EMPLOYEE_BALANCE ⇒ employee · တခြား ⇒ မရှိ
ALTER TABLE cash_outs ADD CONSTRAINT cash_outs_type_fields_chk CHECK (
  (accounting_type = 4 AND (taken_by_user_id IS NOT NULL OR (taken_by_name IS NOT NULL AND btrim(taken_by_name) <> '')) AND employee_id IS NULL)
  OR (accounting_type = 2 AND employee_id IS NOT NULL AND taken_by_user_id IS NULL AND taken_by_name IS NULL
      AND expected_return_date IS NULL AND converted_expense_at IS NULL AND settled_at IS NULL)
  OR (accounting_type IN (1, 3) AND employee_id IS NULL AND taken_by_user_id IS NULL AND taken_by_name IS NULL
      AND expected_return_date IS NULL AND converted_expense_at IS NULL AND settled_at IS NULL)
);

-- v1.1 G (d) — owner E5: cancel ⇔ by + reason (all-or-none · reason ဗလာ ✖) — row မဖျက် (D-DAT-05) · P7.CSO.06
ALTER TABLE cash_outs ADD CONSTRAINT cash_outs_cancel_chk CHECK (
  (cancelled_at IS NULL AND cancelled_by_user_id IS NULL AND cancel_reason IS NULL)
  OR (cancelled_at IS NOT NULL AND cancelled_by_user_id IS NOT NULL AND cancel_reason IS NOT NULL AND btrim(cancel_reason) <> '')
);

-- ═══════════ cash_returns (D-FIN-09) ═══════════
ALTER TABLE cash_returns ADD CONSTRAINT cash_returns_amount_chk CHECK (amount > 0);
ALTER TABLE cash_returns ADD CONSTRAINT cash_returns_business_date_chk
  CHECK (business_date = (returned_at AT TIME ZONE 'Asia/Yangon')::date);
-- v1.1 G (d) — owner E5: cancel ⇔ by + reason (all-or-none) · P7.CRT.03 (reversal expense soft delete = app)
ALTER TABLE cash_returns ADD CONSTRAINT cash_returns_cancel_chk CHECK (
  (cancelled_at IS NULL AND cancelled_by_user_id IS NULL AND cancel_reason IS NULL)
  OR (cancelled_at IS NOT NULL AND cancelled_by_user_id IS NOT NULL AND cancel_reason IS NOT NULL AND btrim(cancel_reason) <> '')
);

-- ═══════════ daily_closings (D-FIN-06 v5.1) ═══════════
ALTER TABLE daily_closings ADD CONSTRAINT daily_closings_status_chk CHECK (status IN (1, 2));
ALTER TABLE daily_closings ADD CONSTRAINT daily_closings_amounts_chk CHECK (
  opening_cash_amount >= 0 AND cash_sales_amount >= 0 AND cash_refunds_amount >= 0 AND cash_outs_amount >= 0
  AND cash_returns_amount >= 0 AND cash_manual_incomes_amount >= 0 AND noncash_expected_amount >= 0 AND noncash_verified_amount >= 0
  AND noncash_verified_amount <= noncash_expected_amount AND unverified_payment_count >= 0
  AND (counted_cash_amount IS NULL OR counted_cash_amount >= 0)
);
-- REC-17: expected = opening + sales − refunds − outs + returns + manual income
ALTER TABLE daily_closings ADD CONSTRAINT daily_closings_expected_chk CHECK (
  expected_cash_amount = opening_cash_amount + cash_sales_amount - cash_refunds_amount - cash_outs_amount + cash_returns_amount + cash_manual_incomes_amount
);
ALTER TABLE daily_closings ADD COLUMN cash_difference_amount bigint
  GENERATED ALWAYS AS (counted_cash_amount - expected_cash_amount) STORED;
-- Opening ≠ မနေ့ counted ⇒ reason (OPEN-05 A)
ALTER TABLE daily_closings ADD CONSTRAINT daily_closings_opening_chk CHECK (
  previous_closing_counted_amount IS NULL
  OR previous_closing_counted_amount = opening_cash_amount
  OR (opening_difference_reason IS NOT NULL AND btrim(opening_difference_reason) <> '')
);
-- CLOSED ⇒ counted + by + at · difference ≠ 0 ⇒ reason · unverified > 0 ⇒ reason (D-PAY-02 v5.1)
ALTER TABLE daily_closings ADD CONSTRAINT daily_closings_status_fields_chk CHECK (
  (status = 1 AND closed_at IS NULL AND closed_by_user_id IS NULL)
  OR (status = 2 AND closed_at IS NOT NULL AND closed_by_user_id IS NOT NULL AND counted_cash_amount IS NOT NULL
      AND (counted_cash_amount = expected_cash_amount OR (cash_difference_reason IS NOT NULL AND btrim(cash_difference_reason) <> ''))
      AND (unverified_payment_count = 0 OR (unverified_reason IS NOT NULL AND btrim(unverified_reason) <> '')))
);
ALTER TABLE daily_closings ADD CONSTRAINT daily_closings_reopen_chk CHECK (
  (reopen_count = 0 AND last_reopened_at IS NULL AND last_reopen_reason IS NULL)
  OR (reopen_count > 0 AND last_reopened_at IS NOT NULL AND last_reopened_by_user_id IS NOT NULL AND last_reopen_reason IS NOT NULL AND btrim(last_reopen_reason) <> '')
);

-- ═══════════ App / Part 8 trigger က စစ်ရမယ့်ဟာ (cross-table) ═══════════
-- · cash_out.accounting_type = reason.accounting_type (snapshot) · EXPENSE ⇒ expenses (source 2, category = reason.category) same tx · EMPLOYEE_BALANCE ⇒ employee_receivables (kind = reason.receivable_kind, cash_out_id)
-- · cash_return.cash_out = MUST_RETURN (cancelled ✖) · Σ active returns ≤ amount · Σ = amount ⇒ settled_at · မူလ converted ⇒ expenses REVERSAL (source 6, −amount, category တူ, original = source 5 expense)
-- · လကုန် job: MUST_RETURN outstanding (settled ✖ · cancelled ✖ · Σ active returns) ⇒ expenses source 5 (expense_date = လကုန်) + converted_expense_at
-- · cancel (v1.1 — owner E5, DayLock open): cash out = active return ရှိ / converted ⇒ ✖ · EXPENSE ⇒ linked expense soft delete · EMPLOYEE_BALANCE ⇒ Receivables.cancelForCashOut (Part 5)
--   cash return cancel ⇒ reversal expense soft delete + cash_out.settled_at NULL (outstanding ပြန်ဖြစ်ရင်) · cancelled row = expected cash / outstanding / လကုန် job ထဲ မပါ
-- · payroll REOPEN (v1.2 OPEN-40 a — Expenses.removePayroll(run, actor, reason), same tx): (1) run ရဲ့ source-3 expense တိုင်း soft delete (deleted_at = now · deleted_by_user_id = actor · deletion_reason = "Payroll reopened — <reason>")
--   (2) ပြီးမှ Part 5 က payroll_entry_branch_allocations ဖျက် (🔒 F-P5-09) — FK က expense ရဲ့ allocation id ကို NULL လုပ်, row ကျန် (Finance list မှာ "Payroll reopened" နဲ့ မြင်ရ) · အစဉ် ပြောင်းရင် DB က ပယ် (CHECK)
--   (3) finalize ပြန်လုပ် ⇒ allocation အသစ် + expense row အသစ် (Expenses.postPayroll) · allocation NULL ဖြစ်သွားတဲ့ row ကို un-delete လုပ်လို့ မရ (CHECK)
-- · payroll FINALIZE ⇒ allocation တိုင်း expenses source 3 (category SALARY, amount = allocated_gross, expense_date = period_end) · purchase POSTED ⇒ (purchase, branch) တိုင်း source 4 (category PRODUCT_PURCHASE)
-- · MANUAL admin ⇒ APPROVED (approved_by = self) · non-admin ⇒ PENDING → noti approver · APPROVED ပြင် ✖ (delete + အသစ်)
-- · daily_closing snapshot column = CLOSE ချိန် တွက် (payments is_cash / non-cash, refunds, cash_outs + cash_returns (cancelled ✖ — v1.1), manual_incomes cash PENDING + APPROVED (owner E7) — branch + business_date) · previous_closing_counted = မနေ့ CLOSED counted
-- · CLOSED ⇒ ဒီ branch-date: late entry / cash out / cash return / cash manual income ✖ — reopen (admin) မှ · KBZPay verify = ပိတ်ပြီးလည်း ရ (owner E3 — snapshot မပြောင်း) · |difference| > tolerance setting ⇒ admin noti
-- · manual_incomes cash ⇒ branch_id NOT NULL (drawer) · P&L view: revenue (sales FINISHED SERVICE / PRODUCT / TRANSPORT lines) + manual_incomes (APPROVED ပဲ) − expenses (APPROVED, deleted ✖, reversal −) by branch / company-wide
