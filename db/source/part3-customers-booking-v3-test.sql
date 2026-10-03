-- Part 3 v3 test (Part 1 + 1b + 2 + 3 တွဲ load ပြီး)
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

-- ── seed ──
INSERT INTO companies (id, name_mm) VALUES ('00000000-0000-0000-0000-00000000c001', 'Point');
INSERT INTO branches (id, company_id, code, name_mm) VALUES
 ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000c001', 'B1', 'ဆိုင် ၁'),
 ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-00000000c001', 'B2', 'ဆိုင် ၂');
INSERT INTO users (id, email, status) VALUES
 ('00000000-0000-0000-0000-0000000000a1', 'aung@x.com', 1),
 ('00000000-0000-0000-0000-0000000000a2', 'min@x.com', 1),
 ('00000000-0000-0000-0000-0000000000a3', 'mgr@x.com', 1);
INSERT INTO employees (id, company_id, user_id, employee_code, name_mm) VALUES
 ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-0000000000a1', 'E1', 'ကိုအောင်'),
 ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-0000000000a2', 'E2', 'ကိုမင်း'),
 ('00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-0000000000a3', 'E3', 'Manager');
INSERT INTO service_categories (id, company_id, name_mm) VALUES ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000c001', 'ဆံပင်');
INSERT INTO services (id, company_id, category_id, name_mm, pricing_mode, buffer_minutes) VALUES
 ('00000000-0000-0000-0000-000000005001', '00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-0000000000c1', 'ဆံပင်ညှပ်', 1, 5),
 ('00000000-0000-0000-0000-000000005002', '00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-0000000000c1', 'ဆိုးဆေး', 2, 0);
INSERT INTO service_variants (id, service_id, variant_key) VALUES
 ('00000000-0000-0000-0000-000000007001', '00000000-0000-0000-0000-000000005002', 'ash|long');
INSERT INTO booking_cancel_reasons (id, company_id, name_mm, requires_note, system_code) VALUES
 ('00000000-0000-0000-0000-00000000d001', '00000000-0000-0000-0000-00000000c001', 'Customer ပြောင်းချင်', false, NULL),
 ('00000000-0000-0000-0000-00000000d002', '00000000-0000-0000-0000-00000000c001', 'Customer မလာ', false, 1),
 ('00000000-0000-0000-0000-00000000d003', '00000000-0000-0000-0000-00000000c001', 'Other', true, NULL);
INSERT INTO customers (id, company_id, name, phone, phone_normalized) VALUES
 ('00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-00000000c001', 'မမလှ', '09 451 234 567', '+959451234567');

-- booking insert helper (ONLINE, BRANCH) — ချိန် / block / employee / branch / token
CREATE FUNCTION bk(id text, emp text, br text, s text, e text, bs text, be text, tok text) RETURNS text LANGUAGE sql AS $$
  SELECT format($f$INSERT INTO bookings (id, branch_id, customer_id, customer_name, booked_employee_id, channel,
    starts_at, ends_at, block_starts_at, block_ends_at, business_date, manage_token_hash)
    VALUES (%L, %L, '00000000-0000-0000-0000-00000000f001', 'မမလှ', %L, 1, %L, %L, %L, %L,
    (%L::timestamptz AT TIME ZONE 'Asia/Yangon')::date, %L)$f$, id, br, emp, s, e, bs, be, s, tok)
$$;

-- ── Customers ──
SELECT t('01 ဖုန်းတူ customer ထပ်', 'fail', $$INSERT INTO customers (id, company_id, name, phone, phone_normalized) VALUES (gen_random_uuid(), '00000000-0000-0000-0000-00000000c001', 'တခြားနာမည်', '09451234567', '+959451234567')$$);
SELECT t('02 ဖုန်း E.164 မဟုတ် (09…)', 'fail', $$INSERT INTO customers (id, company_id, name, phone, phone_normalized) VALUES (gen_random_uuid(), '00000000-0000-0000-0000-00000000c001', 'x', '09450000000', '09450000000')$$);

