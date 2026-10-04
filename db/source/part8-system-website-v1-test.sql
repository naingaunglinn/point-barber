-- Part 8 v1 test (Part 1–8 တွဲ load ပြီး — full schema)
-- v1.1 (02/Oct/2026 — G (owner one-sheet 02/Oct 00:06) · G (e)): 46–50 = backup_runs_restore_chk (RESTORE_TEST NULL) · attachments_deleted_chk (system purge) · test 36 (RESTORE_TEST by admin) ✔ ဆက်
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
INSERT INTO branches (id, company_id, code, name_mm) VALUES ('00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-00000000c001', 'B3', 'ဆိုင် ၃');
INSERT INTO users (id, email, status) VALUES ('00000000-0000-0000-0000-0000000000a3', 'mgr@x.com', 1), ('00000000-0000-0000-0000-0000000000a1', 'aung@x.com', 1);
INSERT INTO employees (id, company_id, user_id, employee_code, name_mm) VALUES ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-0000000000a1', 'E1', 'ကိုအောင်');
INSERT INTO service_categories (id, company_id, name_mm) VALUES ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000c001', 'ဆံပင်');
INSERT INTO services (id, company_id, category_id, name_mm) VALUES ('00000000-0000-0000-0000-000000005001', '00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-0000000000c1', 'ဆံပင်ညှပ်');

-- ── Settings (D-PLT-16) ──
SELECT t('01 Key ပုံစံ မှား (BOOKING interval)', 'fail', $$INSERT INTO settings (id, company_id, key, value, updated_by_user_id) VALUES (gen_random_uuid(), '00000000-0000-0000-0000-00000000c001', 'BOOKING interval', '15', '00000000-0000-0000-0000-0000000000a3')$$);
SELECT t('02 booking.slot_interval_minutes = 15 (company)', 'ok', $$INSERT INTO settings (id, company_id, key, value, updated_by_user_id) VALUES ('00000000-0000-0000-0000-000000005e01', '00000000-0000-0000-0000-00000000c001', 'booking.slot_interval_minutes', '15', '00000000-0000-0000-0000-0000000000a3')$$);
SELECT t('03 Key တူ company scope ၂ ခု', 'fail', $$INSERT INTO settings (id, company_id, key, value, updated_by_user_id) VALUES (gen_random_uuid(), '00000000-0000-0000-0000-00000000c001', 'booking.slot_interval_minutes', '20', '00000000-0000-0000-0000-0000000000a3')$$);
SELECT t('04 Branch override closing.opening_float_amount (B3)', 'ok', $$INSERT INTO settings (id, company_id, branch_id, key, value, updated_by_user_id) VALUES (gen_random_uuid(), '00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-0000000000b3', 'closing.opening_float_amount', '20000', '00000000-0000-0000-0000-0000000000a3')$$);
SELECT t('05 History auto — INSERT ကနေ row ၁ ခု', 'ok', $q$DO $d$ BEGIN IF (SELECT count(*) FROM settings_history WHERE setting_id = '00000000-0000-0000-0000-000000005e01') <> 1 THEN RAISE EXCEPTION 'x'; END IF; END $d$; $q$);
SELECT t('06 Value 15 → 10 → history ၂ ခု (old 15 / new 10)', 'ok', $q$UPDATE settings SET value = '10', updated_by_user_id = '00000000-0000-0000-0000-0000000000a3' WHERE id = '00000000-0000-0000-0000-000000005e01';
  DO $d$ BEGIN IF (SELECT count(*) FROM settings_history WHERE setting_id = '00000000-0000-0000-0000-000000005e01' AND old_value = '15' AND new_value = '10') <> 1 THEN RAISE EXCEPTION 'x'; END IF; END $d$; $q$);
SELECT t('07 History UPDATE (append-only)', 'fail', $$UPDATE settings_history SET new_value = '99' WHERE setting_id = '00000000-0000-0000-0000-000000005e01'$$);

