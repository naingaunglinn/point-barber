-- Point Barbershop — Part 2 v1 (🔒 D-DB-06) · Services / Scheduling · DBML မှာ ရေးလို့မရတဲ့ constraint
-- v1.1 (01/Oct/2026 — Part 2 DBML v1.3, 🔒 D-DB-06 v1.3 owner confirmed 01/Oct 21:20): eligibility_one_open မှာ archived_at IS NULL ထပ်ထည့် (archived row က open row အသစ်ကို မပိတ်ဆို့အောင်)
CREATE EXTENSION IF NOT EXISTS btree_gist;   -- EXCLUDE မှာ uuid (=) + range (&&) တွဲသုံးဖို့

-- D-DB-03: status / type number
ALTER TABLE service_categories ADD CONSTRAINT service_categories_status_chk CHECK (status IN (0, 1));
ALTER TABLE services           ADD CONSTRAINT services_status_chk           CHECK (status IN (0, 1));
ALTER TABLE services           ADD CONSTRAINT services_pricing_mode_chk     CHECK (pricing_mode IN (1, 2));
ALTER TABLE services           ADD CONSTRAINT services_buffer_chk           CHECK (buffer_minutes BETWEEN 0 AND 120);
ALTER TABLE branch_services    ADD CONSTRAINT branch_services_status_chk    CHECK (status IN (0, 1));
ALTER TABLE branch_services    ADD CONSTRAINT branch_services_duration_chk  CHECK (duration_minutes > 0);
ALTER TABLE service_prices     ADD CONSTRAINT service_prices_location_chk   CHECK (location_type IN (1, 2));
ALTER TABLE service_prices     ADD CONSTRAINT service_prices_amount_chk     CHECK (price_amount >= 0);
ALTER TABLE service_prices     ADD CONSTRAINT service_prices_duration_chk   CHECK (duration_minutes IS NULL OR duration_minutes > 0);
ALTER TABLE schedule_patterns  ADD CONSTRAINT schedule_patterns_dow_chk     CHECK (day_of_week BETWEEN 1 AND 7);
ALTER TABLE schedule_patterns  ADD CONSTRAINT schedule_patterns_time_chk    CHECK (end_time > start_time);
ALTER TABLE schedule_patterns  ADD CONSTRAINT schedule_patterns_dates_chk   CHECK (effective_to IS NULL OR effective_to >= effective_from);
ALTER TABLE schedule_shifts    ADD CONSTRAINT schedule_shifts_source_chk    CHECK (source IN (1, 2));
ALTER TABLE schedule_shifts    ADD CONSTRAINT schedule_shifts_time_chk      CHECK (ends_at > starts_at);
ALTER TABLE leave_types        ADD CONSTRAINT leave_types_status_chk        CHECK (status IN (0, 1));
ALTER TABLE leaves             ADD CONSTRAINT leaves_status_chk             CHECK (status IN (0, 1, 2, 3));
ALTER TABLE leaves             ADD CONSTRAINT leaves_portion_chk            CHECK (day_portion IN (1, 2, 3));
ALTER TABLE leaves             ADD CONSTRAINT leaves_dates_chk              CHECK (end_date >= start_date);
-- D-LV-03 / D-LV-05: နေ့တစ်ဝက်က ရက် ၁ ရက်ပဲ
ALTER TABLE leaves             ADD CONSTRAINT leaves_half_day_single_chk    CHECK (day_portion = 1 OR start_date = end_date);
ALTER TABLE employee_service_eligibilities ADD CONSTRAINT eligibility_dates_chk
  CHECK (effective_to IS NULL OR effective_to >= effective_from);