-- ── D-BKG-08 overlap (buffer ပါ) ──
SELECT t('03 ကိုအောင် B1 10:00–10:30 (block –10:35, buffer 5)', 'ok', bk('00000000-0000-0000-0000-0000000b0001','00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000b1','2026-10-10 10:00+06:30','2026-10-10 10:30+06:30','2026-10-10 10:00+06:30','2026-10-10 10:35+06:30','tok1'));
SELECT t('04 ကိုအောင် B2 (branch မတူ) 10:20 ထပ်', 'fail', bk(gen_random_uuid()::text,'00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000b2','2026-10-10 10:20+06:30','2026-10-10 10:50+06:30','2026-10-10 10:20+06:30','2026-10-10 10:55+06:30','tok2'));
SELECT t('05 ကိုအောင် 10:30 (buffer ထဲ ဝင်)', 'fail', bk(gen_random_uuid()::text,'00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000b1','2026-10-10 10:30+06:30','2026-10-10 11:00+06:30','2026-10-10 10:30+06:30','2026-10-10 11:05+06:30','tok3'));
SELECT t('06 ကိုအောင် 10:35 (block ထိစပ်ရုံ)', 'ok', bk('00000000-0000-0000-0000-0000000b0006','00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000b1','2026-10-10 10:35+06:30','2026-10-10 11:05+06:30','2026-10-10 10:35+06:30','2026-10-10 11:10+06:30','tok6'));

