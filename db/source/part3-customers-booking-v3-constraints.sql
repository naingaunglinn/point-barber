-- Point Barbershop — Part 3 v3 (🔒 D-DB-07) · Customers / Booking · DBML မှာ ရေးလို့မရတဲ့ constraint
-- Part 2 SQL က btree_gist extension ဖွင့်ပြီးသား (EXCLUDE)

-- D-DB-03: status / type number
ALTER TABLE customers ADD CONSTRAINT customers_status_chk CHECK (status IN (0, 1));
-- D-CUS-02: E.164 ပုံစံ (+ နဲ့ စ၊ ဂဏန်း ၇–၁၅ လုံး)
ALTER TABLE customers ADD CONSTRAINT customers_phone_e164_chk CHECK (phone_normalized ~ '^\+[1-9][0-9]{6,14}$');

ALTER TABLE booking_cancel_reasons ADD CONSTRAINT booking_cancel_reasons_status_chk CHECK (status IN (0, 1));
ALTER TABLE booking_cancel_reasons ADD CONSTRAINT booking_cancel_reasons_system_code_chk CHECK (system_code IS NULL OR system_code IN (1));
CREATE UNIQUE INDEX booking_cancel_reasons_system_code_uq
  ON booking_cancel_reasons (company_id, system_code) WHERE system_code IS NOT NULL;
CREATE UNIQUE INDEX booking_cancel_reasons_name_active
  ON booking_cancel_reasons (company_id, name_mm) WHERE archived_at IS NULL;

ALTER TABLE bookings ADD CONSTRAINT bookings_status_chk        CHECK (status IN (0, 1, 2, 3));      -- 0 CANCELLED · 1 BOOKED · 2 STARTED · 3 COMPLETED
ALTER TABLE bookings ADD CONSTRAINT bookings_location_chk      CHECK (location_type IN (1, 2));     -- 1 BRANCH · 2 HOME
ALTER TABLE bookings ADD CONSTRAINT bookings_channel_chk       CHECK (channel IN (1, 2));           -- 1 ONLINE · 2 STAFF
ALTER TABLE bookings ADD CONSTRAINT bookings_cancel_actor_chk  CHECK (cancelled_by_actor IS NULL OR cancelled_by_actor IN (1, 2, 3));

-- အချိန် အစဉ် · block က ချိန်းချိန်ကို အုပ်ရမယ် (F-BK-16)
ALTER TABLE bookings ADD CONSTRAINT bookings_time_chk  CHECK (ends_at > starts_at);
ALTER TABLE bookings ADD CONSTRAINT bookings_block_chk CHECK (block_starts_at <= starts_at AND block_ends_at >= ends_at);
-- D-PLT-15: business_date = starts_at ရဲ့ MMT ရက်
ALTER TABLE bookings ADD CONSTRAINT bookings_business_date_chk
  CHECK (business_date = (starts_at AT TIME ZONE 'Asia/Yangon')::date);

-- D-BKG-22 / D-SVC-06: HOME ⇔ လိပ်စာ + ကားခ · BRANCH ဆို မရှိ
ALTER TABLE bookings ADD CONSTRAINT bookings_home_chk CHECK (
  (location_type = 2 AND home_address IS NOT NULL AND btrim(home_address) <> ''
                     AND transport_fee_amount IS NOT NULL AND transport_fee_amount >= 0)
  OR
  (location_type = 1 AND home_address IS NULL AND home_address_note IS NULL AND transport_fee_amount IS NULL)
);

-- F-BK-11 (D-BKG-09 v5.1): STAFF ⇔ ထည့်သူ
ALTER TABLE bookings ADD CONSTRAINT bookings_channel_user_chk CHECK (
  (channel = 2 AND created_by_user_id IS NOT NULL) OR (channel = 1 AND created_by_user_id IS NULL)
);

-- D-BKG-14 / D-BKG-16 / F-BK-09: CANCELLED ⇔ cancel field တွေ · STAFF ဆို user
ALTER TABLE bookings ADD CONSTRAINT bookings_cancel_fields_chk CHECK (
  (status = 0 AND cancelled_at IS NOT NULL AND cancel_reason_id IS NOT NULL AND cancelled_by_actor IS NOT NULL)
  OR
  (status <> 0 AND cancelled_at IS NULL AND cancel_reason_id IS NULL AND cancel_note IS NULL
               AND cancelled_by_actor IS NULL AND cancelled_by_user_id IS NULL)
);
ALTER TABLE bookings ADD CONSTRAINT bookings_cancel_staff_user_chk CHECK (
  cancelled_by_actor IS DISTINCT FROM 2 OR cancelled_by_user_id IS NOT NULL
);

-- 🔒 D-BKG-08: barber တစ်ယောက်ရဲ့ ပိတ်ချိန် ထပ် ✖ (branch မတူလည်း၊ buffer + home သွား / ပြန်ချိန် ပါ) · [) = ထိစပ်ရုံ ရ
ALTER TABLE bookings ADD CONSTRAINT bookings_no_overlap
  EXCLUDE USING gist (
    booked_employee_id WITH =,
    tstzrange(block_starts_at, block_ends_at, '[)') WITH &&
  ) WHERE (status IN (1, 2));

-- D-BKG-17: no-show timer ရှာဖို့ (BOOKED ပဲ)
CREATE INDEX bookings_booked_by_start ON bookings (starts_at) WHERE status = 1;

-- D-BKG-09 (v5.1): active booking ၁ ခု — DB index မသုံး (STAFF ကန့်သတ်မရှိ)
-- ONLINE booking မှာ app က: SELECT … FROM customers WHERE id = $1 FOR UPDATE → active (1, 2) ရှိရင် ပယ်

-- booking_items
ALTER TABLE booking_items ADD CONSTRAINT booking_items_amount_chk   CHECK (unit_price_amount >= 0);
ALTER TABLE booking_items ADD CONSTRAINT booking_items_duration_chk CHECK (duration_minutes > 0);
ALTER TABLE booking_items ADD CONSTRAINT booking_items_buffer_chk   CHECK (buffer_minutes BETWEEN 0 AND 120);
-- D-SVC-05: variant က ဒီ service ရဲ့ဟာပဲ (Part 2 ရဲ့ service_variants (id, service_id) unique ကို သုံး)
ALTER TABLE booking_items ADD CONSTRAINT booking_items_variant_service_fk
  FOREIGN KEY (service_variant_id, service_id) REFERENCES service_variants (id, service_id);
