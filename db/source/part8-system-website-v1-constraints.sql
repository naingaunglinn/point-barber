-- Point Barbershop — Part 8 v1 (🔒 D-DB-12) · System / Website · DBML မှာ ရေးလို့မရတဲ့ constraint + audit trigger
-- Part 1 v3.2 / Part 2 v1.2 website column = DBML ထဲ · FK ဒီမှာ
-- v1.1 (02/Oct/2026 — G (owner one-sheet 02/Oct 00:06) · G (e)) = DB Part 8 v1.1: backup_runs_restore_chk (RESTORE_TEST performed_by NULL ရ — လစဉ် auto, owner F9)
--      · attachments_deleted_chk (deleted_by NULL + deleted_at = system purge ရ · deleted_by ⇒ deleted_at) · schema မပြောင်း

-- ═══════════ Part 2 v1.2 future FK ═══════════
ALTER TABLE services ADD CONSTRAINT services_image_attachment_fk FOREIGN KEY (image_attachment_id) REFERENCES attachments (id);

-- ═══════════ settings (D-PLT-16) ═══════════
ALTER TABLE settings ADD CONSTRAINT settings_key_chk CHECK (key ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$');   -- ဥပမာ booking.slot_interval_minutes
CREATE UNIQUE INDEX settings_scope_key_uq
  ON settings (company_id, (COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid)), key);
-- History append-only
CREATE FUNCTION append_only_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION '% is append-only', TG_TABLE_NAME; END $$;
CREATE TRIGGER settings_history_append_only BEFORE UPDATE OR DELETE ON settings_history
  FOR EACH ROW EXECUTE FUNCTION append_only_guard();
-- settings ပြောင်းတိုင်း history auto (D-PLT-16)
CREATE FUNCTION settings_record_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO settings_history (id, setting_id, old_value, new_value, changed_by_user_id)
    VALUES (gen_random_uuid(), NEW.id, NULL, NEW.value, NEW.updated_by_user_id);
  ELSIF NEW.value IS DISTINCT FROM OLD.value THEN
    INSERT INTO settings_history (id, setting_id, old_value, new_value, changed_by_user_id)
    VALUES (gen_random_uuid(), NEW.id, OLD.value, NEW.value, NEW.updated_by_user_id);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER settings_history_trg AFTER INSERT OR UPDATE ON settings
  FOR EACH ROW EXECUTE FUNCTION settings_record_history();

-- ═══════════ audit_events (D-AUD-01 / 02) ═══════════
ALTER TABLE audit_events ADD CONSTRAINT audit_events_source_chk CHECK (source IN (1, 2, 3));
ALTER TABLE audit_events ADD CONSTRAINT audit_events_action_chk CHECK (btrim(action) <> '');
CREATE TRIGGER audit_events_append_only BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION append_only_guard();
-- App DB role: audit ပေါ် INSERT + SELECT ပဲ (D-AUD-02) — deploy script မှာ:
--   REVOKE UPDATE, DELETE, TRUNCATE ON audit_events FROM point_app;  GRANT SELECT, INSERT ON audit_events TO point_app;

-- ငွေ table row trigger → audit_events (source 2) · actor = current_setting('app.user_id') (app: SET LOCAL app.user_id = '<uuid>')
CREATE FUNCTION audit_row_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_actor uuid;
  v_branch uuid;
  v_row jsonb;
BEGIN
  BEGIN
    v_actor := NULLIF(current_setting('app.user_id', true), '')::uuid;
  EXCEPTION WHEN others THEN v_actor := NULL;
  END;
  v_row := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  IF v_row ? 'branch_id' THEN v_branch := (v_row ->> 'branch_id')::uuid; END IF;
  INSERT INTO audit_events (id, occurred_at, actor_user_id, source, action, entity_type, entity_id, branch_id, before_data, after_data, request_id)
  VALUES (
    gen_random_uuid(), now(), v_actor, 2, TG_OP, TG_TABLE_NAME,
    (v_row ->> 'id')::uuid, v_branch,
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) END,
    NULLIF(current_setting('app.request_id', true), '')::uuid
  );
  RETURN NULL;