-- ── Home service (D-BKG-22, D-SCH-03 — သွား / ပြန် ၃၀) ──
SELECT t('07 ကိုမင်း အိမ် 14:00–14:30 (block 13:30–15:00, ကားခ 6000)', 'ok', $$INSERT INTO bookings (id, branch_id, customer_id, customer_name, booked_employee_id, location_type, home_address, transport_fee_amount, channel, created_by_user_id, starts_at, ends_at, block_starts_at, block_ends_at, business_date, manage_token_hash) VALUES ('00000000-0000-0000-0000-0000000b0007', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000f001', 'မမလှ', '00000000-0000-0000-0000-0000000000e2', 2, 'ရန်ကင်း၊ လမ်း ၅', 6000, 2, '00000000-0000-0000-0000-0000000000a3', '2026-10-10 14:00+06:30', '2026-10-10 14:30+06:30', '2026-10-10 13:30+06:30', '2026-10-10 15:00+06:30', '2026-10-10', 'tok7')$$);
SELECT t('08 ကိုမင်း ဆိုင်မှာ 13:45 (သွားချိန်ထဲ)', 'fail', bk(gen_random_uuid()::text,'00000000-0000-0000-0000-0000000000e2','00000000-0000-0000-0000-0000000000b1','2026-10-10 13:45+06:30','2026-10-10 14:15+06:30','2026-10-10 13:45+06:30','2026-10-10 14:20+06:30','tok8'));
SELECT t('09 ကိုမင်း ဆိုင်မှာ 15:00 (ပြန်ရောက်ပြီ)', 'ok', bk(gen_random_uuid()::text,'00000000-0000-0000-0000-0000000000e2','00000000-0000-0000-0000-0000000000b1','2026-10-10 15:00+06:30','2026-10-10 15:30+06:30','2026-10-10 15:00+06:30','2026-10-10 15:35+06:30','tok9'));
SELECT t('10 အိမ် — လိပ်စာ မပါ', 'fail', $$INSERT INTO bookings (id, branch_id, customer_id, customer_name, booked_employee_id, location_type, transport_fee_amount, channel, starts_at, ends_at, block_starts_at, block_ends_at, business_date, manage_token_hash) VALUES (gen_random_uuid(), '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000f001', 'မမလှ', '00000000-0000-0000-0000-0000000000e2', 2, 6000, 1, '2026-10-11 14:00+06:30', '2026-10-11 14:30+06:30', '2026-10-11 13:30+06:30', '2026-10-11 15:00+06:30', '2026-10-11', 'tok10')$$);
SELECT t('11 ဆိုင် booking မှာ ကားခ ထည့်', 'fail', $$INSERT INTO bookings (id, branch_id, customer_id, customer_name, booked_employee_id, transport_fee_amount, channel, starts_at, ends_at, block_starts_at, block_ends_at, business_date, manage_token_hash) VALUES (gen_random_uuid(), '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000f001', 'မမလှ', '00000000-0000-0000-0000-0000000000e2', 6000, 1, '2026-10-11 09:00+06:30', '2026-10-11 09:30+06:30', '2026-10-11 09:00+06:30', '2026-10-11 09:35+06:30', '2026-10-11', 'tok11')$$);

-- ── Channel (F-BK-11) ──
SELECT t('12 STAFF booking — ထည့်သူ မပါ', 'fail', $$INSERT INTO bookings (id, branch_id, customer_id, customer_name, booked_employee_id, channel, starts_at, ends_at, block_starts_at, block_ends_at, business_date, manage_token_hash) VALUES (gen_random_uuid(), '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000f001', 'မမလှ', '00000000-0000-0000-0000-0000000000e1', 2, '2026-10-12 09:00+06:30', '2026-10-12 09:30+06:30', '2026-10-12 09:00+06:30', '2026-10-12 09:35+06:30', '2026-10-12', 'tok12')$$);
SELECT t('13 STAFF က customer တူကို နောက် booking (active ၂ ခု — D-BKG-09 v5.1)', 'ok', $$INSERT INTO bookings (id, branch_id, customer_id, customer_name, booked_employee_id, channel, created_by_user_id, starts_at, ends_at, block_starts_at, block_ends_at, business_date, manage_token_hash) VALUES (gen_random_uuid(), '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000f001', 'မောင်မောင် (သား)', '00000000-0000-0000-0000-0000000000e2', 2, '00000000-0000-0000-0000-0000000000a3', '2026-10-17 09:00+06:30', '2026-10-17 09:30+06:30', '2026-10-17 09:00+06:30', '2026-10-17 09:35+06:30', '2026-10-17', 'tok13')$$);

-- ── Cancel (D-BKG-14/16/17, F-BK-09) ──
SELECT t('14 Cancel — reason မပါ', 'fail', $$UPDATE bookings SET status = 0, cancelled_at = now(), cancelled_by_actor = 1 WHERE id = '00000000-0000-0000-0000-0000000b0001'$$);
SELECT t('15 BOOKED မှာ cancel_note ထည့်', 'fail', $$UPDATE bookings SET cancel_note = 'x' WHERE id = '00000000-0000-0000-0000-0000000b0001'$$);
SELECT t('16 STAFF cancel — user မပါ', 'fail', $$UPDATE bookings SET status = 0, cancelled_at = now(), cancel_reason_id = '00000000-0000-0000-0000-00000000d001', cancelled_by_actor = 2 WHERE id = '00000000-0000-0000-0000-0000000b0001'$$);
SELECT t('17 Customer က manage link နဲ့ cancel (user မလို)', 'ok', $$UPDATE bookings SET status = 0, cancelled_at = now(), cancel_reason_id = '00000000-0000-0000-0000-00000000d001', cancelled_by_actor = 1 WHERE id = '00000000-0000-0000-0000-0000000b0001'$$);
SELECT t('18 Cancel ပြီး 10:00 slot ပြန်လွတ် (ကိုအောင် B2)', 'ok', bk(gen_random_uuid()::text,'00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000b2','2026-10-10 10:00+06:30','2026-10-10 10:30+06:30','2026-10-10 10:00+06:30','2026-10-10 10:35+06:30','tok18'));
SELECT t('19 No-show auto-cancel (SYSTEM, user မလို)', 'ok', $$UPDATE bookings SET status = 0, cancelled_at = now(), cancel_reason_id = '00000000-0000-0000-0000-00000000d002', cancelled_by_actor = 3 WHERE id = '00000000-0000-0000-0000-0000000b0006'$$);
SELECT t('20 NO_SHOW system reason ထပ်', 'fail', $$INSERT INTO booking_cancel_reasons (id, company_id, name_mm, system_code) VALUES (gen_random_uuid(), '00000000-0000-0000-0000-00000000c001', 'မလာ ၂', 1)$$);
SELECT t('21a ကိုမင်း အိမ် booking → STARTED', 'ok', $$UPDATE bookings SET status = 2 WHERE id = '00000000-0000-0000-0000-0000000b0007'$$);
SELECT t('21b STARTED ကလည်း ပိတ် (ကိုမင်း 14:10 ထပ်)', 'fail', bk(gen_random_uuid()::text,'00000000-0000-0000-0000-0000000000e2','00000000-0000-0000-0000-0000000000b2','2026-10-10 14:10+06:30','2026-10-10 14:40+06:30','2026-10-10 14:10+06:30','2026-10-10 14:45+06:30','tok21'));

-- ── Date / block / token ──
SELECT t('22 ည ၁၂:၃၀ MMT booking — business_date = နောက်ရက်', 'ok', bk(gen_random_uuid()::text,'00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000b1','2026-10-31 18:00+00','2026-10-31 18:30+00','2026-10-31 18:00+00','2026-10-31 18:35+00','tok22'));
SELECT t('23 business_date မှား (UTC ရက်)', 'fail', $$INSERT INTO bookings (id, branch_id, customer_id, customer_name, booked_employee_id, channel, starts_at, ends_at, block_starts_at, block_ends_at, business_date, manage_token_hash) VALUES (gen_random_uuid(), '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000f001', 'မမလှ', '00000000-0000-0000-0000-0000000000e2', 1, '2026-10-31 18:00+00', '2026-10-31 18:30+00', '2026-10-31 18:00+00', '2026-10-31 18:35+00', '2026-10-31', 'tok23')$$);
SELECT t('24 block က ချိန်းချိန်ကို မအုပ်', 'fail', bk(gen_random_uuid()::text,'00000000-0000-0000-0000-0000000000e2','00000000-0000-0000-0000-0000000000b1','2026-10-20 09:00+06:30','2026-10-20 09:30+06:30','2026-10-20 09:05+06:30','2026-10-20 09:35+06:30','tok24'));
SELECT t('25 manage token hash ထပ်', 'fail', bk(gen_random_uuid()::text,'00000000-0000-0000-0000-0000000000e2','00000000-0000-0000-0000-0000000000b1','2026-10-21 09:00+06:30','2026-10-21 09:30+06:30','2026-10-21 09:00+06:30','2026-10-21 09:35+06:30','tok9'));

-- ── booking_items (D-SVC-05, OPEN-29) ──
SELECT t('26 ဆိုးဆေး Ash + ရှည် 30,000 / 150 မိနစ်', 'ok', $$INSERT INTO booking_items (id, booking_id, sort_order, service_id, service_variant_id, unit_price_amount, duration_minutes) VALUES (gen_random_uuid(), '00000000-0000-0000-0000-0000000b0007', 1, '00000000-0000-0000-0000-000000005002', '00000000-0000-0000-0000-000000007001', 30000, 150)$$);
SELECT t('27 ဆံပင်ညှပ် service + ဆိုးဆေးရဲ့ variant', 'fail', $$INSERT INTO booking_items (id, booking_id, sort_order, service_id, service_variant_id, unit_price_amount, duration_minutes) VALUES (gen_random_uuid(), '00000000-0000-0000-0000-0000000b0007', 2, '00000000-0000-0000-0000-000000005001', '00000000-0000-0000-0000-000000007001', 7000, 30)$$);
SELECT t('28 ဆံပင်ညှပ် (SIMPLE, variant မရှိ) + buffer 5', 'ok', $$INSERT INTO booking_items (id, booking_id, sort_order, service_id, unit_price_amount, duration_minutes, buffer_minutes) VALUES (gen_random_uuid(), '00000000-0000-0000-0000-0000000b0007', 2, '00000000-0000-0000-0000-000000005001', 7000, 30, 5)$$);
SELECT t('29 ဈေး အနုတ်', 'fail', $$INSERT INTO booking_items (id, booking_id, sort_order, service_id, unit_price_amount, duration_minutes) VALUES (gen_random_uuid(), '00000000-0000-0000-0000-0000000b0007', 3, '00000000-0000-0000-0000-000000005001', -1, 30)$$);

SELECT n, label, expect, CASE WHEN (expect = 'ok') = (got = 'ok') THEN 'PASS' ELSE 'FAIL' END AS result, got FROM r ORDER BY n;
