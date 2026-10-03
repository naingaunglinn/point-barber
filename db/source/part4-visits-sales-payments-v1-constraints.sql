-- Point Barbershop — Part 4 v1 (🔒 D-DB-08) · Visits / Sales / Payments · DBML မှာ ရေးလို့မရတဲ့ constraint
-- v1.1 (30/Sep — Part 7 ဆွဲချိန် audit): discount_codes / discount_requests value CHECK မှာ NULL ကျော်တာ ပြင် (percent / amount NULL ဆို CHECK ကျော်နေခဲ့ — IS NOT NULL ထပ်ထည့်) · schema မပြောင်း
-- v1.2 (02/Oct/2026 — G (owner one-sheet 02/Oct 00:06) · owner G (f)): FINISH ပြီး row ကို DB trigger နဲ့ ထပ်ကာ (🔒 D-VIS-08 · API Part 4 P4-RULE-01) —
--      sales_finished_guard · sale_items_finished_guard · payments_finished_guard · visits_final_guard → SQLSTATE P0001 `finished_immutable` (API 423 `locked`)
--      schema မပြောင်း (DBML = header note ပဲ) · ခွင့်ပြုထားတဲ့ ပြင်ချက် = owner B10 (customer / KBZPay ref) + E3 (verify) ပဲ

-- ═══════════ visits ═══════════
ALTER TABLE visits ADD CONSTRAINT visits_status_chk        CHECK (status IN (0, 1, 2, 3));     -- 0 INCOMPLETE · 1 STARTED · 2 COMPLETED · 3 FINISHED
ALTER TABLE visits ADD CONSTRAINT visits_location_chk      CHECK (location_type IN (1, 2));
ALTER TABLE visits ADD CONSTRAINT visits_proxy_reason_chk  CHECK (proxy_reason IS NULL OR proxy_reason IN (1, 2));
ALTER TABLE visits ADD CONSTRAINT visits_late_reason_chk   CHECK (late_entry_reason IS NULL OR late_entry_reason IN (1, 2, 3, 4, 9));
-- D-SVC-06: HOME ⇒ လိပ်စာ
ALTER TABLE visits ADD CONSTRAINT visits_home_chk
  CHECK ((location_type = 2 AND home_address IS NOT NULL AND btrim(home_address) <> '') OR (location_type = 1 AND home_address IS NULL));
-- D-VIS-13: late entry ⇔ reason · OTHER ⇒ note
ALTER TABLE visits ADD CONSTRAINT visits_late_entry_chk
  CHECK (is_late_entry = (late_entry_reason IS NOT NULL) AND (late_entry_reason IS DISTINCT FROM 9 OR late_entry_note IS NOT NULL));
-- အချိန် အစဉ် + status ⇔ timestamp (D-VIS-03 / 07 / 09)
ALTER TABLE visits ADD CONSTRAINT visits_time_order_chk
  CHECK ((completed_at IS NULL OR completed_at >= started_at) AND (finished_at IS NULL OR finished_at >= completed_at));
ALTER TABLE visits ADD CONSTRAINT visits_status_fields_chk CHECK (
  (status = 1 AND completed_at IS NULL AND finished_at IS NULL AND incomplete_at IS NULL)
  OR (status = 2 AND completed_at IS NOT NULL AND completed_by_user_id IS NOT NULL AND finished_at IS NULL AND incomplete_at IS NULL)
  OR (status = 3 AND completed_at IS NOT NULL AND completed_by_user_id IS NOT NULL AND finished_at IS NOT NULL AND incomplete_at IS NULL)
  OR (status = 0 AND finished_at IS NULL AND incomplete_at IS NOT NULL AND incomplete_by_user_id IS NOT NULL
      AND incomplete_reason IS NOT NULL AND btrim(incomplete_reason) <> '')
);
-- D-PLT-15
ALTER TABLE visits ADD CONSTRAINT visits_business_date_chk
  CHECK (business_date = (started_at AT TIME ZONE 'Asia/Yangon')::date);