END $$;
-- ငွေ table ၁၈ ခု (D-AUD-02 "table အတိအကျ = part design ချိန်")
CREATE TRIGGER audit_sales                 AFTER INSERT OR UPDATE OR DELETE ON sales                          FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER audit_sale_items            AFTER INSERT OR UPDATE OR DELETE ON sale_items                     FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER audit_payments              AFTER INSERT OR UPDATE OR DELETE ON payments                       FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER audit_refunds               AFTER INSERT OR UPDATE OR DELETE ON refunds                        FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER audit_refund_items          AFTER INSERT OR UPDATE OR DELETE ON refund_items                   FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER audit_sale_adjustments      AFTER INSERT OR UPDATE OR DELETE ON sale_adjustments               FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER audit_discount_requests     AFTER INSERT OR UPDATE OR DELETE ON discount_requests              FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER audit_cash_outs             AFTER INSERT OR UPDATE OR DELETE ON cash_outs                      FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER audit_cash_returns          AFTER INSERT OR UPDATE OR DELETE ON cash_returns                   FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER audit_expenses              AFTER INSERT OR UPDATE OR DELETE ON expenses                       FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER audit_manual_incomes        AFTER INSERT OR UPDATE OR DELETE ON manual_incomes                 FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER audit_daily_closings        AFTER INSERT OR UPDATE OR DELETE ON daily_closings                 FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER audit_payroll_runs          AFTER INSERT OR UPDATE OR DELETE ON payroll_runs                   FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER audit_payroll_entries       AFTER INSERT OR UPDATE OR DELETE ON payroll_entries                FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER audit_payroll_lines         AFTER INSERT OR UPDATE OR DELETE ON payroll_lines                  FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER audit_employee_receivables  AFTER INSERT OR UPDATE OR DELETE ON employee_receivables           FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER audit_receivable_repayments AFTER INSERT OR UPDATE OR DELETE ON employee_receivable_repayments FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER audit_commission_results    AFTER INSERT OR UPDATE OR DELETE ON commission_results             FOR EACH ROW EXECUTE FUNCTION audit_row_change();