-- ── Audit (D-AUD-02) ──
SELECT t('08 Audit event INSERT (app source)', 'ok', $$INSERT INTO audit_events (id, actor_user_id, source, action, entity_type, entity_id) VALUES ('00000000-0000-0000-0000-00000000ad01', '00000000-0000-0000-0000-0000000000a3', 1, 'login.success', 'users', '00000000-0000-0000-0000-0000000000a3')$$);
SELECT t('09 Audit UPDATE ✖ (admin လည်း)', 'fail', $$UPDATE audit_events SET action = 'x' WHERE id = '00000000-0000-0000-0000-00000000ad01'$$);
SELECT t('10 Audit DELETE ✖', 'fail', $$DELETE FROM audit_events WHERE id = '00000000-0000-0000-0000-00000000ad01'$$);
SELECT t('11 ငွေ table trigger — sale INSERT → audit row (actor = app.user_id)', 'ok', $q$SET LOCAL app.user_id = '00000000-0000-0000-0000-0000000000a1';
  INSERT INTO sales (id, client_request_id, branch_id) VALUES ('00000000-0000-0000-0000-00000000e001', gen_random_uuid(), '00000000-0000-0000-0000-0000000000b3');
  DO $d$ BEGIN IF (SELECT count(*) FROM audit_events WHERE source = 2 AND entity_type = 'sales' AND entity_id = '00000000-0000-0000-0000-00000000e001' AND action = 'INSERT' AND actor_user_id = '00000000-0000-0000-0000-0000000000a1' AND branch_id = '00000000-0000-0000-0000-0000000000b3') <> 1 THEN RAISE EXCEPTION 'x'; END IF; END $d$; $q$);
SELECT t('12 Sale UPDATE → audit before / after', 'ok', $q$UPDATE sales SET subtotal_amount = 7000, total_amount = 7000 WHERE id = '00000000-0000-0000-0000-00000000e001';
  DO $d$ BEGIN IF (SELECT count(*) FROM audit_events WHERE source = 2 AND entity_type = 'sales' AND action = 'UPDATE' AND (before_data ->> 'total_amount') = '0' AND (after_data ->> 'total_amount') = '7000') <> 1 THEN RAISE EXCEPTION 'x'; END IF; END $d$; $q$);
SELECT t('13 Trigger without app.user_id → actor NULL (job)', 'ok', $q$RESET app.user_id;
  INSERT INTO cash_out_reasons (id, company_id, name_mm, accounting_type) VALUES ('00000000-0000-0000-0000-00000000c703', '00000000-0000-0000-0000-00000000c001', 'ဘဏ်သွင်း', 3);
  INSERT INTO cash_outs (id, client_request_id, branch_id, reason_id, accounting_type, amount, occurred_at, business_date, recorded_by_user_id) VALUES ('00000000-0000-0000-0000-00000000c011', gen_random_uuid(), '00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-00000000c703', 3, 1000, '2026-10-20 12:00+06:30', '2026-10-20', '00000000-0000-0000-0000-0000000000a3');
  DO $d$ BEGIN IF (SELECT actor_user_id IS NULL FROM audit_events WHERE entity_type = 'cash_outs' AND entity_id = '00000000-0000-0000-0000-00000000c011') IS NOT TRUE THEN RAISE EXCEPTION 'x'; END IF; END $d$; $q$);

-- ── Notifications (D-NTF) ──
SELECT t('14 Mandatory type + enabled = false', 'fail', $$INSERT INTO notification_types (id, company_id, code, category, is_mandatory, enabled, default_recipient_rule) VALUES (gen_random_uuid(), '00000000-0000-0000-0000-00000000c001', 'payslip.published', 5, true, false, 3)$$);
SELECT t('15 Types: payslip (mandatory) + low_stock (admin ပိတ်ရ)', 'ok', $$INSERT INTO notification_types (id, company_id, code, category, is_mandatory, enabled, default_recipient_rule) VALUES
  ('00000000-0000-0000-0000-00000000a701', '00000000-0000-0000-0000-00000000c001', 'payslip.published', 5, true, true, 3),
  ('00000000-0000-0000-0000-00000000a702', '00000000-0000-0000-0000-00000000c001', 'low_stock', 4, false, false, 1)$$);