-- Booking ၁ ခု = visit ၁ ခု (INCOMPLETE ဖြစ်သွားရင်လည်း ပြန်မစ — booking က STARTED ဖြစ်ပြီးသား)
CREATE UNIQUE INDEX visits_one_per_booking ON visits (booking_id) WHERE booking_id IS NOT NULL;
-- Dashboard "current" (D-DSH-03) — ဖွင့်ထားတဲ့ visit ပဲ
CREATE INDEX visits_open_by_employee ON visits (performed_by_employee_id) WHERE status IN (1, 2);

-- ═══════════ sales ═══════════
ALTER TABLE sales ADD CONSTRAINT sales_status_chk CHECK (status IN (0, 1, 2));   -- 0 CANCELLED · 1 OPEN · 2 FINISHED
ALTER TABLE sales ADD CONSTRAINT sales_amounts_chk CHECK (
  subtotal_amount >= 0 AND discount_amount >= 0 AND service_charge_amount >= 0 AND tax_amount >= 0 AND total_amount >= 0
  AND service_charge_rate BETWEEN 0 AND 100 AND tax_rate BETWEEN 0 AND 100
  AND discount_amount <= subtotal_amount
  AND total_amount = subtotal_amount - discount_amount + service_charge_amount + tax_amount
);
-- D-PAY-04: code XOR request · discount > 0 ⇒ တစ်ခုခု ရှိ
ALTER TABLE sales ADD CONSTRAINT sales_discount_source_chk CHECK (
  NOT (discount_code_id IS NOT NULL AND discount_request_id IS NOT NULL)
  AND (discount_amount = 0 OR discount_code_id IS NOT NULL OR discount_request_id IS NOT NULL)
);
-- D-PAY-06 / D-VIS-07: FINISHED ⇔ receipt + finished + business_date · CANCELLED ⇔ cancelled_at
ALTER TABLE sales ADD CONSTRAINT sales_receipt_number_chk
  CHECK (receipt_number IS NULL OR receipt_number ~ '^[A-Za-z0-9]+-[0-9]{4}-(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)-[0-9]{5,}$');
ALTER TABLE sales ADD CONSTRAINT sales_receipt_month_chk CHECK (receipt_month IS NULL OR receipt_month BETWEEN 1 AND 12);
ALTER TABLE sales ADD CONSTRAINT sales_status_fields_chk CHECK (
  (status = 2 AND receipt_number IS NOT NULL AND receipt_year IS NOT NULL AND receipt_month IS NOT NULL AND receipt_seq IS NOT NULL
     AND finished_at IS NOT NULL AND finished_by_user_id IS NOT NULL AND business_date IS NOT NULL AND cancelled_at IS NULL)
  OR (status = 1 AND receipt_number IS NULL AND receipt_seq IS NULL AND finished_at IS NULL AND business_date IS NULL AND cancelled_at IS NULL)
  OR (status = 0 AND receipt_number IS NULL AND receipt_seq IS NULL AND finished_at IS NULL AND cancelled_at IS NOT NULL)
);
ALTER TABLE sales ADD CONSTRAINT sales_business_date_chk
  CHECK (finished_at IS NULL OR business_date = (finished_at AT TIME ZONE 'Asia/Yangon')::date);
-- ဝင်ငွေ report / closing (FINISHED ပဲ)
CREATE INDEX sales_finished_by_branch_date ON sales (branch_id, business_date) WHERE status = 2;

-- ═══════════ sale_items ═══════════
ALTER TABLE sale_items ADD CONSTRAINT sale_items_line_type_chk CHECK (line_type IN (1, 2, 3));
ALTER TABLE sale_items ADD CONSTRAINT sale_items_amounts_chk
  CHECK (quantity > 0 AND list_price_amount >= 0 AND unit_price_amount >= 0 AND line_discount_amount >= 0
         AND line_discount_amount <= unit_price_amount * quantity);
