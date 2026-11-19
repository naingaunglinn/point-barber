-- Part 4 v1 test (Part 1 + 1b + 2 + 3 + 4 တွဲ load ပြီး)
-- v1.2 (02/Oct/2026 — G (owner one-sheet 02/Oct 00:06) · G (f)): 59–82 = FINISH ပြီး guard trigger ၄ ခု (ခွင့်ပြု / ပယ် ၂ ဘက်)
SET client_min_messages = warning;
CREATE TEMP TABLE r (n serial, label text, expect text, got text);
CREATE FUNCTION t(label text, expect text, q text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE q;
    INSERT INTO r(label, expect, got) VALUES (label, expect, 'ok');
  EXCEPTION WHEN others THEN
    INSERT INTO r(label, expect, got) VALUES (label, expect, 'fail: ' || SQLERRM);
  END;
END $$;

-- ── seed (Part 1–3) ──
INSERT INTO companies (id, name_mm) VALUES ('00000000-0000-0000-0000-00000000c001', 'Point');
INSERT INTO branches (id, company_id, code, name_mm) VALUES
 ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000c001', 'B1', 'ဆိုင် ၁'),
 ('00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-00000000c001', 'B3', 'ဆိုင် ၃');
INSERT INTO users (id, email, status) VALUES
 ('00000000-0000-0000-0000-0000000000a1', 'aung@x.com', 1),
 ('00000000-0000-0000-0000-0000000000a2', 'min@x.com', 1),
 ('00000000-0000-0000-0000-0000000000a3', 'mgr@x.com', 1);
INSERT INTO employees (id, company_id, user_id, employee_code, name_mm) VALUES
 ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-0000000000a1', 'E1', 'ကိုအောင်'),
 ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-0000000000a2', 'E2', 'ကိုမင်း'),
 ('00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-0000000000a3', 'E3', 'Manager');
INSERT INTO service_categories (id, company_id, name_mm) VALUES ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000c001', 'ဆံပင်');
INSERT INTO services (id, company_id, category_id, name_mm, pricing_mode) VALUES
 ('00000000-0000-0000-0000-000000005001', '00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-0000000000c1', 'ဆံပင်ညှပ်', 1),
 ('00000000-0000-0000-0000-000000005002', '00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-0000000000c1', 'ဆိုးဆေး', 2);
INSERT INTO service_variants (id, service_id, variant_key) VALUES ('00000000-0000-0000-0000-000000007001', '00000000-0000-0000-0000-000000005002', 'ash|long');
INSERT INTO customers (id, company_id, name, phone, phone_normalized) VALUES
 ('00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-00000000c001', 'မမလှ', '09451234567', '+959451234567'),
 ('00000000-0000-0000-0000-00000000f002', '00000000-0000-0000-0000-00000000c001', 'ကိုကို', '09451234568', '+959451234568');
INSERT INTO bookings (id, branch_id, customer_id, customer_name, booked_employee_id, channel, starts_at, ends_at, block_starts_at, block_ends_at, business_date, manage_token_hash)
 VALUES ('00000000-0000-0000-0000-0000000b0001', '00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-00000000f001', 'မမလှ', '00000000-0000-0000-0000-0000000000e1', 1,
         '2026-10-10 10:00+06:30', '2026-10-10 10:30+06:30', '2026-10-10 10:00+06:30', '2026-10-10 10:35+06:30', '2026-10-10', 'tok1');
INSERT INTO payment_methods (id, company_id, code, name_mm, kind, is_cash, requires_reference, requires_verification) VALUES
 ('00000000-0000-0000-0000-00000000aa01', '00000000-0000-0000-0000-00000000c001', 'CASH',   'ငွေသား', 1, true,  false, false),
 ('00000000-0000-0000-0000-00000000aa02', '00000000-0000-0000-0000-00000000c001', 'KBZPAY', 'KBZPay', 2, false, true,  true);

-- ── Visit (D-VIS) ──
SELECT t('01 Walk-in START — barber + branch ပဲ (D-VIS-02 v5.1)', 'ok', $$INSERT INTO visits (id, client_request_id, branch_id, performed_by_employee_id, started_at, started_by_user_id, business_date)
  VALUES ('00000000-0000-0000-0000-0000000d0001', gen_random_uuid(), '00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000e1', '2026-10-10 09:00+06:30', '00000000-0000-0000-0000-0000000000a1', '2026-10-10')$$);
SELECT t('02 Double submit — client_request_id တူ (D-VIS-10)', 'fail', $$INSERT INTO visits (id, client_request_id, branch_id, performed_by_employee_id, started_at, started_by_user_id, business_date)
  SELECT gen_random_uuid(), client_request_id, branch_id, performed_by_employee_id, started_at, started_by_user_id, business_date FROM visits WHERE id = '00000000-0000-0000-0000-0000000d0001'$$);
SELECT t('03 Booking visit (ကိုမင်း က ကိုအောင် အတွက် မှတ် — proxy ဖုန်းမပါ)', 'ok', $$INSERT INTO visits (id, client_request_id, branch_id, booking_id, performed_by_employee_id, proxy_reason, started_at, started_by_user_id, business_date)
  VALUES ('00000000-0000-0000-0000-0000000d0002', gen_random_uuid(), '00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000b0001', '00000000-0000-0000-0000-0000000000e1', 1, '2026-10-10 10:02+06:30', '00000000-0000-0000-0000-0000000000a2', '2026-10-10')$$);
SELECT t('04 Booking တူ visit ၂ ခု', 'fail', $$INSERT INTO visits (id, client_request_id, branch_id, booking_id, performed_by_employee_id, started_at, started_by_user_id, business_date)
  VALUES (gen_random_uuid(), gen_random_uuid(), '00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000b0001', '00000000-0000-0000-0000-0000000000e1', '2026-10-10 10:05+06:30', '00000000-0000-0000-0000-0000000000a1', '2026-10-10')$$);
SELECT t('05 Late entry — reason မပါ (D-VIS-13)', 'fail', $$INSERT INTO visits (id, client_request_id, branch_id, performed_by_employee_id, started_at, started_by_user_id, business_date, is_late_entry)
  VALUES (gen_random_uuid(), gen_random_uuid(), '00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000e2', '2026-10-10 11:00+06:30', '00000000-0000-0000-0000-0000000000a2', '2026-10-10', true)$$);
SELECT t('06 Late entry — OTHER note မပါ', 'fail', $$INSERT INTO visits (id, client_request_id, branch_id, performed_by_employee_id, started_at, started_by_user_id, business_date, is_late_entry, late_entry_reason)
  VALUES (gen_random_uuid(), gen_random_uuid(), '00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000e2', '2026-10-10 11:00+06:30', '00000000-0000-0000-0000-0000000000a2', '2026-10-10', true, 9)$$);
SELECT t('07 Late entry — internet ပြတ် (started 11:00, recorded now)', 'ok', $$INSERT INTO visits (id, client_request_id, branch_id, performed_by_employee_id, started_at, started_by_user_id, business_date, is_late_entry, late_entry_reason)
  VALUES ('00000000-0000-0000-0000-0000000d0003', gen_random_uuid(), '00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000e2', '2026-10-10 11:00+06:30', '00000000-0000-0000-0000-0000000000a2', '2026-10-10', true, 1)$$);
SELECT t('08 HOME visit — လိပ်စာ မပါ (D-SVC-06)', 'fail', $$INSERT INTO visits (id, client_request_id, branch_id, performed_by_employee_id, location_type, started_at, started_by_user_id, business_date)
  VALUES (gen_random_uuid(), gen_random_uuid(), '00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000e2', 2, '2026-10-10 14:00+06:30', '00000000-0000-0000-0000-0000000000a2', '2026-10-10')$$);
SELECT t('09 COMPLETE — completed_by မပါ', 'fail', $$UPDATE visits SET status = 2, completed_at = '2026-10-10 09:30+06:30' WHERE id = '00000000-0000-0000-0000-0000000d0001'$$);
SELECT t('10 COMPLETE (D-VIS-03 Completed by)', 'ok', $$UPDATE visits SET status = 2, completed_at = '2026-10-10 09:30+06:30', completed_by_user_id = '00000000-0000-0000-0000-0000000000a1' WHERE id = '00000000-0000-0000-0000-0000000d0001'$$);
SELECT t('11 INCOMPLETE — reason မပါ (D-VIS-09)', 'fail', $$UPDATE visits SET status = 0, incomplete_at = now(), incomplete_by_user_id = '00000000-0000-0000-0000-0000000000a2' WHERE id = '00000000-0000-0000-0000-0000000d0003'$$);
SELECT t('12 INCOMPLETE + reason', 'ok', $$UPDATE visits SET status = 0, incomplete_at = now(), incomplete_by_user_id = '00000000-0000-0000-0000-0000000000a2', incomplete_reason = 'customer ထွက်သွား' WHERE id = '00000000-0000-0000-0000-0000000d0003'$$);
SELECT t('13 business_date မှား (UTC ရက်)', 'fail', $$INSERT INTO visits (id, client_request_id, branch_id, performed_by_employee_id, started_at, started_by_user_id, business_date)
  VALUES (gen_random_uuid(), gen_random_uuid(), '00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000e2', '2026-10-31 18:00+00', '00000000-0000-0000-0000-0000000000a2', '2026-10-31')$$);

-- ── Sale + lines ──
SELECT t('14 OPEN sale (visit 1)', 'ok', $$INSERT INTO sales (id, client_request_id, branch_id, visit_id) VALUES ('00000000-0000-0000-0000-00000000e001', gen_random_uuid(), '00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000d0001')$$);
SELECT t('15 Visit တူ sale ၂ ခု', 'fail', $$INSERT INTO sales (id, client_request_id, branch_id, visit_id) VALUES (gen_random_uuid(), gen_random_uuid(), '00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000d0001')$$);
SELECT t('16 SERVICE line — performed_by မပါ (D-COM-03)', 'fail', $$INSERT INTO sale_items (id, sale_id, sort_order, line_type, service_id, description_mm, list_price_amount, unit_price_amount)
  VALUES (gen_random_uuid(), '00000000-0000-0000-0000-00000000e001', 1, 1, '00000000-0000-0000-0000-000000005001', 'ဆံပင်ညှပ်', 7000, 7000)$$);
SELECT t('17 SERVICE line ဆံပင်ညှပ် 7,000', 'ok', $$INSERT INTO sale_items (id, sale_id, sort_order, line_type, service_id, performed_by_employee_id, description_mm, list_price_amount, unit_price_amount)
  VALUES ('00000000-0000-0000-0000-00000000e101', '00000000-0000-0000-0000-00000000e001', 1, 1, '00000000-0000-0000-0000-000000005001', '00000000-0000-0000-0000-0000000000e1', 'ဆံပင်ညှပ်', 7000, 7000)$$);
SELECT t('18 ဆိုးဆေး + ဆံပင်ညှပ် ရဲ့ variant (composite FK)', 'fail', $$INSERT INTO sale_items (id, sale_id, sort_order, line_type, service_id, service_variant_id, performed_by_employee_id, description_mm, list_price_amount, unit_price_amount)
  VALUES (gen_random_uuid(), '00000000-0000-0000-0000-00000000e001', 2, 1, '00000000-0000-0000-0000-000000005001', '00000000-0000-0000-0000-000000007001', '00000000-0000-0000-0000-0000000000e1', 'x', 30000, 30000)$$);
SELECT t('19 ဆိုးဆေး Ash + ရှည် 30,000', 'ok', $$INSERT INTO sale_items (id, sale_id, sort_order, line_type, service_id, service_variant_id, performed_by_employee_id, description_mm, list_price_amount, unit_price_amount)
  VALUES ('00000000-0000-0000-0000-00000000e102', '00000000-0000-0000-0000-00000000e001', 2, 1, '00000000-0000-0000-0000-000000005002', '00000000-0000-0000-0000-000000007001', '00000000-0000-0000-0000-0000000000e1', 'ဆိုးဆေး — Ash / ရှည်', 30000, 30000)$$);
SELECT t('20 ဈေး ≠ list — override reason မပါ (D-SVC-04)', 'fail', $$UPDATE sale_items SET unit_price_amount = 25000 WHERE id = '00000000-0000-0000-0000-00000000e102'$$);
SELECT t('21 ဈေး ≠ list + reason + by (ခွင့်ရှိသူ)', 'ok', $$UPDATE sale_items SET unit_price_amount = 25000, price_override_reason = 'ဆေး နည်းနည်းပဲ သုံး', price_override_by_user_id = '00000000-0000-0000-0000-0000000000a3' WHERE id = '00000000-0000-0000-0000-00000000e102'$$);
SELECT t('22 Line ဖြုတ် — reason မပါ (D-VIS-05)', 'fail', $$UPDATE sale_items SET removed_at = now(), removed_by_user_id = '00000000-0000-0000-0000-0000000000a1' WHERE id = '00000000-0000-0000-0000-00000000e102'$$);
SELECT t('23 TRANSPORT_FEE line မှာ discount', 'fail', $$INSERT INTO sale_items (id, sale_id, sort_order, line_type, description_mm, list_price_amount, unit_price_amount, line_discount_amount)
  VALUES (gen_random_uuid(), '00000000-0000-0000-0000-00000000e001', 3, 3, 'ကားခ', 6000, 6000, 500)$$);
SELECT t('24 PRODUCT line — product_id မပါ', 'fail', $$INSERT INTO sale_items (id, sale_id, sort_order, line_type, description_mm, list_price_amount, unit_price_amount, quantity)
  VALUES (gen_random_uuid(), '00000000-0000-0000-0000-00000000e001', 3, 2, 'Pomade', 15000, 15000, 2)$$);
SELECT t('25 line_total generated (7000 + 25000 = 32000)', 'ok', $q$DO $d$ BEGIN IF (SELECT sum(line_total_amount) FROM sale_items WHERE sale_id = '00000000-0000-0000-0000-00000000e001' AND removed_at IS NULL) <> 32000 THEN RAISE EXCEPTION 'sum mismatch'; END IF; END $d$; $q$);

-- ── Discount (D-PAY-04) ──
SELECT t('26 Code စာလုံးသေး', 'fail', $$INSERT INTO discount_codes (id, company_id, code, name_mm, discount_type, discount_amount, created_by_user_id)
  VALUES (gen_random_uuid(), '00000000-0000-0000-0000-00000000c001', 'fb2000', 'FB promo', 2, 2000, '00000000-0000-0000-0000-0000000000a3')$$);
SELECT t('27 PERCENT code + amount ပါ (တစ်ခုပဲ)', 'fail', $$INSERT INTO discount_codes (id, company_id, code, name_mm, discount_type, discount_percent, discount_amount, created_by_user_id)
  VALUES (gen_random_uuid(), '00000000-0000-0000-0000-00000000c001', 'STAFF10', 'ဝန်ထမ်းမိသားစု', 1, 10, 1000, '00000000-0000-0000-0000-0000000000a3')$$);
SELECT t('28 Public code FB2000 (once per customer)', 'ok', $$INSERT INTO discount_codes (id, company_id, code, name_mm, discount_type, discount_amount, is_public, once_per_customer, valid_from, valid_to, created_by_user_id)
  VALUES ('00000000-0000-0000-0000-00000000dc01', '00000000-0000-0000-0000-00000000c001', 'FB2000', 'FB promo', 2, 2000, true, true, '2026-10-01', '2026-10-31', '00000000-0000-0000-0000-0000000000a3')$$);
SELECT t('29 Discount 2,000 — code / request မပါ', 'fail', $$UPDATE sales SET subtotal_amount = 32000, discount_amount = 2000, total_amount = 30000 WHERE id = '00000000-0000-0000-0000-00000000e001'$$);
SELECT t('30 Discount request — reason မပါ', 'fail', $$INSERT INTO discount_requests (id, sale_id, requested_by_user_id, discount_type, discount_amount, reason)
  VALUES (gen_random_uuid(), '00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-0000000000a1', 2, 3000, '')$$);
SELECT t('31 Discount request PENDING', 'ok', $$INSERT INTO discount_requests (id, sale_id, requested_by_user_id, discount_type, discount_amount, reason)
  VALUES ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-0000000000a1', 2, 3000, 'customer မကျေနပ် — ပြန်ပြင်ပေး')$$);
SELECT t('32 Sale တူ PENDING ၂ ခု', 'fail', $$INSERT INTO discount_requests (id, sale_id, requested_by_user_id, discount_type, discount_amount, reason)
  VALUES (gen_random_uuid(), '00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-0000000000a1', 2, 1000, 'x')$$);
SELECT t('33 APPROVED — decided_by မပါ', 'fail', $$UPDATE discount_requests SET status = 2, decided_at = now() WHERE id = '00000000-0000-0000-0000-0000000000d1'$$);
SELECT t('34 Manager ✔ APPROVED', 'ok', $$UPDATE discount_requests SET status = 2, decided_at = now(), decided_by_user_id = '00000000-0000-0000-0000-0000000000a3' WHERE id = '00000000-0000-0000-0000-0000000000d1'$$);
SELECT t('35 Code + request နှစ်ခုလုံး', 'fail', $$UPDATE sales SET subtotal_amount = 32000, discount_amount = 3000, total_amount = 29000, discount_code_id = '00000000-0000-0000-0000-00000000dc01', discount_request_id = '00000000-0000-0000-0000-0000000000d1' WHERE id = '00000000-0000-0000-0000-00000000e001'$$);
SELECT t('36 Total မကိုက် (32000 − 3000 ≠ 30000)', 'fail', $$UPDATE sales SET subtotal_amount = 32000, discount_amount = 3000, total_amount = 30000, discount_request_id = '00000000-0000-0000-0000-0000000000d1' WHERE id = '00000000-0000-0000-0000-00000000e001'$$);
SELECT t('37 Request discount 3,000 → total 29,000', 'ok', $$UPDATE sales SET subtotal_amount = 32000, discount_amount = 3000, total_amount = 29000, discount_request_id = '00000000-0000-0000-0000-0000000000d1' WHERE id = '00000000-0000-0000-0000-00000000e001'$$);

-- ── Payment (D-PAY-02, D-VIS-06) ──
SELECT t('38 KBZPay 29,000 ref K123 (ကိုအောင် လက်ခံ)', 'ok', $$INSERT INTO payments (id, client_request_id, sale_id, payment_method_id, amount, collected_by_employee_id, received_at, recorded_by_user_id, external_reference)
  VALUES ('00000000-0000-0000-0000-00000000f101', gen_random_uuid(), '00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-00000000aa02', 29000, '00000000-0000-0000-0000-0000000000e1', '2026-10-10 09:40+06:30', '00000000-0000-0000-0000-0000000000a1', 'K123')$$);
SELECT t('39a Product-only sale (visit မရှိ — D-PAY-03)', 'ok', $$INSERT INTO sales (id, client_request_id, branch_id) VALUES ('00000000-0000-0000-0000-00000000e002', gen_random_uuid(), '00000000-0000-0000-0000-0000000000b3')$$);
SELECT t('39b KBZPay ref K123 ထပ် (တခြား sale)', 'fail', $$INSERT INTO payments (id, client_request_id, sale_id, payment_method_id, amount, collected_by_employee_id, received_at, recorded_by_user_id, external_reference)
  VALUES (gen_random_uuid(), gen_random_uuid(), '00000000-0000-0000-0000-00000000e002', '00000000-0000-0000-0000-00000000aa02', 5000, '00000000-0000-0000-0000-0000000000e2', now(), '00000000-0000-0000-0000-0000000000a2', 'K123')$$);
SELECT t('40 Payment amount 0', 'fail', $$INSERT INTO payments (id, client_request_id, sale_id, payment_method_id, amount, collected_by_employee_id, received_at, recorded_by_user_id)
  VALUES (gen_random_uuid(), gen_random_uuid(), '00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-00000000aa01', 0, '00000000-0000-0000-0000-0000000000e1', now(), '00000000-0000-0000-0000-0000000000a1')$$);
SELECT t('41 Void — reason မပါ', 'fail', $$UPDATE payments SET voided_at = now(), voided_by_user_id = '00000000-0000-0000-0000-0000000000a1' WHERE id = '00000000-0000-0000-0000-00000000f101'$$);
SELECT t('42 Verify — verified_by မပါ (D-PAY-02 v5.1)', 'fail', $$UPDATE payments SET verified_at = now() WHERE id = '00000000-0000-0000-0000-00000000f101'$$);
SELECT t('43 Closing မှာ Manager ✔ verify', 'ok', $$UPDATE payments SET verified_at = now(), verified_by_user_id = '00000000-0000-0000-0000-0000000000a3' WHERE id = '00000000-0000-0000-0000-00000000f101'$$);

-- ── FINISH + receipt (D-PAY-06, D-VIS-07) ──
SELECT t('44 FINISH — receipt မပါ', 'fail', $$UPDATE sales SET status = 2, finished_at = '2026-10-10 09:41+06:30', finished_by_user_id = '00000000-0000-0000-0000-0000000000a1', business_date = '2026-10-10' WHERE id = '00000000-0000-0000-0000-00000000e001'$$);
SELECT t('45 Receipt ပုံစံ မှား (B3-202610-0001)', 'fail', $$UPDATE sales SET status = 2, finished_at = '2026-10-10 09:41+06:30', finished_by_user_id = '00000000-0000-0000-0000-0000000000a1', business_date = '2026-10-10',
  receipt_number = 'B3-202610-0001', receipt_year = 2026, receipt_month = 10, receipt_seq = 1 WHERE id = '00000000-0000-0000-0000-00000000e001'$$);
SELECT t('46 Counter B3 SALE 2026 OCT → 1 (gapless)', 'ok', $$INSERT INTO receipt_counters (branch_id, kind, receipt_year, receipt_month, last_seq) VALUES ('00000000-0000-0000-0000-0000000000b3', 1, 2026, 10, 0)
  ON CONFLICT (branch_id, kind, receipt_year, receipt_month) DO NOTHING;
  UPDATE receipt_counters SET last_seq = last_seq + 1 WHERE branch_id = '00000000-0000-0000-0000-0000000000b3' AND kind = 1 AND receipt_year = 2026 AND receipt_month = 10$$);
SELECT t('47 FINISH B3-2026-OCT-00001', 'ok', $$UPDATE sales SET status = 2, finished_at = '2026-10-10 09:41+06:30', finished_by_user_id = '00000000-0000-0000-0000-0000000000a1', business_date = '2026-10-10',
  receipt_number = 'B3-2026-OCT-00001', receipt_year = 2026, receipt_month = 10, receipt_seq = 1 WHERE id = '00000000-0000-0000-0000-00000000e001'$$);
SELECT t('48 Visit → FINISHED', 'ok', $$UPDATE visits SET status = 3, finished_at = '2026-10-10 09:41+06:30' WHERE id = '00000000-0000-0000-0000-0000000d0001'$$);
SELECT t('49 Receipt seq 1 ထပ် (B3 OCT)', 'fail', $$UPDATE sales SET status = 2, finished_at = now(), finished_by_user_id = '00000000-0000-0000-0000-0000000000a2', business_date = (now() AT TIME ZONE 'Asia/Yangon')::date,
  receipt_number = 'B3-2026-OCT-00001x', receipt_year = 2026, receipt_month = 10, receipt_seq = 1 WHERE id = '00000000-0000-0000-0000-00000000e002'$$);
SELECT t('50 business_date ≠ finished_at ရက်', 'fail', $$UPDATE sales SET status = 2, finished_at = '2026-10-31 18:00+00', finished_by_user_id = '00000000-0000-0000-0000-0000000000a2', business_date = '2026-10-31',
  receipt_number = 'B3-2026-NOV-00001', receipt_year = 2026, receipt_month = 11, receipt_seq = 1 WHERE id = '00000000-0000-0000-0000-00000000e002'$$);
SELECT t('51 once_per_customer — FB2000 customer f001 ၁ ကြိမ်', 'ok', $$INSERT INTO discount_code_customer_uses (id, discount_code_id, customer_id, sale_id) VALUES (gen_random_uuid(), '00000000-0000-0000-0000-00000000dc01', '00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-00000000e001')$$);
SELECT t('52 FB2000 customer f001 ၂ ကြိမ်', 'fail', $$INSERT INTO discount_code_customer_uses (id, discount_code_id, customer_id, sale_id) VALUES (gen_random_uuid(), '00000000-0000-0000-0000-00000000dc01', '00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-00000000e002')$$);

-- ── Refund / adjustment (D-PAY-05, D-VIS-08) ──
SELECT t('53 Refund — RF ပုံစံ မှား', 'fail', $$INSERT INTO refunds (id, client_request_id, sale_id, branch_id, kind, payment_method_id, amount, reason, refund_receipt_number, receipt_year, receipt_month, receipt_seq, business_date, refunded_at, refunded_by_user_id)
  VALUES (gen_random_uuid(), gen_random_uuid(), '00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-0000000000b3', 1, '00000000-0000-0000-0000-00000000aa01', 5000, 'ဆေး မကြိုက်', 'B3-2026-OCT-00001', 2026, 10, 1, '2026-10-11', '2026-10-11 10:00+06:30', '00000000-0000-0000-0000-0000000000a3')$$);
SELECT t('54 Partial refund 5,000 cash B3-RF-2026-OCT-00001', 'ok', $$INSERT INTO refunds (id, client_request_id, sale_id, branch_id, kind, payment_method_id, amount, reason, refund_receipt_number, receipt_year, receipt_month, receipt_seq, business_date, refunded_at, refunded_by_user_id)
  VALUES ('00000000-0000-0000-0000-00000000fa01', gen_random_uuid(), '00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-0000000000b3', 1, '00000000-0000-0000-0000-00000000aa01', 5000, 'ဆေး မကြိုက်', 'B3-RF-2026-OCT-00001', 2026, 10, 1, '2026-10-11', '2026-10-11 10:00+06:30', '00000000-0000-0000-0000-0000000000a3');
  INSERT INTO refund_items (id, refund_id, sale_item_id, amount) VALUES (gen_random_uuid(), '00000000-0000-0000-0000-00000000fa01', '00000000-0000-0000-0000-00000000e102', 5000)$$);
SELECT t('55 Adjustment PAYMENT_METHOD — new method မပါ', 'fail', $$INSERT INTO sale_adjustments (id, sale_id, adjustment_type, payment_id, reason, adjusted_by_user_id)
  VALUES (gen_random_uuid(), '00000000-0000-0000-0000-00000000e001', 1, '00000000-0000-0000-0000-00000000f101', 'cash လို့ မှားရိုက်', '00000000-0000-0000-0000-0000000000a3')$$);
SELECT t('56 Adjustment COLLECTED_BY → ကိုမင်း', 'ok', $$INSERT INTO sale_adjustments (id, sale_id, adjustment_type, payment_id, new_employee_id, reason, adjusted_by_user_id)
  VALUES (gen_random_uuid(), '00000000-0000-0000-0000-00000000e001', 3, '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-0000000000e2', 'တကယ် လက်ခံသူ ကိုမင်း', '00000000-0000-0000-0000-0000000000a3')$$);

SELECT t('57 PERCENT code — percent NULL (NULL ကျော် bug)', 'fail', $$INSERT INTO discount_codes (id, company_id, code, name_mm, discount_type, created_by_user_id) VALUES (gen_random_uuid(), '00000000-0000-0000-0000-00000000c001', 'NULLPCT', 'x', 1, '00000000-0000-0000-0000-0000000000a3')$$);
SELECT t('58 Discount request AMOUNT — amount NULL', 'fail', $$INSERT INTO discount_requests (id, sale_id, requested_by_user_id, discount_type, reason) VALUES (gen_random_uuid(), '00000000-0000-0000-0000-00000000e002', '00000000-0000-0000-0000-0000000000a1', 2, 'x')$$);

-- ── FINISH ပြီး guard (v1.2 — owner G (f) · 🔒 D-VIS-08 · P4-RULE-01 — trigger ၄ ခု → P0001 finished_immutable) ──
SELECT t('59 FINISHED sale — customer ထည့် (owner B10 · P4.SAL.12) ✔', 'ok', $$UPDATE sales SET customer_id = '00000000-0000-0000-0000-00000000f002', updated_at = now() WHERE id = '00000000-0000-0000-0000-00000000e001'$$);
SELECT t('60 FINISHED sale — discount / total ပြင် (refund / ကွာငွေ sale ပဲ)', 'fail', $$UPDATE sales SET discount_amount = 2000, total_amount = 30000 WHERE id = '00000000-0000-0000-0000-00000000e001'$$);
SELECT t('61 FINISHED sale — finished_by ပြောင်း', 'fail', $$UPDATE sales SET finished_by_user_id = '00000000-0000-0000-0000-0000000000a2' WHERE id = '00000000-0000-0000-0000-00000000e001'$$);
SELECT t('62 FINISHED sale line — description ပြင်', 'fail', $$UPDATE sale_items SET description_en = 'Haircut' WHERE id = '00000000-0000-0000-0000-00000000e101'$$);
SELECT t('63 FINISHED sale line — ဖြုတ် (removed_at)', 'fail', $$UPDATE sale_items SET removed_at = now(), removed_by_user_id = '00000000-0000-0000-0000-0000000000a3', removed_reason = 'မှားထည့်' WHERE id = '00000000-0000-0000-0000-00000000e101'$$);
SELECT t('64 FINISHED sale line DELETE', 'fail', $$DELETE FROM sale_items WHERE id = '00000000-0000-0000-0000-00000000e101'$$);
SELECT t('65 FINISHED sale — line အသစ် INSERT (ကားခ)', 'fail', $$INSERT INTO sale_items (id, sale_id, sort_order, line_type, description_mm, list_price_amount, unit_price_amount) VALUES (gen_random_uuid(), '00000000-0000-0000-0000-00000000e001', 3, 3, 'ကားခ', 3000, 3000)$$);
SELECT t('66 FINISHED payment — KBZPay ref ပြင် + verify ပြန်ဖြုတ် (owner B10 · P4.PAY.07) ✔', 'ok', $$UPDATE payments SET external_reference = 'K124', verified_at = NULL, verified_by_user_id = NULL WHERE id = '00000000-0000-0000-0000-00000000f101'$$);
SELECT t('67 FINISHED payment — verify ပြန် (owner E3 — ပိတ်ပြီးလည်း ရ) ✔', 'ok', $$UPDATE payments SET verified_at = now(), verified_by_user_id = '00000000-0000-0000-0000-0000000000a3' WHERE id = '00000000-0000-0000-0000-00000000f101'$$);
SELECT t('68 FINISHED payment — amount ပြင်', 'fail', $$UPDATE payments SET amount = 30000 WHERE id = '00000000-0000-0000-0000-00000000f101'$$);
SELECT t('69 FINISHED payment — method / ငွေလက်ခံသူ ပြောင်း (sale_adjustments ပဲ — P4-RULE-15)', 'fail', $$UPDATE payments SET payment_method_id = '00000000-0000-0000-0000-00000000aa01', collected_by_employee_id = '00000000-0000-0000-0000-0000000000e2' WHERE id = '00000000-0000-0000-0000-00000000f101'$$);
SELECT t('70 FINISHED payment — void', 'fail', $$UPDATE payments SET voided_at = now(), voided_by_user_id = '00000000-0000-0000-0000-0000000000a3', void_reason = 'မှားရိုက်' WHERE id = '00000000-0000-0000-0000-00000000f101'$$);
SELECT t('71 FINISHED payment DELETE', 'fail', $$DELETE FROM payments WHERE id = '00000000-0000-0000-0000-00000000f101'$$);
SELECT t('72 FINISHED visit — updated_at ပဲ ✔', 'ok', $$UPDATE visits SET updated_at = now() WHERE id = '00000000-0000-0000-0000-0000000d0001'$$);
SELECT t('73 FINISHED visit — barber ပြောင်း (PERFORMER adjustment ပဲ)', 'fail', $$UPDATE visits SET performed_by_employee_id = '00000000-0000-0000-0000-0000000000e2' WHERE id = '00000000-0000-0000-0000-0000000d0001'$$);
SELECT t('74 FINISHED visit → COMPLETED ပြန်', 'fail', $$UPDATE visits SET status = 2, finished_at = NULL WHERE id = '00000000-0000-0000-0000-0000000d0001'$$);
SELECT t('75 INCOMPLETE visit — STARTED ပြန်ဖွင့် (D-VIS-09)', 'fail', $$UPDATE visits SET status = 1, incomplete_at = NULL, incomplete_by_user_id = NULL, incomplete_reason = NULL WHERE id = '00000000-0000-0000-0000-0000000d0003'$$);
SELECT t('76 INCOMPLETE — visit 1 → 0 + sale OPEN → CANCELLED (guard မထိ) ✔', 'ok', $$INSERT INTO sales (id, client_request_id, branch_id, visit_id, customer_id) VALUES ('00000000-0000-0000-0000-00000000e003', gen_random_uuid(), '00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000d0002', '00000000-0000-0000-0000-00000000f001');
  INSERT INTO sale_items (id, sale_id, sort_order, line_type, service_id, performed_by_employee_id, description_mm, list_price_amount, unit_price_amount) VALUES ('00000000-0000-0000-0000-00000000e131', '00000000-0000-0000-0000-00000000e003', 1, 1, '00000000-0000-0000-0000-000000005001', '00000000-0000-0000-0000-0000000000e1', 'ဆံပင်ညှပ်', 7000, 7000);
  UPDATE visits SET status = 0, incomplete_at = now(), incomplete_by_user_id = '00000000-0000-0000-0000-0000000000a3', incomplete_reason = 'customer ပြန်သွား' WHERE id = '00000000-0000-0000-0000-0000000d0002';
  UPDATE sales SET status = 0, cancelled_at = now() WHERE id = '00000000-0000-0000-0000-00000000e003'$$);
SELECT t('77 CANCELLED sale — OPEN ပြန်ဖွင့်', 'fail', $$UPDATE sales SET status = 1, cancelled_at = NULL WHERE id = '00000000-0000-0000-0000-00000000e003'$$);
SELECT t('78 CANCELLED sale line — ဈေးပြင်', 'fail', $$UPDATE sale_items SET unit_price_amount = 6000, price_override_reason = 'လျှော့', price_override_by_user_id = '00000000-0000-0000-0000-0000000000a3' WHERE id = '00000000-0000-0000-0000-00000000e131'$$);
SELECT t('79 CANCELLED sale — line အသစ် INSERT', 'fail', $$INSERT INTO sale_items (id, sale_id, sort_order, line_type, description_mm, list_price_amount, unit_price_amount) VALUES (gen_random_uuid(), '00000000-0000-0000-0000-00000000e003', 2, 3, 'ကားခ', 3000, 3000)$$);
SELECT t('80 ကွာငွေ sale (owner B10 — sale အသစ် + SERVICE 3,000 + OTHER adjustment) ✔', 'ok', $$INSERT INTO sales (id, client_request_id, branch_id, customer_id) VALUES ('00000000-0000-0000-0000-00000000e004', gen_random_uuid(), '00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-00000000f002');
  INSERT INTO sale_items (id, sale_id, sort_order, line_type, service_id, performed_by_employee_id, description_mm, list_price_amount, unit_price_amount) VALUES ('00000000-0000-0000-0000-00000000e141', '00000000-0000-0000-0000-00000000e004', 1, 1, '00000000-0000-0000-0000-000000005001', '00000000-0000-0000-0000-0000000000e1', 'Difference for B3-2026-OCT-00001 — ဆံပင်ညှပ်', 3000, 3000);
  INSERT INTO sale_adjustments (id, sale_id, adjustment_type, reason, adjusted_by_user_id) VALUES (gen_random_uuid(), '00000000-0000-0000-0000-00000000e001', 9, 'ဈေးနည်းယူမိ — ကွာငွေ sale', '00000000-0000-0000-0000-0000000000a3')$$);
SELECT t('81 OPEN sale payment void (guard မထိ) ✔', 'ok', $$INSERT INTO payments (id, client_request_id, sale_id, payment_method_id, amount, collected_by_employee_id, received_at, recorded_by_user_id) VALUES ('00000000-0000-0000-0000-00000000f141', gen_random_uuid(), '00000000-0000-0000-0000-00000000e004', '00000000-0000-0000-0000-00000000aa01', 3000, '00000000-0000-0000-0000-0000000000e1', now(), '00000000-0000-0000-0000-0000000000a3');
  UPDATE payments SET voided_at = now(), voided_by_user_id = '00000000-0000-0000-0000-0000000000a3', void_reason = 'နှစ်ခါ ရိုက်မိ' WHERE id = '00000000-0000-0000-0000-00000000f141'$$);
SELECT t('82 Guard error = SQLSTATE P0001 finished_immutable (trigger ၄ ခု → API 423 locked)', 'ok', $q$DO $d$
DECLARE s text; n int := 0;
BEGIN
  FOREACH s IN ARRAY ARRAY[
    $s$UPDATE sales SET finished_by_user_id = '00000000-0000-0000-0000-0000000000a2' WHERE id = '00000000-0000-0000-0000-00000000e001'$s$,
    $s$DELETE FROM sale_items WHERE id = '00000000-0000-0000-0000-00000000e101'$s$,
    $s$UPDATE payments SET amount = 1 WHERE id = '00000000-0000-0000-0000-00000000f101'$s$,
    $s$UPDATE visits SET status = 2, finished_at = NULL WHERE id = '00000000-0000-0000-0000-0000000d0001'$s$] LOOP
    BEGIN
      EXECUTE s;
    EXCEPTION WHEN SQLSTATE 'P0001' THEN
      IF SQLERRM = 'finished_immutable' THEN n := n + 1; END IF;
    END;
  END LOOP;
  IF n <> 4 THEN RAISE EXCEPTION 'guard %/4', n; END IF;
END $d$; $q$);

SELECT n, label, expect, CASE WHEN (expect = 'ok') = (got = 'ok') THEN 'PASS' ELSE 'FAIL' END AS result, left(got, 90) AS got FROM r ORDER BY n;
