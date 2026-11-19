-- Point Barbershop — Part 1b v1 · Login · DBML မှာ ရေးလို့မရတဲ့ constraint

-- users (column တွေက part1-foundation-v3.2.dbml ထဲမှာ)
ALTER TABLE users ADD CONSTRAINT users_failed_login_count_chk CHECK (failed_login_count >= 0);

-- login_otps
ALTER TABLE login_otps ADD CONSTRAINT login_otps_expiry_chk CHECK (expires_at > created_at);

-- user_sessions (D-DB-03)
ALTER TABLE user_sessions ADD CONSTRAINT user_sessions_login_method_chk CHECK (login_method IN (1, 2));
ALTER TABLE user_sessions ADD CONSTRAINT user_sessions_revoke_reason_chk CHECK (revoke_reason IS NULL OR revoke_reason IN (1, 2, 3, 4));
ALTER TABLE user_sessions ADD CONSTRAINT user_sessions_revoke_pair_chk
  CHECK ((revoked_at IS NULL) = (revoke_reason IS NULL));

-- My Devices / request စစ်တာ မြန်အောင် — active session ပဲ
CREATE INDEX user_sessions_active_by_user ON user_sessions (user_id) WHERE revoked_at IS NULL;