-- line_type ⇒ ဘယ် ref လို (D-PAY-03, D-SVC-06, D-COM-03)
ALTER TABLE sale_items ADD CONSTRAINT sale_items_type_refs_chk CHECK (
  (line_type = 1 AND service_id IS NOT NULL AND product_id IS NULL AND performed_by_employee_id IS NOT NULL AND quantity = 1)
  OR (line_type = 2 AND product_id IS NOT NULL AND service_id IS NULL AND service_variant_id IS NULL AND booking_item_id IS NULL)
  OR (line_type = 3 AND service_id IS NULL AND service_variant_id IS NULL AND product_id IS NULL AND booking_item_id IS NULL
      AND performed_by_employee_id IS NULL AND quantity = 1 AND line_discount_amount = 0)
);
-- D-SVC-04: ဈေး ≠ list ⇒ override reason + by
ALTER TABLE sale_items ADD CONSTRAINT sale_items_override_chk CHECK (
  (unit_price_amount = list_price_amount AND price_override_reason IS NULL AND price_override_by_user_id IS NULL)
  OR (unit_price_amount <> list_price_amount AND price_override_reason IS NOT NULL AND btrim(price_override_reason) <> '' AND price_override_by_user_id IS NOT NULL)
);
-- D-VIS-05: removed ⇔ reason + by
ALTER TABLE sale_items ADD CONSTRAINT sale_items_removed_chk CHECK (
  (removed_at IS NULL AND removed_by_user_id IS NULL AND removed_reason IS NULL)
  OR (removed_at IS NOT NULL AND removed_by_user_id IS NOT NULL AND removed_reason IS NOT NULL AND btrim(removed_reason) <> '')
);
-- D-SVC-05: variant က ဒီ service ရဲ့ဟာပဲ (Part 2 service_variants (id, service_id) unique)
ALTER TABLE sale_items ADD CONSTRAINT sale_items_variant_service_fk
  FOREIGN KEY (service_variant_id, service_id) REFERENCES service_variants (id, service_id);
-- line_total = unit × qty − discount (commission base — D-COM-02)
ALTER TABLE sale_items ADD COLUMN line_total_amount bigint
  GENERATED ALWAYS AS (unit_price_amount * quantity - line_discount_amount) STORED;

-- ═══════════ payment_methods ═══════════
ALTER TABLE payment_methods ADD CONSTRAINT payment_methods_kind_chk   CHECK (kind IN (1, 2, 3, 4));
ALTER TABLE payment_methods ADD CONSTRAINT payment_methods_status_chk CHECK (status IN (0, 1));
CREATE UNIQUE INDEX payment_methods_name_active ON payment_methods (company_id, name_mm) WHERE archived_at IS NULL;

-- ═══════════ payments ═══════════
ALTER TABLE payments ADD CONSTRAINT payments_amount_chk CHECK (amount > 0);
ALTER TABLE payments ADD CONSTRAINT payments_verified_pair_chk CHECK ((verified_at IS NULL) = (verified_by_user_id IS NULL));
ALTER TABLE payments ADD CONSTRAINT payments_void_chk CHECK (
  (voided_at IS NULL AND voided_by_user_id IS NULL AND void_reason IS NULL)
  OR (voided_at IS NOT NULL AND voided_by_user_id IS NOT NULL AND void_reason IS NOT NULL AND btrim(void_reason) <> '')
);
ALTER TABLE payments ADD CONSTRAINT payments_reference_not_blank_chk CHECK (external_reference IS NULL OR btrim(external_reference) <> '');
-- 🔒 D-PAY-02: reference ထပ် ✖ (method အလိုက် · voided မပါ)
CREATE UNIQUE INDEX payments_reference_unique
  ON payments (payment_method_id, external_reference) WHERE external_reference IS NOT NULL AND voided_at IS NULL;
-- D-PAY-02 v5.1: closing verify list
CREATE INDEX payments_unverified ON payments (payment_method_id, received_at) WHERE verified_at IS NULL AND voided_at IS NULL;

