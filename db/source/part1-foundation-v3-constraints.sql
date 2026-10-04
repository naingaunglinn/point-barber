-- Point Barbershop — Part 1 v3 (v3.4 — 01/Oct/2026) · DBML မှာ ရေးလို့မရတဲ့ constraint များ (Prisma migration --create-only ထဲ ထည့်)

-- D-DB-03: status / type = သတ်မှတ်ထားတဲ့ number ပဲ
ALTER TABLE companies ADD CONSTRAINT companies_status_chk CHECK (status IN (0, 1));
ALTER TABLE branches  ADD CONSTRAINT branches_status_chk  CHECK (status IN (0, 1));
ALTER TABLE users     ADD CONSTRAINT users_status_chk     CHECK (status IN (0, 1, 2));        -- 0 DISABLED · 1 ACTIVE · 2 INVITED
ALTER TABLE employees ADD CONSTRAINT employees_status_chk CHECK (status IN (0, 1, 2, 3));     -- 0 INACTIVE · 1 ACTIVE · 2 RESIGNED · 3 TERMINATED
ALTER TABLE roles     ADD CONSTRAINT roles_status_chk     CHECK (status IN (0, 1));
ALTER TABLE employee_roles ADD CONSTRAINT employee_roles_scope_chk CHECK (scope_type IN (1, 2)); -- 1 COMPANY · 2 BRANCHES
-- v3.3 (OPEN-33 ✅): UI ဘာသာ — NULL = system default (nullable column → IS NULL အရင် — §6.5 #13)
ALTER TABLE users     ADD CONSTRAINT users_ui_language_chk  CHECK (ui_language IS NULL OR ui_language IN (1, 2)); -- 1 MY · 2 EN
-- v3.4 (OPEN-37 ✅): website barber rating — admin / manager ပေး; 1.0–5.0, 0.5 ခြား; NULL = မပြ
ALTER TABLE employees ADD CONSTRAINT employees_public_rating_chk
  CHECK (public_rating IS NULL OR (public_rating >= 1.0 AND public_rating <= 5.0 AND (public_rating * 2) = floor(public_rating * 2)));

-- ရက် / အချိန် အစဉ်
ALTER TABLE employee_branches ADD CONSTRAINT employee_branches_dates_chk
  CHECK (effective_to IS NULL OR effective_to >= effective_from);
ALTER TABLE employee_roles ADD CONSTRAINT employee_roles_times_chk
  CHECK (revoked_at IS NULL OR revoked_at >= assigned_at);

-- F-P1-04 (D-EMP-01): branch တစ်ခုကို ဖွင့်ထားတဲ့ assignment ၁ ခုပဲ (branch မတူရင် ရ)
CREATE UNIQUE INDEX employee_branches_one_open
  ON employee_branches (employee_id, branch_id) WHERE effective_to IS NULL;

-- F-P1-03 (D-ROLE-06): role တူ active assignment ၁ ခုပဲ
CREATE UNIQUE INDEX employee_roles_one_active
  ON employee_roles (employee_id, role_id) WHERE revoked_at IS NULL;

-- D-ORG-03 + D-DB-04: role နာမည် company အတွင်း unique (archive လုပ်ပြီးသားကို မတွက်)
CREATE UNIQUE INDEX roles_company_name_mm_active
  ON roles (company_id, name_mm) WHERE archived_at IS NULL;