SELECT t('16 Code တူ', 'fail', $$INSERT INTO notification_types (id, company_id, code, category, default_recipient_rule) VALUES (gen_random_uuid(), '00000000-0000-0000-0000-00000000c001', 'low_stock', 4, 1)$$);
SELECT t('17 Notification → ကိုအောင် (template key, deep link)', 'ok', $$INSERT INTO notifications (id, user_id, notification_type_id, template_key, payload, link_path) VALUES ('00000000-0000-0000-0000-00000000a801', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000a701', 'notification.payslip.published', '{"period": "OCT 2026"}', '/payslips/xyz')$$);
SELECT t('18 Unread count = 1 → read → 0', 'ok', $q$DO $d$ BEGIN IF (SELECT count(*) FROM notifications WHERE user_id = '00000000-0000-0000-0000-0000000000a1' AND read_at IS NULL AND deleted_at IS NULL) <> 1 THEN RAISE EXCEPTION 'x'; END IF; END $d$;
  UPDATE notifications SET read_at = now() WHERE id = '00000000-0000-0000-0000-00000000a801';
  DO $d$ BEGIN IF (SELECT count(*) FROM notifications WHERE user_id = '00000000-0000-0000-0000-0000000000a1' AND read_at IS NULL AND deleted_at IS NULL) <> 0 THEN RAISE EXCEPTION 'y'; END IF; END $d$; $q$);

-- ── Attachments ──
SELECT t('19 Attachment size 0', 'fail', $$INSERT INTO attachments (id, company_id, entity_type, entity_id, kind, storage_key, file_name, mime_type, size_bytes, uploaded_by_user_id) VALUES (gen_random_uuid(), '00000000-0000-0000-0000-00000000c001', 'services', '00000000-0000-0000-0000-000000005001', 2, 'k1', 'x.jpg', 'image/jpeg', 0, '00000000-0000-0000-0000-0000000000a3')$$);
SELECT t('20 Service website ပုံ + services.image_attachment_id FK (Part 2 v1.2)', 'ok', $$INSERT INTO attachments (id, company_id, entity_type, entity_id, kind, storage_key, file_name, mime_type, size_bytes, uploaded_by_user_id) VALUES ('00000000-0000-0000-0000-00000000a901', '00000000-0000-0000-0000-00000000c001', 'services', '00000000-0000-0000-0000-000000005001', 2, 'site/services/haircut.jpg', 'haircut.jpg', 'image/jpeg', 204800, '00000000-0000-0000-0000-0000000000a3');
  UPDATE services SET image_attachment_id = '00000000-0000-0000-0000-00000000a901', show_on_website = true, public_description_mm = 'ဆံပင်ညှပ် — ၃၀ မိနစ်' WHERE id = '00000000-0000-0000-0000-000000005001'$$);
SELECT t('21 services.image_attachment_id မရှိတဲ့ attachment', 'fail', $$UPDATE services SET image_attachment_id = '00000000-0000-0000-0000-000000009999' WHERE id = '00000000-0000-0000-0000-000000005001'$$);
SELECT t('22 Storage key တူ', 'fail', $$INSERT INTO attachments (id, company_id, entity_type, entity_id, kind, storage_key, file_name, mime_type, size_bytes, uploaded_by_user_id) VALUES (gen_random_uuid(), '00000000-0000-0000-0000-00000000c001', 'services', '00000000-0000-0000-0000-000000005001', 2, 'site/services/haircut.jpg', 'x.jpg', 'image/jpeg', 1, '00000000-0000-0000-0000-0000000000a3')$$);

-- ── Import (D-DAT-01) ──
SELECT t('23 Import job UPLOADED (Fresha customers)', 'ok', $$INSERT INTO attachments (id, company_id, entity_type, entity_id, kind, storage_key, file_name, mime_type, size_bytes, uploaded_by_user_id) VALUES ('00000000-0000-0000-0000-00000000a902', '00000000-0000-0000-0000-00000000c001', 'import_jobs', '00000000-0000-0000-0000-00000000ab01', 3, 'imports/customers.csv', 'customers.csv', 'text/csv', 5000, '00000000-0000-0000-0000-0000000000a3');
  INSERT INTO import_jobs (id, company_id, source, entity_type, file_attachment_id, created_by_user_id, total_rows) VALUES ('00000000-0000-0000-0000-00000000ab01', '00000000-0000-0000-0000-00000000c001', 1, 'customers', '00000000-0000-0000-0000-00000000a902', '00000000-0000-0000-0000-0000000000a3', 99)$$);
SELECT t('24 CONFIRMED — validate မလုပ်ရသေး', 'fail', $$UPDATE import_jobs SET status = 3, confirmed_at = now(), confirmed_by_user_id = '00000000-0000-0000-0000-0000000000a3' WHERE id = '00000000-0000-0000-0000-00000000ab01'$$);
SELECT t('25 valid + error > total', 'fail', $$UPDATE import_jobs SET status = 2, validated_at = now(), valid_rows = 90, error_rows = 20 WHERE id = '00000000-0000-0000-0000-00000000ab01'$$);
SELECT t('26 VALIDATED 90 valid / 9 error', 'ok', $$UPDATE import_jobs SET status = 2, validated_at = now(), valid_rows = 90, error_rows = 9 WHERE id = '00000000-0000-0000-0000-00000000ab01'$$);
SELECT t('27 Row ERROR — errors မပါ', 'fail', $$INSERT INTO import_job_rows (id, import_job_id, row_number, raw_data, status) VALUES (gen_random_uuid(), '00000000-0000-0000-0000-00000000ab01', 1, '{"phone": "abc"}', 3)$$);
SELECT t('28 Row ERROR + errors · Row VALID', 'ok', $$INSERT INTO import_job_rows (id, import_job_id, row_number, raw_data, status, errors) VALUES
  (gen_random_uuid(), '00000000-0000-0000-0000-00000000ab01', 1, '{"phone": "abc"}', 3, '[{"column": "phone", "message_key": "import.error.phone_invalid"}]'),
  ('00000000-0000-0000-0000-00000000ab11', '00000000-0000-0000-0000-00000000ab01', 2, '{"name": "မမလှ", "phone": "09451234567"}', 2, NULL)$$);
SELECT t('29 Row တူ row_number', 'fail', $$INSERT INTO import_job_rows (id, import_job_id, row_number, raw_data, status) VALUES (gen_random_uuid(), '00000000-0000-0000-0000-00000000ab01', 2, '{}', 1)$$);
SELECT t('30 CONFIRMED + row IMPORTED + source ref', 'ok', $$INSERT INTO customers (id, company_id, name, phone, phone_normalized) VALUES ('00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-00000000c001', 'မမလှ', '09451234567', '+959451234567');
  UPDATE import_job_rows SET status = 4, entity_id = '00000000-0000-0000-0000-00000000f001' WHERE id = '00000000-0000-0000-0000-00000000ab11';
  INSERT INTO import_source_refs (id, source, source_id, entity_type, entity_id, import_job_id) VALUES (gen_random_uuid(), 1, 'fresha-cust-12345', 'customers', '00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-00000000ab01');
  UPDATE import_jobs SET status = 3, confirmed_at = now(), confirmed_by_user_id = '00000000-0000-0000-0000-0000000000a3', imported_rows = 90 WHERE id = '00000000-0000-0000-0000-00000000ab01'$$);
SELECT t('31 Fresha id တူ ၂ ခါ (re-import)', 'fail', $$INSERT INTO import_source_refs (id, source, source_id, entity_type, entity_id) VALUES (gen_random_uuid(), 1, 'fresha-cust-12345', 'customers', '00000000-0000-0000-0000-00000000f001')$$);
SELECT t('32 imported > valid', 'fail', $$UPDATE import_jobs SET imported_rows = 95 WHERE id = '00000000-0000-0000-0000-00000000ab01'$$);

-- ── Backup (D-DAT-03 / 04) ──
SELECT t('33 DAILY backup RUNNING → SUCCESS', 'ok', $$INSERT INTO backup_runs (id, kind, status) VALUES ('00000000-0000-0000-0000-00000000bb01', 1, 1);
  UPDATE backup_runs SET status = 2, finished_at = now(), size_bytes = 52428800, location = 's3://point-backup/daily/2026-10-01.dump', checksum = 'abc' WHERE id = '00000000-0000-0000-0000-00000000bb01'$$);
SELECT t('34 FAILED — error_message မပါ', 'fail', $$INSERT INTO backup_runs (id, kind, status, finished_at) VALUES (gen_random_uuid(), 1, 3, now())$$);
SELECT t('35 RESTORE — reason မပါ (D-DAT-04)', 'fail', $$INSERT INTO backup_runs (id, kind, status, performed_by_user_id) VALUES (gen_random_uuid(), 4, 1, '00000000-0000-0000-0000-0000000000a3')$$);
SELECT t('36 RESTORE_TEST by admin', 'ok', $$INSERT INTO backup_runs (id, kind, status, performed_by_user_id) VALUES (gen_random_uuid(), 3, 1, '00000000-0000-0000-0000-0000000000a3')$$);
SELECT t('37 DAILY + performed_by ပါ', 'fail', $$INSERT INTO backup_runs (id, kind, status, performed_by_user_id) VALUES (gen_random_uuid(), 1, 1, '00000000-0000-0000-0000-0000000000a3')$$);

-- ── Website (D-WEB-04, OPEN-21 toggle) ──
SELECT t('38 Opening hours — ဖွင့်ရက် အချိန် မပါ', 'fail', $$INSERT INTO branch_opening_hours (id, branch_id, day_of_week, is_closed, updated_by_user_id) VALUES (gen_random_uuid(), '00000000-0000-0000-0000-0000000000b3', 1, false, '00000000-0000-0000-0000-0000000000a3')$$);
SELECT t('39 Mon 09:00–20:00 · Tue ပိတ်', 'ok', $$INSERT INTO branch_opening_hours (id, branch_id, day_of_week, is_closed, opens_at, closes_at, updated_by_user_id) VALUES
  (gen_random_uuid(), '00000000-0000-0000-0000-0000000000b3', 1, false, '09:00', '20:00', '00000000-0000-0000-0000-0000000000a3'),
  (gen_random_uuid(), '00000000-0000-0000-0000-0000000000b3', 2, true, NULL, NULL, '00000000-0000-0000-0000-0000000000a3')$$);
SELECT t('40 Mon ထပ်', 'fail', $$INSERT INTO branch_opening_hours (id, branch_id, day_of_week, is_closed, opens_at, closes_at, updated_by_user_id) VALUES (gen_random_uuid(), '00000000-0000-0000-0000-0000000000b3', 1, false, '10:00', '18:00', '00000000-0000-0000-0000-0000000000a3')$$);
SELECT t('41 closes ≤ opens', 'fail', $$INSERT INTO branch_opening_hours (id, branch_id, day_of_week, is_closed, opens_at, closes_at, updated_by_user_id) VALUES (gen_random_uuid(), '00000000-0000-0000-0000-0000000000b3', 3, false, '20:00', '09:00', '00000000-0000-0000-0000-0000000000a3')$$);
SELECT t('42 သင်္ကြန် ပိတ် 13–17/Apr', 'ok', $$INSERT INTO branch_closures (id, branch_id, start_date, end_date, notice_mm, notice_en, created_by_user_id) VALUES (gen_random_uuid(), '00000000-0000-0000-0000-0000000000b3', '2027-04-13', '2027-04-17', 'သင်္ကြန် ပိတ်ပါမယ်', 'Closed for Thingyan', '00000000-0000-0000-0000-0000000000a3')$$);
SELECT t('43 ပိတ်ရက် ထပ် (15–20/Apr)', 'fail', $$INSERT INTO branch_closures (id, branch_id, start_date, end_date, notice_mm, created_by_user_id) VALUES (gen_random_uuid(), '00000000-0000-0000-0000-0000000000b3', '2027-04-15', '2027-04-20', 'x', '00000000-0000-0000-0000-0000000000a3')$$);
SELECT t('44 Part 1 v3.2 columns — branch is_public / employee public_profile default OFF', 'ok', $q$DO $d$ BEGIN
  IF (SELECT is_public FROM branches WHERE id = '00000000-0000-0000-0000-0000000000b3') IS NOT TRUE THEN RAISE EXCEPTION 'x'; END IF;
  IF (SELECT public_profile FROM employees WHERE id = '00000000-0000-0000-0000-0000000000e1') IS NOT FALSE THEN RAISE EXCEPTION 'y'; END IF;
  UPDATE employees SET public_profile = true, public_specialty_mm = 'ဆိုးဆေး အထူးပြု' WHERE id = '00000000-0000-0000-0000-0000000000e1';
END $d$; $q$);
SELECT t('45 Site content = settings (site.show_prices)', 'ok', $$INSERT INTO settings (id, company_id, key, value, updated_by_user_id) VALUES (gen_random_uuid(), '00000000-0000-0000-0000-00000000c001', 'site.show_prices', 'true', '00000000-0000-0000-0000-0000000000a3')$$);

-- ── v1.1 G (e) auto restore test + system file ရှင်း (P8-RULE-03 / 09) ──
SELECT t('46 RESTORE_TEST auto (performed_by NULL — လစဉ် sidecar, F9) ✔', 'ok', $$INSERT INTO backup_runs (id, kind, status, location) VALUES (gen_random_uuid(), 3, 1, 's3://point-backup/daily/2026-10-01.dump')$$);
SELECT t('47 RESTORE — performed_by NULL (auto restore ✖ — D-DAT-04)', 'fail', $$INSERT INTO backup_runs (id, kind, status, reason) VALUES (gen_random_uuid(), 4, 1, 'record ပျောက်')$$);
SELECT t('48 Staging upload > 24 နာရီ → system purge (deleted_at + by NULL — uploads.purge) ✔', 'ok', $$INSERT INTO attachments (id, company_id, entity_type, entity_id, kind, storage_key, file_name, mime_type, size_bytes, uploaded_by_user_id) VALUES ('00000000-0000-0000-0000-00000000a903', '00000000-0000-0000-0000-00000000c001', 'uploads', '00000000-0000-0000-0000-0000000000a1', 1, 'att/2026/10/a903/original.pdf', 'bill.pdf', 'application/pdf', 1024, '00000000-0000-0000-0000-0000000000a1');
  UPDATE attachments SET deleted_at = now() WHERE id = '00000000-0000-0000-0000-00000000a903'$$);
SELECT t('49 User ဖျက် (deleted_at + by — P8.ATT.05) ✔', 'ok', $$INSERT INTO attachments (id, company_id, entity_type, entity_id, kind, storage_key, file_name, mime_type, size_bytes, uploaded_by_user_id) VALUES ('00000000-0000-0000-0000-00000000a904', '00000000-0000-0000-0000-00000000c001', 'expenses', gen_random_uuid(), 1, 'att/2026/10/a904/original.jpg', 'receipt.jpg', 'image/jpeg', 2048, '00000000-0000-0000-0000-0000000000a3');
  UPDATE attachments SET deleted_at = now(), deleted_by_user_id = '00000000-0000-0000-0000-0000000000a3' WHERE id = '00000000-0000-0000-0000-00000000a904'$$);
SELECT t('50 deleted_by ပဲ (deleted_at မပါ)', 'fail', $$UPDATE attachments SET deleted_by_user_id = '00000000-0000-0000-0000-0000000000a3' WHERE id = '00000000-0000-0000-0000-00000000a902'$$);

SELECT n, label, expect, CASE WHEN (expect = 'ok') = (got = 'ok') THEN 'PASS' ELSE 'FAIL' END AS result, left(got, 90) AS got FROM r ORDER BY n;