-- ═══════════ receipt_counters ═══════════
ALTER TABLE receipt_counters ADD CONSTRAINT receipt_counters_kind_chk  CHECK (kind IN (1, 2));
ALTER TABLE receipt_counters ADD CONSTRAINT receipt_counters_month_chk CHECK (receipt_month BETWEEN 1 AND 12);
ALTER TABLE receipt_counters ADD CONSTRAINT receipt_counters_seq_chk   CHECK (last_seq >= 0);

-- ═══════════ discount_codes ═══════════
ALTER TABLE discount_codes ADD CONSTRAINT discount_codes_type_chk   CHECK (discount_type IN (1, 2));
ALTER TABLE discount_codes ADD CONSTRAINT discount_codes_scope_chk  CHECK (scope_type IN (1, 2));
ALTER TABLE discount_codes ADD CONSTRAINT discount_codes_status_chk CHECK (status IN (0, 1));
ALTER TABLE discount_codes ADD CONSTRAINT discount_codes_value_chk CHECK (
  (discount_type = 1 AND discount_percent IS NOT NULL AND discount_percent BETWEEN 1 AND 100 AND discount_amount IS NULL)
  OR (discount_type = 2 AND discount_amount IS NOT NULL AND discount_amount > 0 AND discount_percent IS NULL)
);
ALTER TABLE discount_codes ADD CONSTRAINT discount_codes_code_upper_chk CHECK (code = upper(code) AND code ~ '^[A-Z0-9_-]{2,40}$');
ALTER TABLE discount_codes ADD CONSTRAINT discount_codes_dates_chk CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from);
ALTER TABLE discount_codes ADD CONSTRAINT discount_codes_max_uses_chk CHECK (max_uses IS NULL OR max_uses > 0);

-- ═══════════ discount_requests ═══════════
ALTER TABLE discount_requests ADD CONSTRAINT discount_requests_type_chk   CHECK (discount_type IN (1, 2));
ALTER TABLE discount_requests ADD CONSTRAINT discount_requests_status_chk CHECK (status IN (0, 1, 2, 3));
ALTER TABLE discount_requests ADD CONSTRAINT discount_requests_value_chk CHECK (
  (discount_type = 1 AND discount_percent IS NOT NULL AND discount_percent BETWEEN 1 AND 100 AND discount_amount IS NULL)
  OR (discount_type = 2 AND discount_amount IS NOT NULL AND discount_amount > 0 AND discount_percent IS NULL)
);
ALTER TABLE discount_requests ADD CONSTRAINT discount_requests_reason_chk CHECK (btrim(reason) <> '');
-- ဆုံးဖြတ်ချက် ⇔ ဆုံးဖြတ်သူ (APPROVED / REJECTED)
ALTER TABLE discount_requests ADD CONSTRAINT discount_requests_decision_chk CHECK (
  (status IN (2, 3) AND decided_by_user_id IS NOT NULL AND decided_at IS NOT NULL)
  OR (status IN (0, 1) AND decided_by_user_id IS NULL AND decided_at IS NULL)
);
-- Sale ၁ ခု PENDING ၁ ခုပဲ
CREATE UNIQUE INDEX discount_requests_one_pending ON discount_requests (sale_id) WHERE status = 1;

-- ═══════════ refunds ═══════════
ALTER TABLE refunds ADD CONSTRAINT refunds_kind_chk   CHECK (kind IN (1, 2));
ALTER TABLE refunds ADD CONSTRAINT refunds_amount_chk CHECK (amount > 0);
ALTER TABLE refunds ADD CONSTRAINT refunds_reason_chk CHECK (btrim(reason) <> '');
ALTER TABLE refunds ADD CONSTRAINT refunds_receipt_number_chk
  CHECK (refund_receipt_number ~ '^[A-Za-z0-9]+-RF-[0-9]{4}-(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)-[0-9]{5,}$');
ALTER TABLE refunds ADD CONSTRAINT refunds_receipt_month_chk CHECK (receipt_month BETWEEN 1 AND 12);
ALTER TABLE refunds ADD CONSTRAINT refunds_business_date_chk
  CHECK (business_date = (refunded_at AT TIME ZONE 'Asia/Yangon')::date);