-- D-ORG-03 + D-DB-04: နာမည် company / group အတွင်း unique (archive ပြီးသားကို မတွက်)
CREATE UNIQUE INDEX service_categories_name_active ON service_categories (company_id, name_mm) WHERE archived_at IS NULL;
CREATE UNIQUE INDEX services_name_active           ON services (company_id, name_mm) WHERE archived_at IS NULL;
CREATE UNIQUE INDEX option_groups_name_active      ON service_option_groups (service_id, name_mm) WHERE archived_at IS NULL;
CREATE UNIQUE INDEX option_values_name_active      ON service_option_values (option_group_id, name_mm) WHERE archived_at IS NULL;
CREATE UNIQUE INDEX service_variants_key_active    ON service_variants (service_id, variant_key) WHERE archived_at IS NULL;
CREATE UNIQUE INDEX leave_types_name_active        ON leave_types (company_id, name_mm) WHERE archived_at IS NULL;

-- D-SVC-02/05: ဈေးက ဒီ branch ရောင်းတဲ့ service အတွက်ပဲ · variant က ဒီ service ရဲ့ဟာပဲ
ALTER TABLE service_prices ADD CONSTRAINT service_prices_branch_service_fk
  FOREIGN KEY (branch_id, service_id) REFERENCES branch_services (branch_id, service_id);
ALTER TABLE service_prices ADD CONSTRAINT service_prices_variant_service_fk
  FOREIGN KEY (service_variant_id, service_id) REFERENCES service_variants (id, service_id);
-- D-SVC-08: ဈေး key တူ + ရက် ထပ် ✖ (NULL variant / employee ကိုလည်း တူတယ်လို့ ယူ — COALESCE)
ALTER TABLE service_prices ADD CONSTRAINT service_prices_dates_chk
  CHECK (effective_to IS NULL OR effective_to >= effective_from);
ALTER TABLE service_prices ADD CONSTRAINT service_prices_no_overlap
  EXCLUDE USING gist (
    branch_id WITH =,
    service_id WITH =,
    (COALESCE(service_variant_id, '00000000-0000-0000-0000-000000000000'::uuid)) WITH =,
    location_type WITH =,
    (COALESCE(employee_id, '00000000-0000-0000-0000-000000000000'::uuid)) WITH =,
    daterange(effective_from, effective_to, '[]') WITH &&
  ) WHERE (archived_at IS NULL);

-- D-EMP-05
ALTER TABLE employee_service_eligibilities ADD CONSTRAINT eligibility_branch_service_fk
  FOREIGN KEY (branch_id, service_id) REFERENCES branch_services (branch_id, service_id);
CREATE UNIQUE INDEX eligibility_one_open
  ON employee_service_eligibilities (employee_id, branch_id, service_id) WHERE effective_to IS NULL AND archived_at IS NULL;  -- v1.1: archived_at

-- D-SCH-02: ဝန်ထမ်း တစ်ယောက်ရဲ့ shift အချိန်ထပ် ✖ (branch မတူလည်း) · [) = ထိစပ်ရုံ ရ
ALTER TABLE schedule_shifts ADD CONSTRAINT schedule_shifts_no_overlap
  EXCLUDE USING gist (employee_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&)
  WHERE (archived_at IS NULL);
-- shift_date = starts_at ရဲ့ MMT ရက် (D-PLT-15)
ALTER TABLE schedule_shifts ADD CONSTRAINT schedule_shifts_date_chk
  CHECK (shift_date = (starts_at AT TIME ZONE 'Asia/Yangon')::date);

-- D-LV-02: ခွင့် overlap ✖ (PENDING / APPROVED) — နေ့တစ်ဝက် unit နဲ့ (မနက် + ညနေ တစ်ရက်တည်း = ရ)
-- unit = (ရက် − 2000-01-01) × 2 (+1 = ညနေ) · setting (13:00) ပြောင်းလည်း constraint မပျက်
ALTER TABLE leaves ADD COLUMN half_day_units int4range GENERATED ALWAYS AS (
  int4range(
    (start_date - DATE '2000-01-01') * 2 + CASE WHEN day_portion = 3 THEN 1 ELSE 0 END,
    (end_date   - DATE '2000-01-01') * 2 + CASE WHEN day_portion = 2 THEN 1 ELSE 2 END
  )
) STORED;
ALTER TABLE leaves ADD CONSTRAINT leaves_no_overlap
  EXCLUDE USING gist (employee_id WITH =, half_day_units WITH &&)
  WHERE (status IN (1, 2));