-- ═══════════ notifications (D-NTF-01..03) ═══════════
ALTER TABLE notification_types ADD CONSTRAINT notification_types_category_chk  CHECK (category BETWEEN 1 AND 6);
ALTER TABLE notification_types ADD CONSTRAINT notification_types_recipient_chk CHECK (default_recipient_rule IN (1, 2, 3, 4));
ALTER TABLE notification_types ADD CONSTRAINT notification_types_code_chk CHECK (code ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$');
-- D-NTF-03: mandatory ⇒ admin ပိတ် ✖
ALTER TABLE notification_types ADD CONSTRAINT notification_types_mandatory_chk CHECK (NOT is_mandatory OR enabled);
-- Bell unread count (D-NTF-01)
CREATE INDEX notifications_unread ON notifications (user_id) WHERE read_at IS NULL AND deleted_at IS NULL;
-- 90 ရက် cleanup job (D-NTF-02)
CREATE INDEX notifications_created ON notifications (created_at);

-- ═══════════ attachments ═══════════
ALTER TABLE attachments ADD CONSTRAINT attachments_kind_chk CHECK (kind IN (1, 2, 3));
ALTER TABLE attachments ADD CONSTRAINT attachments_size_chk CHECK (size_bytes > 0);
-- v1.1 G (e): user ဖျက် = deleted_at + by · system (uploads.purge / exports.purge / single-image replace) = deleted_at + by NULL · by ပဲ (deleted_at မပါ) ✖
ALTER TABLE attachments ADD CONSTRAINT attachments_deleted_chk CHECK (deleted_by_user_id IS NULL OR deleted_at IS NOT NULL);

-- ═══════════ import (D-DAT-01) ═══════════
ALTER TABLE import_jobs ADD CONSTRAINT import_jobs_source_chk CHECK (source IN (1, 2));
ALTER TABLE import_jobs ADD CONSTRAINT import_jobs_status_chk CHECK (status IN (0, 1, 2, 3, 4));
ALTER TABLE import_jobs ADD CONSTRAINT import_jobs_counts_chk
  CHECK (total_rows >= 0 AND valid_rows >= 0 AND error_rows >= 0 AND imported_rows >= 0 AND valid_rows + error_rows <= total_rows AND imported_rows <= valid_rows);
-- upload → validate → preview → confirm (D-DAT-01) · CANCELLED / FAILED ⇒ confirm ✖
ALTER TABLE import_jobs ADD CONSTRAINT import_jobs_status_fields_chk CHECK (
  (status = 1 AND validated_at IS NULL AND confirmed_at IS NULL AND cancelled_at IS NULL)
  OR (status = 2 AND validated_at IS NOT NULL AND confirmed_at IS NULL AND cancelled_at IS NULL)
  OR (status = 3 AND validated_at IS NOT NULL AND confirmed_at IS NOT NULL AND confirmed_by_user_id IS NOT NULL AND cancelled_at IS NULL)
  OR (status = 0 AND cancelled_at IS NOT NULL AND confirmed_at IS NULL)
  OR (status = 4 AND error_message IS NOT NULL AND confirmed_at IS NULL)
);
ALTER TABLE import_job_rows ADD CONSTRAINT import_job_rows_status_chk CHECK (status IN (1, 2, 3, 4, 5));
ALTER TABLE import_job_rows ADD CONSTRAINT import_job_rows_row_chk CHECK (row_number >= 1);
-- ERROR ⇒ errors · IMPORTED / SKIPPED ⇒ entity_id
ALTER TABLE import_job_rows ADD CONSTRAINT import_job_rows_status_fields_chk CHECK (
  (status = 3 AND errors IS NOT NULL) OR (status IN (4, 5) AND entity_id IS NOT NULL) OR (status IN (1, 2) AND entity_id IS NULL)
);
ALTER TABLE import_source_refs ADD CONSTRAINT import_source_refs_source_chk CHECK (source IN (1, 2));
ALTER TABLE import_source_refs ADD CONSTRAINT import_source_refs_id_chk CHECK (btrim(source_id) <> '');

-- ═══════════ backup_runs (D-DAT-03 / 04) ═══════════
ALTER TABLE backup_runs ADD CONSTRAINT backup_runs_kind_chk   CHECK (kind IN (1, 2, 3, 4));
ALTER TABLE backup_runs ADD CONSTRAINT backup_runs_status_chk CHECK (status IN (1, 2, 3));
ALTER TABLE backup_runs ADD CONSTRAINT backup_runs_status_fields_chk CHECK (
  (status = 1 AND finished_at IS NULL)
  OR (status = 2 AND finished_at IS NOT NULL AND finished_at >= started_at AND error_message IS NULL)
  OR (status = 3 AND finished_at IS NOT NULL AND error_message IS NOT NULL AND btrim(error_message) <> '')
);
-- D-DAT-04: RESTORE ⇒ authorized user + reason · RESTORE_TEST ⇒ user (manual) ဒါမှမဟုတ် NULL (လစဉ် auto — sidecar, owner F9 · v1.1 G e)
ALTER TABLE backup_runs ADD CONSTRAINT backup_runs_restore_chk CHECK (
  (kind IN (1, 2) AND performed_by_user_id IS NULL AND reason IS NULL)
  OR (kind = 3)
  OR (kind = 4 AND performed_by_user_id IS NOT NULL AND reason IS NOT NULL AND btrim(reason) <> '')
);

-- ═══════════ website (D-WEB-04) ═══════════
ALTER TABLE branch_opening_hours ADD CONSTRAINT branch_opening_hours_dow_chk CHECK (day_of_week BETWEEN 1 AND 7);
ALTER TABLE branch_opening_hours ADD CONSTRAINT branch_opening_hours_time_chk CHECK (
  (is_closed AND opens_at IS NULL AND closes_at IS NULL)
  OR (NOT is_closed AND opens_at IS NOT NULL AND closes_at IS NOT NULL AND closes_at > opens_at)
);
ALTER TABLE branch_closures ADD CONSTRAINT branch_closures_dates_chk CHECK (end_date >= start_date);
ALTER TABLE branch_closures ADD CONSTRAINT branch_closures_notice_chk CHECK (btrim(notice_mm) <> '');
-- ရက် ထပ် ✖ (archive ပြီးသား မပါ)
ALTER TABLE branch_closures ADD CONSTRAINT branch_closures_no_overlap
  EXCLUDE USING gist (branch_id WITH =, daterange(start_date, end_date, '[]') WITH &&) WHERE (archived_at IS NULL);

-- ═══════════ App / job က စစ်ရမယ့်ဟာ ═══════════
-- · settings.key ∈ settings.json (type / scope / validation) · branch override = json scope: branch ပဲ · deploy sync: permissions.json / notifications.json / settings.json (default ကို DB မသိမ်း)
-- · app request တိုင်း: SET LOCAL app.user_id, app.request_id (audit actor) · app interceptor = audit_events source 1 (action + reason) — ငွေ table = trigger (source 2) ရော app (reason) ရော ၂ ကြောင်း ဖြစ်နိုင် (request_id နဲ့ တွဲကြည့်)
-- · notification recipient = type.default_recipient_rule + role / branch scope · mandatory type = user ပိတ် ✖ · 90 ရက် cleanup job · realtime push (WS / SSE)
-- · attachments entity_type / entity_id ရှိ (polymorphic) · services.image_attachment_id ⇒ kind 2 · size ≤ setting · storage cleanup job (deleted_at — system = deleted_by NULL, v1.1)
-- · import: VALIDATED ⇒ rows status 2 / 3 · CONFIRMED ⇒ valid rows → entity + import_source_refs · duplicate (source_id ရှိပြီး) ⇒ SKIPPED · audit import.confirm
-- · backup job: DAILY / WEEKLY row + retention delete (ဖိုင်) · FAILED ⇒ admin noti (notified_at) · လစဉ် RESTORE_TEST = auto (performed_by NULL — v1.1, F9) · RESTORE = admin + reason + audit
-- · website: branch_closures ⇒ /book branch ရွေး ✖ · is_public = false ⇒ website မပြ (booking link ကတော့ ရ) · site.* revalidate (§5.8)