-- ═══════════ refund_items ═══════════
ALTER TABLE refund_items ADD CONSTRAINT refund_items_amount_chk CHECK (quantity > 0 AND amount > 0);

-- ═══════════ sale_adjustments ═══════════
ALTER TABLE sale_adjustments ADD CONSTRAINT sale_adjustments_type_chk CHECK (adjustment_type IN (1, 2, 3, 9));
ALTER TABLE sale_adjustments ADD CONSTRAINT sale_adjustments_reason_chk CHECK (btrim(reason) <> '');
ALTER TABLE sale_adjustments ADD CONSTRAINT sale_adjustments_type_refs_chk CHECK (
  (adjustment_type = 1 AND payment_id IS NOT NULL AND new_payment_method_id IS NOT NULL AND sale_item_id IS NULL AND new_employee_id IS NULL)
  OR (adjustment_type = 2 AND sale_item_id IS NOT NULL AND new_employee_id IS NOT NULL AND payment_id IS NULL AND new_payment_method_id IS NULL)
  OR (adjustment_type = 3 AND payment_id IS NOT NULL AND new_employee_id IS NOT NULL AND sale_item_id IS NULL AND new_payment_method_id IS NULL)
  OR (adjustment_type = 9 AND payment_id IS NULL AND sale_item_id IS NULL AND new_payment_method_id IS NULL AND new_employee_id IS NULL)
);

-- ═══════════ FINISH ပြီး guard (v1.2 — owner G (f) · 🔒 D-VIS-08 · P4-RULE-01) ═══════════
-- Service က state အရင်စစ် (409 / 423) — trigger = ဒုတိယ နံရံ · ချိုးရင် RAISE SQLSTATE P0001 'finished_immutable' → API 423 `locked` (context.correction_path = refund · adjustment)
-- FINISHED / CANCELLED ပြီး ငွေ ပြင်ချင်ရင်: ပိုယူ = refunds · လျော့ယူ = ကွာငွေ sale အသစ် (P4-RULE-12) · method / barber / ငွေလက်ခံသူ = sale_adjustments ledger (P4-RULE-15)
-- FINISH transaction အစဉ် (P4-RULE-10): line / totals / payment ပြင်တာ အရင် → sale 1 → 2 → visit 2 → 3 (status ပြောင်းပြီးမှ line / payment ပြင်ရင် ဒီ trigger ပယ်)
-- Sale row lock = app (P4-RULE-10 lock order — sale FOR UPDATE အရင်) · trigger က status ကို plain read ပဲ (lock မယူ — deadlock ✖)
-- နောက် migration မှာ ပိတ်ပြီးသား row ကို backfill UPDATE လုပ်ရရင် = ဒီ trigger ကို migration transaction ထဲ ခဏ DISABLE / ENABLE (version note + audit)

-- sales: 0 CANCELLED / 2 FINISHED ⇒ customer_id + updated_at ပဲ ပြောင်းရ (owner B10 — P4.SAL.12 customer attach / replace / detach)
CREATE FUNCTION sales_finished_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IN (0, 2)
     AND (to_jsonb(NEW) - 'customer_id' - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'customer_id' - 'updated_at') THEN
    RAISE EXCEPTION 'finished_immutable' USING ERRCODE = 'P0001',
      DETAIL = format('sales %s (status %s) — customer_id ပဲ ပြင်ရ (owner B10)', OLD.id, OLD.status);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER sales_finished_guard BEFORE UPDATE ON sales
  FOR EACH ROW EXECUTE FUNCTION sales_finished_guard();

-- sale_items: sale 0 CANCELLED / 2 FINISHED ⇒ UPDATE / DELETE ✖ · line အသစ် INSERT ✖ (ကွာငွေ = sale အသစ် · refund = refund_items · barber ပြောင်း = sale_adjustments)
CREATE FUNCTION sale_items_finished_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_sale_id uuid;
  v_status smallint;
BEGIN
  FOREACH v_sale_id IN ARRAY CASE TG_OP WHEN 'INSERT' THEN ARRAY[NEW.sale_id]
                                         WHEN 'DELETE' THEN ARRAY[OLD.sale_id]
                                         ELSE ARRAY[OLD.sale_id, NEW.sale_id] END LOOP
    SELECT status INTO v_status FROM sales WHERE id = v_sale_id;
    IF v_status IN (0, 2) THEN
      RAISE EXCEPTION 'finished_immutable' USING ERRCODE = 'P0001',
        DETAIL = format('sale_items %s ✖ — sale %s (status %s)', TG_OP, v_sale_id, v_status);
    END IF;
  END LOOP;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER sale_items_finished_guard BEFORE INSERT OR UPDATE OR DELETE ON sale_items
  FOR EACH ROW EXECUTE FUNCTION sale_items_finished_guard();

-- payments: sale 2 FINISHED ⇒ verified_at / verified_by_user_id (E3 — P4.PAY.05 / 06) + external_reference (B10 — P4.PAY.07 · PAYMENT_METHOD adjustment ref) ပဲ · DELETE ✖
-- (payments မှာ updated_at column မရှိ · void / method / amount / collected_by ✖ — refund / sale_adjustments)
CREATE FUNCTION payments_finished_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM sales WHERE id IN (OLD.sale_id, NEW.sale_id) AND status = 2)
     AND (TG_OP = 'DELETE'
          OR (to_jsonb(NEW) - 'verified_at' - 'verified_by_user_id' - 'external_reference')
             IS DISTINCT FROM (to_jsonb(OLD) - 'verified_at' - 'verified_by_user_id' - 'external_reference')) THEN
    RAISE EXCEPTION 'finished_immutable' USING ERRCODE = 'P0001',
      DETAIL = format('payments %s %s — sale FINISHED (verify / reference ပဲ ပြင်ရ)', TG_OP, OLD.id);
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER payments_finished_guard BEFORE UPDATE OR DELETE ON payments
  FOR EACH ROW EXECUTE FUNCTION payments_finished_guard();

-- visits: 3 FINISHED / 0 INCOMPLETE ⇒ updated_at ပဲ ပြောင်းရ (barber ပြောင်း = PERFORMER adjustment · D-VIS-09 INCOMPLETE ပြန်မဖွင့်)
CREATE FUNCTION visits_final_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IN (0, 3)
     AND (to_jsonb(NEW) - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'updated_at') THEN
    RAISE EXCEPTION 'finished_immutable' USING ERRCODE = 'P0001',
      DETAIL = format('visits %s (status %s) — final', OLD.id, OLD.status);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER visits_final_guard BEFORE UPDATE ON visits
  FOR EACH ROW EXECUTE FUNCTION visits_final_guard();

-- ═══════════ App / Part 8 trigger က စစ်ရမယ့်ဟာ (DB CHECK နဲ့ မရ — cross-table) ═══════════
-- · sales.subtotal_amount = Σ active sale_items (unit × qty) · Σ line_discount = sales.discount_amount · Σ payments (voided မပါ) = total (FINISH မှာ)
-- · payments.external_reference ⇐ payment_methods.requires_reference · verify ⇐ requires_verification
-- · sale.visit_id NOT NULL ⇐ SERVICE line ရှိ · HOME visit ⇒ TRANSPORT_FEE line ၁ ခု · SERVICE line performed_by = visit.performed_by (V1)
-- · discount_code: ACTIVE · ရက်အတွင်း · branch scope · max_uses (code row FOR UPDATE) · once_per_customer ⇒ customer_id + customer_uses INSERT
-- · discount_request APPROVED ပဲ sale ကို ချိတ် · late entry ⇐ branch-day closing မပိတ်သေး (Part 7) · proxy_reason = 1 ⇐ B က payment
-- · booking.booked_employee_id ≠ visits.performed_by ⇒ performer_change_reason · refund ≤ ကျန်ငွေ
