CREATE TABLE "companies" (
  "id" uuid PRIMARY KEY,
  "name_mm" varchar(255) NOT NULL,
  "name_en" varchar(255),
  "logo_url" text,
  "phone" varchar(50),
  "email" varchar(255),
  "address_mm" text,
  "address_en" text,
  "website_url" text,
  "social_links" jsonb,
  "status" smallint NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now()),
  "archived_at" timestamptz
);

CREATE TABLE "branches" (
  "id" uuid PRIMARY KEY,
  "company_id" uuid NOT NULL,
  "code" varchar(50) NOT NULL,
  "name_mm" varchar(255) NOT NULL,
  "name_en" varchar(255),
  "phone" varchar(50),
  "email" varchar(255),
  "address_mm" text,
  "address_en" text,
  "website_url" text,
  "social_links" jsonb,
  "latitude" numeric(10,7),
  "longitude" numeric(10,7),
  "location_radius_meters" integer,
  "is_public" boolean NOT NULL DEFAULT true,
  "map_url" text,
  "status" smallint NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now()),
  "archived_at" timestamptz
);

CREATE TABLE "users" (
  "id" uuid PRIMARY KEY,
  "email" varchar(255) UNIQUE NOT NULL,
  "status" smallint NOT NULL DEFAULT 2,
  "last_login_at" timestamptz,
  "google_subject" varchar(255) UNIQUE,
  "invited_at" timestamptz,
  "invited_by_user_id" uuid,
  "invite_last_sent_at" timestamptz,
  "activated_at" timestamptz,
  "failed_login_count" smallint NOT NULL DEFAULT 0,
  "login_locked_until" timestamptz,
  "ui_language" smallint,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now()),
  "archived_at" timestamptz
);

CREATE TABLE "employees" (
  "id" uuid PRIMARY KEY,
  "company_id" uuid NOT NULL,
  "user_id" uuid UNIQUE NOT NULL,
  "employee_code" varchar(100) NOT NULL,
  "name_mm" varchar(255) NOT NULL,
  "name_en" varchar(255),
  "phone" varchar(50),
  "photo_url" text,
  "public_profile" boolean NOT NULL DEFAULT false,
  "public_specialty_mm" varchar(200),
  "public_specialty_en" varchar(200),
  "show_own_earnings" boolean,
  "public_rating" numeric(2,1),
  "join_date" date,
  "status" smallint NOT NULL DEFAULT 1,
  "internal_notes" text,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now()),
  "archived_at" timestamptz
);

CREATE TABLE "employee_branches" (
  "id" uuid PRIMARY KEY,
  "employee_id" uuid NOT NULL,
  "branch_id" uuid NOT NULL,
  "effective_from" date NOT NULL,
  "effective_to" date,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "roles" (
  "id" uuid PRIMARY KEY,
  "company_id" uuid NOT NULL,
  "name_mm" varchar(100) NOT NULL,
  "name_en" varchar(100),
  "description_mm" text,
  "description_en" text,
  "status" smallint NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now()),
  "archived_at" timestamptz
);

CREATE TABLE "permissions" (
  "id" uuid PRIMARY KEY,
  "code" varchar(200) UNIQUE NOT NULL,
  "module" varchar(100) NOT NULL,
  "action" varchar(100) NOT NULL,
  "description" text,
  "archived_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "role_permissions" (
  "id" uuid PRIMARY KEY,
  "role_id" uuid NOT NULL,
  "permission_id" uuid NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "employee_roles" (
  "id" uuid PRIMARY KEY,
  "employee_id" uuid NOT NULL,
  "role_id" uuid NOT NULL,
  "scope_type" smallint NOT NULL,
  "assigned_at" timestamptz NOT NULL,
  "revoked_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "employee_role_branches" (
  "id" uuid PRIMARY KEY,
  "employee_role_id" uuid NOT NULL,
  "branch_id" uuid NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "login_otps" (
  "id" uuid PRIMARY KEY,
  "user_id" uuid NOT NULL,
  "code_hash" varchar(255) NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "consumed_at" timestamptz,
  "request_ip" inet,
  "created_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "user_sessions" (
  "id" uuid PRIMARY KEY,
  "user_id" uuid NOT NULL,
  "token_hash" varchar(255) UNIQUE NOT NULL,
  "login_method" smallint NOT NULL,
  "device_label" varchar(255),
  "user_agent" text,
  "ip_address" inet,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "last_seen_at" timestamptz NOT NULL DEFAULT (now()),
  "revoked_at" timestamptz,
  "revoked_by_user_id" uuid,
  "revoke_reason" smallint
);

CREATE TABLE "service_categories" (
  "id" uuid PRIMARY KEY,
  "company_id" uuid NOT NULL,
  "name_mm" varchar(150) NOT NULL,
  "name_en" varchar(150),
  "sort_order" integer NOT NULL DEFAULT 0,
  "status" smallint NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now()),
  "archived_at" timestamptz
);

CREATE TABLE "services" (
  "id" uuid PRIMARY KEY,
  "company_id" uuid NOT NULL,
  "category_id" uuid NOT NULL,
  "name_mm" varchar(200) NOT NULL,
  "name_en" varchar(200),
  "description_mm" text,
  "description_en" text,
  "pricing_mode" smallint NOT NULL DEFAULT 1,
  "buffer_minutes" smallint NOT NULL DEFAULT 0,
  "show_on_website" boolean NOT NULL DEFAULT true,
  "public_description_mm" text,
  "public_description_en" text,
  "image_attachment_id" uuid,
  "sort_order" integer NOT NULL DEFAULT 0,
  "status" smallint NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now()),
  "archived_at" timestamptz
);

CREATE TABLE "branch_services" (
  "id" uuid PRIMARY KEY,
  "branch_id" uuid NOT NULL,
  "service_id" uuid NOT NULL,
  "duration_minutes" integer NOT NULL,
  "status" smallint NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "service_option_groups" (
  "id" uuid PRIMARY KEY,
  "service_id" uuid NOT NULL,
  "name_mm" varchar(100) NOT NULL,
  "name_en" varchar(100),
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now()),
  "archived_at" timestamptz
);

CREATE TABLE "service_option_values" (
  "id" uuid PRIMARY KEY,
  "option_group_id" uuid NOT NULL,
  "name_mm" varchar(100) NOT NULL,
  "name_en" varchar(100),
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now()),
  "archived_at" timestamptz
);

CREATE TABLE "service_variants" (
  "id" uuid PRIMARY KEY,
  "service_id" uuid NOT NULL,
  "variant_key" varchar(500) NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "archived_at" timestamptz
);

CREATE TABLE "service_variant_values" (
  "id" uuid PRIMARY KEY,
  "service_variant_id" uuid NOT NULL,
  "option_value_id" uuid NOT NULL
);

CREATE TABLE "service_prices" (
  "id" uuid PRIMARY KEY,
  "branch_id" uuid NOT NULL,
  "service_id" uuid NOT NULL,
  "service_variant_id" uuid,
  "location_type" smallint NOT NULL DEFAULT 1,
  "employee_id" uuid,
  "price_amount" bigint NOT NULL,
  "duration_minutes" integer,
  "effective_from" date NOT NULL,
  "effective_to" date,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now()),
  "archived_at" timestamptz
);

CREATE TABLE "employee_service_eligibilities" (
  "id" uuid PRIMARY KEY,
  "employee_id" uuid NOT NULL,
  "branch_id" uuid NOT NULL,
  "service_id" uuid NOT NULL,
  "home_allowed" boolean NOT NULL DEFAULT false,
  "effective_from" date NOT NULL,
  "effective_to" date,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now())
,
  "archived_at" timestamptz);

CREATE TABLE "schedule_patterns" (
  "id" uuid PRIMARY KEY,
  "employee_id" uuid NOT NULL,
  "branch_id" uuid NOT NULL,
  "day_of_week" smallint NOT NULL,
  "start_time" time NOT NULL,
  "end_time" time NOT NULL,
  "effective_from" date NOT NULL,
  "effective_to" date,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now())
,
  "archived_at" timestamptz);

CREATE TABLE "schedule_shifts" (
  "id" uuid PRIMARY KEY,
  "employee_id" uuid NOT NULL,
  "branch_id" uuid NOT NULL,
  "shift_date" date NOT NULL,
  "starts_at" timestamptz NOT NULL,
  "ends_at" timestamptz NOT NULL,
  "source" smallint NOT NULL,
  "schedule_pattern_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now()),
  "archived_at" timestamptz
);

CREATE TABLE "leave_types" (
  "id" uuid PRIMARY KEY,
  "company_id" uuid NOT NULL,
  "name_mm" varchar(100) NOT NULL,
  "name_en" varchar(100),
  "is_paid" boolean NOT NULL,
  "sort_order" integer NOT NULL DEFAULT 0,
  "status" smallint NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now()),
  "archived_at" timestamptz
);

CREATE TABLE "leaves" (
  "id" uuid PRIMARY KEY,
  "employee_id" uuid NOT NULL,
  "leave_type_id" uuid NOT NULL,
  "start_date" date NOT NULL,
  "end_date" date NOT NULL,
  "day_portion" smallint NOT NULL DEFAULT 1,
  "status" smallint NOT NULL DEFAULT 1,
  "reason" text,
  "requested_by_user_id" uuid NOT NULL,
  "decided_by_user_id" uuid,
  "decided_at" timestamptz,
  "decision_note" text,
  "cancelled_by_user_id" uuid,
  "cancelled_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "customers" (
  "id" uuid PRIMARY KEY,
  "company_id" uuid NOT NULL,
  "name" varchar(255) NOT NULL,
  "phone" varchar(50) NOT NULL,
  "phone_normalized" varchar(20) NOT NULL,
  "notes" text,
  "status" smallint NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now()),
  "archived_at" timestamptz
);

CREATE TABLE "booking_cancel_reasons" (
  "id" uuid PRIMARY KEY,
  "company_id" uuid NOT NULL,
  "name_mm" varchar(150) NOT NULL,
  "name_en" varchar(150),
  "requires_note" boolean NOT NULL DEFAULT false,
  "system_code" smallint,
  "sort_order" integer NOT NULL DEFAULT 0,
  "status" smallint NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now()),
  "archived_at" timestamptz
);

CREATE TABLE "bookings" (
  "id" uuid PRIMARY KEY,
  "branch_id" uuid NOT NULL,
  "customer_id" uuid NOT NULL,
  "customer_name" varchar(255) NOT NULL,
  "booked_employee_id" uuid NOT NULL,
  "location_type" smallint NOT NULL DEFAULT 1,
  "home_address" text,
  "home_address_note" text,
  "transport_fee_amount" bigint,
  "channel" smallint NOT NULL,
  "created_by_user_id" uuid,
  "starts_at" timestamptz NOT NULL,
  "ends_at" timestamptz NOT NULL,
  "block_starts_at" timestamptz NOT NULL,
  "block_ends_at" timestamptz NOT NULL,
  "business_date" date NOT NULL,
  "status" smallint NOT NULL DEFAULT 1,
  "cancelled_at" timestamptz,
  "cancel_reason_id" uuid,
  "cancel_note" text,
  "cancelled_by_actor" smallint,
  "cancelled_by_user_id" uuid,
  "manage_token_hash" varchar(255) UNIQUE NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "booking_items" (
  "id" uuid PRIMARY KEY,
  "booking_id" uuid NOT NULL,
  "sort_order" smallint NOT NULL,
  "service_id" uuid NOT NULL,
  "service_variant_id" uuid,
  "unit_price_amount" bigint NOT NULL,
  "duration_minutes" integer NOT NULL,
  "buffer_minutes" smallint NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "visits" (
  "id" uuid PRIMARY KEY,
  "client_request_id" uuid UNIQUE NOT NULL,
  "branch_id" uuid NOT NULL,
  "booking_id" uuid,
  "performed_by_employee_id" uuid NOT NULL,
  "performer_change_reason" text,
  "proxy_reason" smallint,
  "location_type" smallint NOT NULL DEFAULT 1,
  "home_address" text,
  "status" smallint NOT NULL DEFAULT 1,
  "started_at" timestamptz NOT NULL,
  "started_by_user_id" uuid NOT NULL,
  "completed_at" timestamptz,
  "completed_by_user_id" uuid,
  "finished_at" timestamptz,
  "incomplete_reason" text,
  "incomplete_at" timestamptz,
  "incomplete_by_user_id" uuid,
  "is_late_entry" boolean NOT NULL DEFAULT false,
  "late_entry_reason" smallint,
  "late_entry_note" text,
  "business_date" date NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "sales" (
  "id" uuid PRIMARY KEY,
  "client_request_id" uuid UNIQUE NOT NULL,
  "branch_id" uuid NOT NULL,
  "visit_id" uuid UNIQUE,
  "customer_id" uuid,
  "status" smallint NOT NULL DEFAULT 1,
  "subtotal_amount" bigint NOT NULL DEFAULT 0,
  "discount_amount" bigint NOT NULL DEFAULT 0,
  "discount_code_id" uuid,
  "discount_request_id" uuid,
  "service_charge_rate" numeric(5,2) NOT NULL DEFAULT 0,
  "service_charge_amount" bigint NOT NULL DEFAULT 0,
  "tax_rate" numeric(5,2) NOT NULL DEFAULT 0,
  "tax_amount" bigint NOT NULL DEFAULT 0,
  "total_amount" bigint NOT NULL DEFAULT 0,
  "receipt_number" varchar(40) UNIQUE,
  "receipt_year" smallint,
  "receipt_month" smallint,
  "receipt_seq" integer,
  "business_date" date,
  "finished_at" timestamptz,
  "finished_by_user_id" uuid,
  "cancelled_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "sale_items" (
  "id" uuid PRIMARY KEY,
  "sale_id" uuid NOT NULL,
  "sort_order" smallint NOT NULL,
  "line_type" smallint NOT NULL,
  "service_id" uuid,
  "service_variant_id" uuid,
  "product_id" uuid,
  "booking_item_id" uuid,
  "performed_by_employee_id" uuid,
  "description_mm" varchar(300) NOT NULL,
  "description_en" varchar(300),
  "quantity" integer NOT NULL DEFAULT 1,
  "list_price_amount" bigint NOT NULL,
  "unit_price_amount" bigint NOT NULL,
  "price_override_reason" text,
  "price_override_by_user_id" uuid,
  "line_discount_amount" bigint NOT NULL DEFAULT 0,
  "added_reason" text,
  "removed_at" timestamptz,
  "removed_by_user_id" uuid,
  "removed_reason" text,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "payment_methods" (
  "id" uuid PRIMARY KEY,
  "company_id" uuid NOT NULL,
  "code" varchar(30) NOT NULL,
  "name_mm" varchar(100) NOT NULL,
  "name_en" varchar(100),
  "kind" smallint NOT NULL,
  "is_cash" boolean NOT NULL DEFAULT false,
  "requires_reference" boolean NOT NULL DEFAULT false,
  "requires_verification" boolean NOT NULL DEFAULT false,
  "reference_regex" varchar(200),
  "sort_order" integer NOT NULL DEFAULT 0,
  "status" smallint NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now()),
  "archived_at" timestamptz
);

CREATE TABLE "payments" (
  "id" uuid PRIMARY KEY,
  "client_request_id" uuid UNIQUE NOT NULL,
  "sale_id" uuid NOT NULL,
  "payment_method_id" uuid NOT NULL,
  "amount" bigint NOT NULL,
  "collected_by_employee_id" uuid NOT NULL,
  "received_at" timestamptz NOT NULL,
  "recorded_by_user_id" uuid NOT NULL,
  "external_reference" varchar(100),
  "verified_at" timestamptz,
  "verified_by_user_id" uuid,
  "voided_at" timestamptz,
  "voided_by_user_id" uuid,
  "void_reason" text,
  "created_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "receipt_counters" (
  "branch_id" uuid NOT NULL,
  "kind" smallint NOT NULL,
  "receipt_year" smallint NOT NULL,
  "receipt_month" smallint NOT NULL,
  "last_seq" integer NOT NULL DEFAULT 0,
  "updated_at" timestamptz NOT NULL DEFAULT (now()),
  PRIMARY KEY ("branch_id", "kind", "receipt_year", "receipt_month")
);

CREATE TABLE "discount_codes" (
  "id" uuid PRIMARY KEY,
  "company_id" uuid NOT NULL,
  "code" varchar(40) NOT NULL,
  "name_mm" varchar(150) NOT NULL,
  "name_en" varchar(150),
  "discount_type" smallint NOT NULL,
  "discount_percent" smallint,
  "discount_amount" bigint,
  "is_public" boolean NOT NULL DEFAULT false,
  "once_per_customer" boolean NOT NULL DEFAULT false,
  "max_uses" integer,
  "scope_type" smallint NOT NULL DEFAULT 1,
  "valid_from" date,
  "valid_to" date,
  "status" smallint NOT NULL DEFAULT 1,
  "created_by_user_id" uuid NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now()),
  "archived_at" timestamptz
);

CREATE TABLE "discount_code_branches" (
  "id" uuid PRIMARY KEY,
  "discount_code_id" uuid NOT NULL,
  "branch_id" uuid NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "discount_code_customer_uses" (
  "id" uuid PRIMARY KEY,
  "discount_code_id" uuid NOT NULL,
  "customer_id" uuid NOT NULL,
  "sale_id" uuid NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "discount_requests" (
  "id" uuid PRIMARY KEY,
  "sale_id" uuid NOT NULL,
  "requested_by_user_id" uuid NOT NULL,
  "requested_at" timestamptz NOT NULL DEFAULT (now()),
  "discount_type" smallint NOT NULL,
  "discount_percent" smallint,
  "discount_amount" bigint,
  "reason" text NOT NULL,
  "status" smallint NOT NULL DEFAULT 1,
  "decided_by_user_id" uuid,
  "decided_at" timestamptz,
  "decision_note" text,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "refunds" (
  "id" uuid PRIMARY KEY,
  "client_request_id" uuid UNIQUE NOT NULL,
  "sale_id" uuid NOT NULL,
  "branch_id" uuid NOT NULL,
  "kind" smallint NOT NULL,
  "payment_method_id" uuid NOT NULL,
  "amount" bigint NOT NULL,
  "external_reference" varchar(100),
  "reason" text NOT NULL,
  "refund_receipt_number" varchar(40) UNIQUE NOT NULL,
  "receipt_year" smallint NOT NULL,
  "receipt_month" smallint NOT NULL,
  "receipt_seq" integer NOT NULL,
  "business_date" date NOT NULL,
  "refunded_at" timestamptz NOT NULL,
  "refunded_by_user_id" uuid NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "refund_items" (
  "id" uuid PRIMARY KEY,
  "refund_id" uuid NOT NULL,
  "sale_item_id" uuid NOT NULL,
  "quantity" integer NOT NULL DEFAULT 1,
  "amount" bigint NOT NULL
);

CREATE TABLE "sale_adjustments" (
  "id" uuid PRIMARY KEY,
  "sale_id" uuid NOT NULL,
  "adjustment_type" smallint NOT NULL,
  "payment_id" uuid,
  "sale_item_id" uuid,
  "new_payment_method_id" uuid,
  "new_employee_id" uuid,
  "reason" text NOT NULL,
  "adjusted_by_user_id" uuid NOT NULL,
  "adjusted_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "commission_plans" (
  "id" uuid PRIMARY KEY,
  "company_id" uuid NOT NULL,
  "name_mm" varchar(150) NOT NULL,
  "name_en" varchar(150),
  "description_mm" text,
  "status" smallint NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now()),
  "archived_at" timestamptz
);

CREATE TABLE "commission_plan_tiers" (
  "id" uuid PRIMARY KEY,
  "commission_plan_id" uuid NOT NULL,
  "tier_order" smallint NOT NULL,
  "from_amount" bigint NOT NULL,
  "to_amount" bigint,
  "rate_percent" numeric(5,2) NOT NULL
);

CREATE TABLE "employee_commission_plans" (
  "id" uuid PRIMARY KEY,
  "employee_id" uuid NOT NULL,
  "commission_plan_id" uuid NOT NULL,
  "branch_id" uuid,
  "effective_from" date NOT NULL,
  "effective_to" date,
  "assigned_by_user_id" uuid NOT NULL,
  "note" text,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now()),
  "archived_at" timestamptz,
  "archived_by_user_id" uuid,
  "archive_reason" text
);

CREATE TABLE "commission_results" (
  "id" uuid PRIMARY KEY,
  "payroll_run_id" uuid NOT NULL,
  "employee_id" uuid NOT NULL,
  "employee_commission_plan_id" uuid NOT NULL,
  "commissionable_amount" bigint NOT NULL DEFAULT 0,
  "commission_amount" bigint NOT NULL DEFAULT 0,
  "effective_rate_percent" numeric(7,4) NOT NULL DEFAULT 0,
  "tier_breakdown" jsonb,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "commission_result_lines" (
  "id" uuid PRIMARY KEY,
  "commission_result_id" uuid NOT NULL,
  "kind" smallint NOT NULL,
  "sale_item_id" uuid,
  "refund_item_id" uuid,
  "original_line_id" uuid,
  "branch_id" uuid NOT NULL,
  "base_amount" bigint NOT NULL,
  "rate_percent" numeric(7,4) NOT NULL,
  "commission_amount" bigint NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "employee_salaries" (
  "id" uuid PRIMARY KEY,
  "employee_id" uuid NOT NULL,
  "basic_salary_amount" bigint NOT NULL,
  "effective_from" date NOT NULL,
  "effective_to" date,
  "set_by_user_id" uuid NOT NULL,
  "note" text,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now()),
  "archived_at" timestamptz,
  "archived_by_user_id" uuid,
  "archive_reason" text
);

CREATE TABLE "payroll_line_categories" (
  "id" uuid PRIMARY KEY,
  "company_id" uuid NOT NULL,
  "name_mm" varchar(150) NOT NULL,
  "name_en" varchar(150),
  "kind" smallint NOT NULL,
  "system_code" smallint,
  "sort_order" integer NOT NULL DEFAULT 0,
  "status" smallint NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now()),
  "archived_at" timestamptz
);

CREATE TABLE "payroll_runs" (
  "id" uuid PRIMARY KEY,
  "company_id" uuid NOT NULL,
  "period_type" smallint NOT NULL DEFAULT 1,
  "period_start" date NOT NULL,
  "period_end" date NOT NULL,
  "status" smallint NOT NULL DEFAULT 1,
  "rules_snapshot" jsonb,
  "calculated_at" timestamptz,
  "calculated_by_user_id" uuid,
  "finalized_at" timestamptz,
  "finalized_by_user_id" uuid,
  "published_at" timestamptz,
  "published_by_user_id" uuid,
  "paid_at" timestamptz,
  "paid_by_user_id" uuid,
  "paid_note" text,
  "reopen_count" smallint NOT NULL DEFAULT 0,
  "last_reopened_at" timestamptz,
  "last_reopened_by_user_id" uuid,
  "last_reopen_reason" text,
  "cancelled_at" timestamptz,
  "created_by_user_id" uuid NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "payroll_entries" (
  "id" uuid PRIMARY KEY,
  "payroll_run_id" uuid NOT NULL,
  "employee_id" uuid NOT NULL,
  "basic_salary_amount" bigint NOT NULL DEFAULT 0,
  "gross_amount" bigint NOT NULL DEFAULT 0,
  "deduction_amount" bigint NOT NULL DEFAULT 0,
  "net_amount" bigint NOT NULL DEFAULT 0,
  "late_count" smallint NOT NULL DEFAULT 0,
  "late_minutes" integer NOT NULL DEFAULT 0,
  "absent_days" numeric(4,1) NOT NULL DEFAULT 0,
  "unpaid_leave_days" numeric(4,1) NOT NULL DEFAULT 0,
  "scheduled_days" numeric(4,1) NOT NULL DEFAULT 0,
  "note" text,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "payroll_lines" (
  "id" uuid PRIMARY KEY,
  "payroll_entry_id" uuid NOT NULL,
  "category_id" uuid NOT NULL,
  "kind" smallint NOT NULL,
  "source" smallint NOT NULL,
  "description_mm" varchar(300) NOT NULL,
  "description_en" varchar(300),
  "amount" bigint NOT NULL,
  "auto_amount" bigint,
  "override_reason" text,
  "override_by_user_id" uuid,
  "commission_result_id" uuid,
  "employee_receivable_id" uuid,
  "sort_order" smallint NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "payroll_attendance_items" (
  "id" uuid PRIMARY KEY,
  "payroll_entry_id" uuid NOT NULL,
  "item_date" date NOT NULL,
  "item_type" smallint NOT NULL,
  "attendance_exception_id" uuid,
  "leave_id" uuid,
  "minutes" integer,
  "day_portion" numeric(3,1),
  "auto_deduction_amount" bigint NOT NULL DEFAULT 0,
  "deduction_amount" bigint NOT NULL DEFAULT 0,
  "override_reason" text,
  "override_by_user_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "payroll_entry_branch_allocations" (
  "id" uuid PRIMARY KEY,
  "payroll_entry_id" uuid NOT NULL,
  "branch_id" uuid NOT NULL,
  "ratio" numeric(7,4) NOT NULL,
  "allocated_gross_amount" bigint NOT NULL,
  "basis" smallint NOT NULL
);

CREATE TABLE "employee_receivables" (
  "id" uuid PRIMARY KEY,
  "client_request_id" uuid UNIQUE,
  "employee_id" uuid NOT NULL,
  "kind" smallint NOT NULL,
  "principal_amount" bigint NOT NULL,
  "issued_at" timestamptz NOT NULL,
  "issued_by_user_id" uuid NOT NULL,
  "cash_out_id" uuid,
  "installment_amount" bigint,
  "repayment_start_date" date,
  "status" smallint NOT NULL DEFAULT 1,
  "settled_at" timestamptz,
  "reason" text,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "employee_receivable_repayments" (
  "id" uuid PRIMARY KEY,
  "client_request_id" uuid UNIQUE,
  "employee_receivable_id" uuid NOT NULL,
  "amount" bigint NOT NULL,
  "payroll_line_id" uuid UNIQUE,
  "received_at" timestamptz,
  "received_by_user_id" uuid,
  "note" text,
  "created_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "branch_attendance_qr_tokens" (
  "id" uuid PRIMARY KEY,
  "branch_id" uuid NOT NULL,
  "token" varchar(64) UNIQUE NOT NULL,
  "created_by_user_id" uuid NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "revoked_at" timestamptz,
  "revoked_by_user_id" uuid
);

CREATE TABLE "attendance_records" (
  "id" uuid PRIMARY KEY,
  "employee_id" uuid NOT NULL,
  "branch_id" uuid NOT NULL,
  "business_date" date NOT NULL,
  "clock_in_at" timestamptz NOT NULL,
  "clock_out_at" timestamptz,
  "method" smallint NOT NULL,
  "qr_token_id" uuid,
  "clock_in_latitude" numeric(10,7),
  "clock_in_longitude" numeric(10,7),
  "clock_in_distance_meters" integer,
  "clock_in_device_label" varchar(255),
  "clock_out_source" smallint,
  "clock_out_latitude" numeric(10,7),
  "clock_out_longitude" numeric(10,7),
  "clock_out_distance_meters" integer,
  "manual_reason" smallint,
  "manual_note" text,
  "entered_by_user_id" uuid,
  "schedule_shift_id" uuid,
  "late_minutes" integer NOT NULL DEFAULT 0,
  "early_leave_minutes" integer NOT NULL DEFAULT 0,
  "corrected_at" timestamptz,
  "corrected_by_user_id" uuid,
  "correction_reason" text,
  "voided_at" timestamptz,
  "voided_by_user_id" uuid,
  "void_reason" text,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "attendance_exceptions" (
  "id" uuid PRIMARY KEY,
  "employee_id" uuid NOT NULL,
  "branch_id" uuid NOT NULL,
  "business_date" date NOT NULL,
  "exception_type" smallint NOT NULL,
  "schedule_shift_id" uuid,
  "attendance_record_id" uuid,
  "minutes" integer,
  "detected_at" timestamptz NOT NULL DEFAULT (now()),
  "status" smallint NOT NULL DEFAULT 1,
  "leave_id" uuid,
  "resolution_reason" text,
  "resolved_by_user_id" uuid,
  "resolved_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "product_categories" (
  "id" uuid PRIMARY KEY,
  "company_id" uuid NOT NULL,
  "name_mm" varchar(150) NOT NULL,
  "name_en" varchar(150),
  "sort_order" integer NOT NULL DEFAULT 0,
  "status" smallint NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now()),
  "archived_at" timestamptz
);

CREATE TABLE "products" (
  "id" uuid PRIMARY KEY,
  "company_id" uuid NOT NULL,
  "category_id" uuid NOT NULL,
  "name_mm" varchar(200) NOT NULL,
  "name_en" varchar(200),
  "sku" varchar(50),
  "is_sellable" boolean NOT NULL DEFAULT true,
  "sell_price_amount" bigint,
  "default_low_stock_threshold" integer,
  "status" smallint NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now()),
  "archived_at" timestamptz
);

CREATE TABLE "suppliers" (
  "id" uuid PRIMARY KEY,
  "company_id" uuid NOT NULL,
  "name" varchar(200) NOT NULL,
  "phone" varchar(50),
  "address" text,
  "notes" text,
  "status" smallint NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now()),
  "archived_at" timestamptz
);

CREATE TABLE "branch_stock_levels" (
  "id" uuid PRIMARY KEY,
  "branch_id" uuid NOT NULL,
  "product_id" uuid NOT NULL,
  "quantity_on_hand" integer NOT NULL DEFAULT 0,
  "low_stock_threshold" integer,
  "low_stock_notified_at" timestamptz,
  "updated_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "stock_movements" (
  "id" uuid PRIMARY KEY,
  "client_request_id" uuid,
  "branch_id" uuid NOT NULL,
  "product_id" uuid NOT NULL,
  "movement_type" smallint NOT NULL,
  "quantity_delta" integer NOT NULL,
  "purchase_item_id" uuid,
  "stock_transfer_item_id" uuid,
  "sale_item_id" uuid,
  "refund_item_id" uuid,
  "stock_count_item_id" uuid,
  "adjustment_reason_id" uuid,
  "note" text,
  "occurred_at" timestamptz NOT NULL,
  "business_date" date NOT NULL,
  "recorded_by_user_id" uuid NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "stock_adjustment_reasons" (
  "id" uuid PRIMARY KEY,
  "company_id" uuid NOT NULL,
  "name_mm" varchar(150) NOT NULL,
  "name_en" varchar(150),
  "sort_order" integer NOT NULL DEFAULT 0,
  "status" smallint NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "purchases" (
  "id" uuid PRIMARY KEY,
  "company_id" uuid NOT NULL,
  "supplier_id" uuid,
  "invoice_reference" varchar(100),
  "status" smallint NOT NULL DEFAULT 1,
  "total_amount" bigint NOT NULL DEFAULT 0,
  "purchased_at" timestamptz NOT NULL,
  "business_date" date NOT NULL,
  "posted_at" timestamptz,
  "posted_by_user_id" uuid,
  "cancelled_at" timestamptz,
  "notes" text,
  "created_by_user_id" uuid NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "purchase_items" (
  "id" uuid PRIMARY KEY,
  "purchase_id" uuid NOT NULL,
  "branch_id" uuid NOT NULL,
  "product_id" uuid NOT NULL,
  "quantity" integer NOT NULL,
  "unit_cost_amount" bigint NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "stock_transfers" (
  "id" uuid PRIMARY KEY,
  "from_branch_id" uuid NOT NULL,
  "to_branch_id" uuid NOT NULL,
  "status" smallint NOT NULL DEFAULT 1,
  "receiver_type" smallint NOT NULL,
  "receiver_employee_id" uuid,
  "notes" text,
  "created_by_user_id" uuid NOT NULL,
  "sent_at" timestamptz,
  "sent_by_user_id" uuid,
  "received_at" timestamptz,
  "received_by_user_id" uuid,
  "cancelled_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "stock_transfer_items" (
  "id" uuid PRIMARY KEY,
  "stock_transfer_id" uuid NOT NULL,
  "product_id" uuid NOT NULL,
  "quantity_sent" integer NOT NULL,
  "quantity_received" integer,
  "difference_reason" text,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "stock_counts" (
  "id" uuid PRIMARY KEY,
  "branch_id" uuid NOT NULL,
  "status" smallint NOT NULL DEFAULT 1,
  "started_at" timestamptz NOT NULL,
  "started_by_user_id" uuid NOT NULL,
  "posted_at" timestamptz,
  "posted_by_user_id" uuid,
  "cancelled_at" timestamptz,
  "notes" text,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "stock_count_items" (
  "id" uuid PRIMARY KEY,
  "stock_count_id" uuid NOT NULL,
  "product_id" uuid NOT NULL,
  "expected_quantity" integer NOT NULL,
  "counted_quantity" integer,
  "adjustment_reason_id" uuid,
  "note" text,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "expense_categories" (
  "id" uuid PRIMARY KEY,
  "company_id" uuid NOT NULL,
  "name_mm" varchar(150) NOT NULL,
  "name_en" varchar(150),
  "system_code" smallint,
  "sort_order" integer NOT NULL DEFAULT 0,
  "status" smallint NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now()),
  "archived_at" timestamptz
);

CREATE TABLE "income_categories" (
  "id" uuid PRIMARY KEY,
  "company_id" uuid NOT NULL,
  "name_mm" varchar(150) NOT NULL,
  "name_en" varchar(150),
  "sort_order" integer NOT NULL DEFAULT 0,
  "status" smallint NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now()),
  "archived_at" timestamptz
);

CREATE TABLE "expenses" (
  "id" uuid PRIMARY KEY,
  "client_request_id" uuid UNIQUE,
  "company_id" uuid NOT NULL,
  "branch_id" uuid,
  "category_id" uuid NOT NULL,
  "source" smallint NOT NULL,
  "amount" bigint NOT NULL,
  "expense_date" date NOT NULL,
  "description_mm" text,
  "paid_via" smallint,
  "status" smallint NOT NULL DEFAULT 1,
  "requested_by_user_id" uuid NOT NULL,
  "approved_by_user_id" uuid,
  "approved_at" timestamptz,
  "rejection_reason" text,
  "deleted_at" timestamptz,
  "deleted_by_user_id" uuid,
  "deletion_reason" text,
  "cash_out_id" uuid,
  "payroll_entry_branch_allocation_id" uuid,
  "purchase_id" uuid,
  "original_expense_id" uuid,
  "cash_return_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "manual_incomes" (
  "id" uuid PRIMARY KEY,
  "client_request_id" uuid UNIQUE,
  "company_id" uuid NOT NULL,
  "branch_id" uuid,
  "category_id" uuid NOT NULL,
  "amount" bigint NOT NULL,
  "income_date" date NOT NULL,
  "payment_method_id" uuid NOT NULL,
  "description_mm" text,
  "status" smallint NOT NULL DEFAULT 1,
  "requested_by_user_id" uuid NOT NULL,
  "approved_by_user_id" uuid,
  "approved_at" timestamptz,
  "rejection_reason" text,
  "deleted_at" timestamptz,
  "deleted_by_user_id" uuid,
  "deletion_reason" text,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "cash_out_reasons" (
  "id" uuid PRIMARY KEY,
  "company_id" uuid NOT NULL,
  "name_mm" varchar(150) NOT NULL,
  "name_en" varchar(150),
  "accounting_type" smallint NOT NULL,
  "expense_category_id" uuid,
  "receivable_kind" smallint,
  "sort_order" integer NOT NULL DEFAULT 0,
  "status" smallint NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now()),
  "archived_at" timestamptz
);

CREATE TABLE "cash_outs" (
  "id" uuid PRIMARY KEY,
  "client_request_id" uuid UNIQUE NOT NULL,
  "branch_id" uuid NOT NULL,
  "reason_id" uuid NOT NULL,
  "accounting_type" smallint NOT NULL,
  "amount" bigint NOT NULL,
  "note" text,
  "taken_by_user_id" uuid,
  "taken_by_name" varchar(200),
  "expected_return_date" date,
  "employee_id" uuid,
  "occurred_at" timestamptz NOT NULL,
  "business_date" date NOT NULL,
  "recorded_by_user_id" uuid NOT NULL,
  "converted_expense_at" timestamptz,
  "settled_at" timestamptz,
  "cancelled_at" timestamptz,
  "cancelled_by_user_id" uuid,
  "cancel_reason" text,
  "created_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "cash_returns" (
  "id" uuid PRIMARY KEY,
  "client_request_id" uuid UNIQUE NOT NULL,
  "cash_out_id" uuid NOT NULL,
  "branch_id" uuid NOT NULL,
  "amount" bigint NOT NULL,
  "returned_at" timestamptz NOT NULL,
  "business_date" date NOT NULL,
  "received_by_user_id" uuid NOT NULL,
  "note" text,
  "cancelled_at" timestamptz,
  "cancelled_by_user_id" uuid,
  "cancel_reason" text,
  "created_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "daily_closings" (
  "id" uuid PRIMARY KEY,
  "branch_id" uuid NOT NULL,
  "business_date" date NOT NULL,
  "status" smallint NOT NULL DEFAULT 1,
  "opening_cash_amount" bigint NOT NULL DEFAULT 0,
  "previous_closing_counted_amount" bigint,
  "opening_difference_reason" text,
  "cash_sales_amount" bigint NOT NULL DEFAULT 0,
  "cash_refunds_amount" bigint NOT NULL DEFAULT 0,
  "cash_outs_amount" bigint NOT NULL DEFAULT 0,
  "cash_returns_amount" bigint NOT NULL DEFAULT 0,
  "cash_manual_incomes_amount" bigint NOT NULL DEFAULT 0,
  "expected_cash_amount" bigint NOT NULL DEFAULT 0,
  "counted_cash_amount" bigint,
  "cash_difference_reason" text,
  "noncash_expected_amount" bigint NOT NULL DEFAULT 0,
  "noncash_verified_amount" bigint NOT NULL DEFAULT 0,
  "unverified_payment_count" integer NOT NULL DEFAULT 0,
  "unverified_reason" text,
  "notes" text,
  "closed_at" timestamptz,
  "closed_by_user_id" uuid,
  "reopen_count" smallint NOT NULL DEFAULT 0,
  "last_reopened_at" timestamptz,
  "last_reopened_by_user_id" uuid,
  "last_reopen_reason" text,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "settings" (
  "id" uuid PRIMARY KEY,
  "company_id" uuid NOT NULL,
  "branch_id" uuid,
  "key" varchar(100) NOT NULL,
  "value" jsonb NOT NULL,
  "updated_by_user_id" uuid NOT NULL,
  "updated_at" timestamptz NOT NULL DEFAULT (now()),
  "created_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "settings_history" (
  "id" uuid PRIMARY KEY,
  "setting_id" uuid NOT NULL,
  "old_value" jsonb,
  "new_value" jsonb NOT NULL,
  "changed_by_user_id" uuid NOT NULL,
  "changed_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "audit_events" (
  "id" uuid PRIMARY KEY,
  "occurred_at" timestamptz NOT NULL DEFAULT (now()),
  "actor_user_id" uuid,
  "actor_session_id" uuid,
  "source" smallint NOT NULL,
  "action" varchar(50) NOT NULL,
  "entity_type" varchar(60) NOT NULL,
  "entity_id" uuid,
  "branch_id" uuid,
  "before_data" jsonb,
  "after_data" jsonb,
  "reason" text,
  "request_id" uuid
);

CREATE TABLE "notification_types" (
  "id" uuid PRIMARY KEY,
  "company_id" uuid NOT NULL,
  "code" varchar(80) NOT NULL,
  "category" smallint NOT NULL,
  "is_mandatory" boolean NOT NULL DEFAULT false,
  "enabled" boolean NOT NULL DEFAULT true,
  "default_recipient_rule" smallint NOT NULL,
  "archived_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "notifications" (
  "id" uuid PRIMARY KEY,
  "user_id" uuid NOT NULL,
  "notification_type_id" uuid NOT NULL,
  "template_key" varchar(100) NOT NULL,
  "payload" jsonb NOT NULL DEFAULT ('{}'),
  "link_path" varchar(300),
  "entity_type" varchar(60),
  "entity_id" uuid,
  "branch_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "read_at" timestamptz,
  "deleted_at" timestamptz
);

CREATE TABLE "attachments" (
  "id" uuid PRIMARY KEY,
  "company_id" uuid NOT NULL,
  "entity_type" varchar(60) NOT NULL,
  "entity_id" uuid NOT NULL,
  "kind" smallint NOT NULL DEFAULT 1,
  "storage_key" varchar(500) UNIQUE NOT NULL,
  "file_name" varchar(255) NOT NULL,
  "mime_type" varchar(100) NOT NULL,
  "size_bytes" bigint NOT NULL,
  "uploaded_by_user_id" uuid NOT NULL,
  "uploaded_at" timestamptz NOT NULL DEFAULT (now()),
  "deleted_at" timestamptz,
  "deleted_by_user_id" uuid
);

CREATE TABLE "import_jobs" (
  "id" uuid PRIMARY KEY,
  "company_id" uuid NOT NULL,
  "source" smallint NOT NULL,
  "entity_type" varchar(60) NOT NULL,
  "file_attachment_id" uuid NOT NULL,
  "status" smallint NOT NULL DEFAULT 1,
  "total_rows" integer NOT NULL DEFAULT 0,
  "valid_rows" integer NOT NULL DEFAULT 0,
  "error_rows" integer NOT NULL DEFAULT 0,
  "imported_rows" integer NOT NULL DEFAULT 0,
  "options" jsonb,
  "error_message" text,
  "created_by_user_id" uuid NOT NULL,
  "validated_at" timestamptz,
  "confirmed_at" timestamptz,
  "confirmed_by_user_id" uuid,
  "cancelled_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "import_job_rows" (
  "id" uuid PRIMARY KEY,
  "import_job_id" uuid NOT NULL,
  "row_number" integer NOT NULL,
  "raw_data" jsonb NOT NULL,
  "status" smallint NOT NULL DEFAULT 1,
  "errors" jsonb,
  "entity_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "import_source_refs" (
  "id" uuid PRIMARY KEY,
  "source" smallint NOT NULL,
  "source_id" varchar(200) NOT NULL,
  "entity_type" varchar(60) NOT NULL,
  "entity_id" uuid NOT NULL,
  "import_job_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "backup_runs" (
  "id" uuid PRIMARY KEY,
  "kind" smallint NOT NULL,
  "status" smallint NOT NULL DEFAULT 1,
  "started_at" timestamptz NOT NULL DEFAULT (now()),
  "finished_at" timestamptz,
  "size_bytes" bigint,
  "location" varchar(500),
  "checksum" varchar(128),
  "error_message" text,
  "performed_by_user_id" uuid,
  "reason" text,
  "notified_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "branch_opening_hours" (
  "id" uuid PRIMARY KEY,
  "branch_id" uuid NOT NULL,
  "day_of_week" smallint NOT NULL,
  "is_closed" boolean NOT NULL DEFAULT false,
  "opens_at" time,
  "closes_at" time,
  "updated_by_user_id" uuid NOT NULL,
  "updated_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "branch_closures" (
  "id" uuid PRIMARY KEY,
  "branch_id" uuid NOT NULL,
  "start_date" date NOT NULL,
  "end_date" date NOT NULL,
  "notice_mm" varchar(300) NOT NULL,
  "notice_en" varchar(300),
  "created_by_user_id" uuid NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now()),
  "archived_at" timestamptz
);

CREATE UNIQUE INDEX ON "branches" ("company_id", "code");

CREATE UNIQUE INDEX ON "employees" ("company_id", "employee_code");

CREATE UNIQUE INDEX ON "employee_branches" ("employee_id", "branch_id", "effective_from");

CREATE UNIQUE INDEX ON "permissions" ("module", "action");

CREATE UNIQUE INDEX ON "role_permissions" ("role_id", "permission_id");

CREATE UNIQUE INDEX ON "employee_role_branches" ("employee_role_id", "branch_id");

CREATE INDEX ON "login_otps" ("user_id", "created_at");

CREATE UNIQUE INDEX ON "branch_services" ("branch_id", "service_id");

CREATE UNIQUE INDEX ON "service_variants" ("id", "service_id");

CREATE UNIQUE INDEX ON "service_variant_values" ("service_variant_id", "option_value_id");

CREATE UNIQUE INDEX ON "customers" ("company_id", "phone_normalized");

CREATE INDEX ON "customers" ("company_id", "name");

CREATE INDEX ON "bookings" ("branch_id", "business_date");

CREATE INDEX ON "bookings" ("booked_employee_id", "block_starts_at");

CREATE INDEX ON "bookings" ("customer_id", "starts_at");

CREATE UNIQUE INDEX ON "booking_items" ("booking_id", "sort_order");

CREATE INDEX ON "visits" ("branch_id", "business_date");

CREATE INDEX ON "visits" ("performed_by_employee_id", "started_at");

CREATE INDEX ON "sales" ("branch_id", "business_date");

CREATE INDEX ON "sales" ("customer_id", "finished_at");

CREATE UNIQUE INDEX ON "sales" ("branch_id", "receipt_year", "receipt_month", "receipt_seq");

CREATE UNIQUE INDEX ON "sale_items" ("sale_id", "sort_order");

CREATE INDEX ON "sale_items" ("performed_by_employee_id", "created_at");

CREATE UNIQUE INDEX ON "payment_methods" ("company_id", "code");

CREATE INDEX ON "payments" ("sale_id");

CREATE INDEX ON "payments" ("payment_method_id", "received_at");

CREATE UNIQUE INDEX ON "discount_codes" ("company_id", "code");

CREATE UNIQUE INDEX ON "discount_code_branches" ("discount_code_id", "branch_id");

CREATE UNIQUE INDEX ON "discount_code_customer_uses" ("discount_code_id", "customer_id");

CREATE INDEX ON "discount_requests" ("status", "requested_at");

CREATE INDEX ON "refunds" ("sale_id");

CREATE INDEX ON "refunds" ("branch_id", "business_date");

CREATE UNIQUE INDEX ON "refunds" ("branch_id", "receipt_year", "receipt_month", "receipt_seq");

CREATE UNIQUE INDEX ON "refund_items" ("refund_id", "sale_item_id");

CREATE INDEX ON "sale_adjustments" ("sale_id", "adjusted_at");

CREATE UNIQUE INDEX ON "commission_plan_tiers" ("commission_plan_id", "tier_order");

CREATE UNIQUE INDEX ON "commission_results" ("payroll_run_id", "employee_commission_plan_id");

CREATE INDEX ON "commission_results" ("employee_id", "payroll_run_id");

CREATE INDEX ON "commission_result_lines" ("commission_result_id");

CREATE INDEX ON "commission_result_lines" ("branch_id");

CREATE INDEX ON "payroll_runs" ("company_id", "period_start");

CREATE UNIQUE INDEX ON "payroll_entries" ("payroll_run_id", "employee_id");

CREATE INDEX ON "payroll_lines" ("payroll_entry_id", "sort_order");

CREATE INDEX ON "payroll_attendance_items" ("payroll_entry_id", "item_date");

CREATE UNIQUE INDEX ON "payroll_entry_branch_allocations" ("payroll_entry_id", "branch_id");

CREATE INDEX ON "employee_receivables" ("employee_id", "status");

CREATE INDEX ON "attendance_records" ("employee_id", "business_date");

CREATE INDEX ON "attendance_records" ("branch_id", "business_date");

CREATE INDEX ON "attendance_exceptions" ("employee_id", "business_date");

CREATE INDEX ON "attendance_exceptions" ("branch_id", "business_date", "status");

CREATE INDEX ON "attendance_exceptions" ("status", "detected_at");

CREATE UNIQUE INDEX ON "branch_stock_levels" ("branch_id", "product_id");

CREATE INDEX ON "stock_movements" ("branch_id", "product_id", "occurred_at");

CREATE INDEX ON "stock_movements" ("movement_type", "business_date");

CREATE INDEX ON "purchases" ("company_id", "business_date");

CREATE UNIQUE INDEX ON "purchase_items" ("purchase_id", "branch_id", "product_id");

CREATE INDEX ON "stock_transfers" ("from_branch_id", "status");

CREATE INDEX ON "stock_transfers" ("to_branch_id", "status");

CREATE UNIQUE INDEX ON "stock_transfer_items" ("stock_transfer_id", "product_id");

CREATE INDEX ON "stock_counts" ("branch_id", "started_at");

CREATE UNIQUE INDEX ON "stock_count_items" ("stock_count_id", "product_id");

CREATE INDEX ON "expenses" ("company_id", "expense_date");

CREATE INDEX ON "expenses" ("branch_id", "expense_date");

CREATE INDEX ON "expenses" ("category_id", "expense_date");

CREATE INDEX ON "manual_incomes" ("company_id", "income_date");

CREATE INDEX ON "cash_outs" ("branch_id", "business_date");

CREATE INDEX ON "cash_outs" ("accounting_type", "settled_at");

CREATE INDEX ON "cash_returns" ("cash_out_id");

CREATE INDEX ON "cash_returns" ("branch_id", "business_date");

CREATE UNIQUE INDEX ON "daily_closings" ("branch_id", "business_date");

CREATE INDEX ON "daily_closings" ("business_date", "status");

CREATE INDEX ON "settings" ("company_id", "key");

CREATE INDEX ON "settings_history" ("setting_id", "changed_at");

CREATE INDEX ON "audit_events" ("entity_type", "entity_id", "occurred_at");

CREATE INDEX ON "audit_events" ("actor_user_id", "occurred_at");

CREATE INDEX ON "audit_events" ("branch_id", "occurred_at");

CREATE INDEX ON "audit_events" ("occurred_at");

CREATE UNIQUE INDEX ON "notification_types" ("company_id", "code");

CREATE INDEX ON "notifications" ("user_id", "created_at");

CREATE INDEX ON "attachments" ("entity_type", "entity_id");

CREATE INDEX ON "import_jobs" ("company_id", "created_at");

CREATE UNIQUE INDEX ON "import_job_rows" ("import_job_id", "row_number");

CREATE INDEX ON "import_job_rows" ("import_job_id", "status");

CREATE UNIQUE INDEX ON "import_source_refs" ("source", "entity_type", "source_id");

CREATE INDEX ON "import_source_refs" ("entity_type", "entity_id");

CREATE INDEX ON "backup_runs" ("kind", "started_at");

CREATE UNIQUE INDEX ON "branch_opening_hours" ("branch_id", "day_of_week");

COMMENT ON TABLE "companies" IS 'D-ORG-01, D-ORG-02 · D-ORG-03: V1 = row ၁ ခု (Point)၊ နောက်မှ multi-company ဖွင့်လို့ရအောင် master table တွေမှာ company_id';

COMMENT ON COLUMN "companies"."id" IS 'UUIDv7 (D-DB-01)';

COMMENT ON COLUMN "companies"."name_mm" IS 'D-DB-04';

COMMENT ON COLUMN "companies"."name_en" IS 'D-DB-04 — NULL ဆို EN screen မှာ MM ပြ';

COMMENT ON COLUMN "companies"."address_mm" IS 'D-DB-04';

COMMENT ON COLUMN "companies"."address_en" IS 'D-DB-04';

COMMENT ON COLUMN "companies"."status" IS '0 INACTIVE · 1 ACTIVE (D-DB-03)';

COMMENT ON TABLE "branches" IS 'D-ORG-02, D-WEB-03 · ဖွင့်ချိန် = branch_opening_hours · ယာယီပိတ်ရက် = branch_closures (Part 8 — D-WEB-04, F-P1-11 ပြေ)';

COMMENT ON COLUMN "branches"."code" IS '/book?branch=<code> (D-BKG-01)';

COMMENT ON COLUMN "branches"."name_mm" IS 'D-DB-04';

COMMENT ON COLUMN "branches"."name_en" IS 'D-DB-04';

COMMENT ON COLUMN "branches"."address_mm" IS 'D-DB-04';

COMMENT ON COLUMN "branches"."address_en" IS 'D-DB-04';

COMMENT ON COLUMN "branches"."location_radius_meters" IS 'QR + GPS attendance (D-ATT-01)';

COMMENT ON COLUMN "branches"."is_public" IS 'Part 8 (v3.2) — website မှာ ပြ / မပြ (D-WEB-01, OPEN-21 toggle)';

COMMENT ON COLUMN "branches"."map_url" IS 'Part 8 (v3.2) — Google Maps link (website "လမ်းညွှန်") · NULL = lat / long ကနေ ထုတ်';

COMMENT ON COLUMN "branches"."status" IS '0 INACTIVE · 1 ACTIVE (D-DB-03)';

COMMENT ON TABLE "users" IS 'Login identity ပဲ (D-DB-01) · company_id မထား — company က employees ကနေ (D-ORG-03)
Invite → ပထမ login အောင်ရင် 2 INVITED → 1 ACTIVE (D-AUTH-03)
OTP / session table = Part 1b (part1b-login-v1.dbml) · invite = column (table မလို — D-AUTH-03)
';

COMMENT ON COLUMN "users"."email" IS 'Login email = admin ထည့်ထားတဲ့ email (D-AUTH-02)';

COMMENT ON COLUMN "users"."status" IS '0 DISABLED · 1 ACTIVE · 2 INVITED (D-DB-03)';

COMMENT ON COLUMN "users"."google_subject" IS 'Part 1b — Google account ID (sub)၊ ပထမ Google login မှာ email ကိုက်မှ မှတ် (D-AUTH-08)';

COMMENT ON COLUMN "users"."invited_at" IS 'Part 1b — D-AUTH-03';

COMMENT ON COLUMN "users"."invited_by_user_id" IS 'Part 1b — D-AUTH-03';

COMMENT ON COLUMN "users"."invite_last_sent_at" IS 'Part 1b — resend (D-AUTH-03)';

COMMENT ON COLUMN "users"."activated_at" IS 'Part 1b — ပထမ login အောင် → 2 INVITED → 1 ACTIVE';

COMMENT ON COLUMN "users"."failed_login_count" IS 'Part 1b — ဆက်တိုက်မှား အကြိမ်၊ မှန်ရင် 0 (D-AUTH-04)';

COMMENT ON COLUMN "users"."login_locked_until" IS 'Part 1b — ၅ ကြိမ်မှား → now + 20 min (D-AUTH-04)';
COMMENT ON COLUMN "users"."ui_language" IS 'v3.3 — UI ဘာသာ: 1 MY · 2 EN · NULL = system default (D-PLT-03, OPEN-33 ✅ 01/Oct) · CHECK = constraints.sql · notification / OTP email ကိုလည်း ဒီဘာသာ';

COMMENT ON TABLE "employees" IS 'Login ရ = users.status IN (1 ACTIVE, 2 INVITED) AND employees.status = 1 ACTIVE (D-DB-03)
အလုပ်ထွက် = status ပြောင်း၊ record မဖျက် (🔒 D-EMP-02, D-EMP-04)
';

COMMENT ON COLUMN "employees"."company_id" IS 'D-ORG-03';

COMMENT ON COLUMN "employees"."user_id" IS '🔒 D-EMP-02 — users 1 : 1 employees';

COMMENT ON COLUMN "employees"."employee_code" IS 'Format = setting (D-EMP-03)';

COMMENT ON COLUMN "employees"."name_mm" IS 'D-DB-04';

COMMENT ON COLUMN "employees"."name_en" IS 'D-DB-04';

COMMENT ON COLUMN "employees"."public_profile" IS 'Part 8 (v3.2) — website မှာ barber ပုံ / နာမည် ပြ (default OFF — OPEN-21 toggle; ဖုန်း / email လုံးဝ မပြ)';

COMMENT ON COLUMN "employees"."public_specialty_mm" IS 'Part 8 (v3.2) — website ပြ specialty (D-DB-04)';

COMMENT ON COLUMN "employees"."public_specialty_en" IS 'Part 8 (v3.2)';
COMMENT ON COLUMN "employees"."show_own_earnings" IS 'v3.3 / v3.4 — barber ကိုယ့် sale / commission estimate ကို dashboard + checkout မှာ မြင်ရ (OPEN-10 ✅ 01/Oct; D-DSH-03, D-COM-04) · NULL = company setting dashboard.show_own_earnings_all (settings.json, default false) အတိုင်း · true / false = ဒီ barber အတွက် override (admin Pay tab) · effective = COALESCE(column, setting)';
COMMENT ON COLUMN "employees"."public_rating" IS 'v3.4 — website barber card rating (OPEN-37 ✅ 01/Oct — admin / manager ပေး; 1.0–5.0, 0.5 ခြား — CHECK) · NULL = မပြ · website မှာ "Point rating" လို့ label (customer review မဟုတ်) · V2 = customer rating (table အသစ်) · D-UX-05';

COMMENT ON COLUMN "employees"."status" IS '0 INACTIVE · 1 ACTIVE · 2 RESIGNED · 3 TERMINATED (D-DB-03, D-EMP-04)';

COMMENT ON COLUMN "employees"."internal_notes" IS 'Free text — ရိုက်တဲ့ ဘာသာအတိုင်း (D-DB-04)';

COMMENT ON TABLE "employee_branches" IS '🔒 D-EMP-01 — branch အများကြီး + history
F-P1-04 (SQL): branch တစ်ခုကို ဖွင့်ထားတဲ့ assignment ၁ ခုပဲ — branch မတူရင် ရ
တစ်ရက်အတွင်း ဘယ်အချိန် ဘယ် branch = schedule (Part 2, D-SCH-01/02)
branch.company_id = employee.company_id (app စစ် — V1 company ၁ ခု)
';

COMMENT ON TABLE "roles" IS 'Role = position၊ admin ဖန်တီး (D-ROLE-01) · (company_id, name_mm) unique — archive မလုပ်ရသေးတာတွေအတွင်း (SQL)';

COMMENT ON COLUMN "roles"."company_id" IS 'D-ORG-03';

COMMENT ON COLUMN "roles"."name_mm" IS 'D-DB-04';

COMMENT ON COLUMN "roles"."name_en" IS 'D-DB-04';

COMMENT ON COLUMN "roles"."description_mm" IS 'D-DB-04';

COMMENT ON COLUMN "roles"."description_en" IS 'D-DB-04';

COMMENT ON COLUMN "roles"."status" IS '0 INACTIVE · 1 ACTIVE (D-DB-03)';

COMMENT ON TABLE "permissions" IS 'Module → action (D-ROLE-02) · company_id မထား (system တစ်ခုလုံး) · admin မဖန်တီး၊ permissions.json → DB sync (D-ROLE-08)';

COMMENT ON COLUMN "permissions"."code" IS 'ဥပမာ booking.cancel — permissions.json key (D-ROLE-08) · rename / ပြန်သုံး ✖';

COMMENT ON COLUMN "permissions"."description" IS 'Developer မှတ်ချက် — screen label က language file (key = code)';

COMMENT ON COLUMN "permissions"."archived_at" IS 'permissions.json ကဖြုတ်ရင် sync က archive (hard delete ✖)';

COMMENT ON TABLE "role_permissions" IS 'Admin က role မှာ ✔ ခြစ် (D-ROLE-02) · archive ဖြစ်ပြီးသား permission = စစ်ချိန်မှာ မတွက်';

COMMENT ON TABLE "employee_roles" IS '🔒 D-ROLE-04 — role အများကြီး၊ grant-only union
🔒 D-ROLE-05 — branch scope က assignment တစ်ခုချင်းမှာ (Ko Aung: Barber → A + B၊ Manager → B)
🔒 D-ROLE-06 — assignment တစ်ခု ဖြုတ် / ပြောင်းရင် အဲ့ assignment ပဲ (ကျန်တာ မထိ)
F-P1-03 (SQL): role တူ active assignment ၁ ခုပဲ
';

COMMENT ON COLUMN "employee_roles"."scope_type" IS '1 COMPANY (branch အကုန် + နောက်ဖွင့်မယ့် branch) · 2 BRANCHES (employee_role_branches ထဲကပဲ) — D-DB-03';

COMMENT ON COLUMN "employee_roles"."assigned_at" IS 'F-P1-03';

COMMENT ON COLUMN "employee_roles"."revoked_at" IS 'F-P1-03 — ဖြုတ်တဲ့ စက္ကန့်ကစ access ပိတ် (D-ROLE-06)';

COMMENT ON TABLE "employee_role_branches" IS 'F-P1-02 — R364 role_branch_scopes အစား · scope_type = 2 BRANCHES ဆို row ၁ ခု အနည်းဆုံး၊ 1 COMPANY ဆို row မရှိ (app စစ်)';

COMMENT ON TABLE "login_otps" IS '🔒 D-AUTH-04 — ၈ လုံး · ၅ မိနစ် · တစ်ခါသုံး · နောက်ဆုံးတောင်းတဲ့ OTP တစ်ခုပဲ သုံးလို့ရ
ပြန်တောင်းရင် ၆၀ စက္ကန့် စောင့် — နောက်ဆုံး row ရဲ့ created_at နဲ့ app စစ်
Email က users ထဲ မရှိ / DISABLED ဆို OTP မပို့ (row မဖန်တီး) — response ကတော့ အတူတူ (email ရှိ/မရှိ မသိအောင်)
';

COMMENT ON COLUMN "login_otps"."id" IS 'UUIDv7';

COMMENT ON COLUMN "login_otps"."code_hash" IS 'OTP ၈ လုံးကို hash (HMAC-SHA256 + server secret) — raw code မသိမ်း (D-AUTH-04)';

COMMENT ON COLUMN "login_otps"."expires_at" IS 'created_at + 5 မိနစ်';

COMMENT ON COLUMN "login_otps"."consumed_at" IS 'တစ်ခါသုံး — သုံးပြီးရင် set';

COMMENT ON TABLE "user_sessions" IS '🔒 D-AUTH-05 — စက်အများကြီး · My Devices ကဖြုတ် · admin က အကုန် logout
🔒 D-AUTH-06 — stay signed in (expiry / idle timeout မရှိ) · revoke ရင် ချက်ချင်း ထွက်
Request တိုင်း: session revoked_at IS NULL AND users.status = 1 AND employees.status = 1 (D-DB-03)
Login event (အောင် / မှား) = audit_events (Part 8)
';

COMMENT ON COLUMN "user_sessions"."id" IS 'UUIDv7';

COMMENT ON COLUMN "user_sessions"."token_hash" IS 'HttpOnly cookie ထဲက token ကို hash — raw token မသိမ်း (D-AUTH-06)';

COMMENT ON COLUMN "user_sessions"."login_method" IS '1 GOOGLE · 2 EMAIL_OTP (D-DB-03)';

COMMENT ON COLUMN "user_sessions"."device_label" IS 'My Devices မှာ ပြ — ဥပမာ "Android · Chrome" (user agent ကနေ)';

COMMENT ON COLUMN "user_sessions"."ip_address" IS 'Login ဝင်တုန်းက IP';

COMMENT ON COLUMN "user_sessions"."created_at" IS 'Login ဝင်ချိန် → in-app noti (D-AUTH-05, Part 8)';

COMMENT ON COLUMN "user_sessions"."last_seen_at" IS '၅ မိနစ်တစ်ခါလောက်ပဲ update (DB write သက်သာအောင်)';

COMMENT ON COLUMN "user_sessions"."revoked_by_user_id" IS 'ကိုယ်တိုင် / admin · system ဆို NULL';

COMMENT ON COLUMN "user_sessions"."revoke_reason" IS '1 LOGOUT · 2 DEVICE_REMOVED (My Devices) · 3 ADMIN_REVOKE_ALL · 4 ACCOUNT_INACTIVE (DISABLED / အလုပ်ထွက်) — D-DB-03';

COMMENT ON TABLE "service_categories" IS 'D-SVC-01 · (company_id, name_mm) unique — archive မလုပ်ရသေးတာတွေအတွင်း (SQL)';

COMMENT ON COLUMN "service_categories"."id" IS 'UUIDv7';

COMMENT ON COLUMN "service_categories"."company_id" IS 'D-ORG-03';

COMMENT ON COLUMN "service_categories"."name_mm" IS 'D-DB-04';

COMMENT ON COLUMN "service_categories"."name_en" IS 'D-DB-04';

COMMENT ON COLUMN "service_categories"."status" IS '0 INACTIVE · 1 ACTIVE';

COMMENT ON TABLE "services" IS 'Fresha ရဲ့ branch copy ၃ ခု → master ၁ ခု + branch_services (D-SVC-01..03) · (company_id, name_mm) unique (SQL)';

COMMENT ON COLUMN "services"."company_id" IS 'D-ORG-03 — company master service (D-SVC-01)';

COMMENT ON COLUMN "services"."name_mm" IS 'D-DB-04';

COMMENT ON COLUMN "services"."name_en" IS 'D-DB-04';

COMMENT ON COLUMN "services"."description_mm" IS 'D-DB-04';

COMMENT ON COLUMN "services"."description_en" IS 'D-DB-04';

COMMENT ON COLUMN "services"."pricing_mode" IS '1 SIMPLE (ဈေး တစ်ခု) · 2 OPTIONS (ဈေးဇယား — D-SVC-05)';

COMMENT ON COLUMN "services"."buffer_minutes" IS 'ရှင်းလင်းချိန် (D-SVC-07) — booking က ကြာချိန် + buffer ပိတ်';

COMMENT ON COLUMN "services"."show_on_website" IS 'Part 8 (v1.2) — website service list မှာ ပြ (OPEN-21 toggle) · /book မှာတော့ ACTIVE + branch ရောင်း = ပြ';

COMMENT ON COLUMN "services"."public_description_mm" IS 'Part 8 (v1.2) — website စာသား (description_mm = admin / internal)';

COMMENT ON COLUMN "services"."public_description_en" IS 'Part 8 (v1.2)';

COMMENT ON COLUMN "services"."image_attachment_id" IS 'Part 8 (v1.2) — website ပုံ → attachments (FK Part 8 SQL)';

COMMENT ON COLUMN "services"."status" IS '0 INACTIVE · 1 ACTIVE';

COMMENT ON TABLE "branch_services" IS 'D-SVC-02 — branch အလိုက် ရောင်း / မရောင်း + ကြာချိန် · ဈေးက service_prices';

COMMENT ON COLUMN "branch_services"."duration_minutes" IS 'ဒီ branch မှာ ပုံမှန် ကြာချိန် (D-SVC-02)';

COMMENT ON COLUMN "branch_services"."status" IS '0 INACTIVE (ဒီ branch မှာ မရောင်း) · 1 ACTIVE';

COMMENT ON TABLE "service_option_groups" IS '🔒 D-DB-06 — UI V1 = service တစ်ခုမှာ group ၂ ခုအထိ (ဇယား row × column) · DB က အကန့်အသတ်မရှိ';

COMMENT ON COLUMN "service_option_groups"."name_mm" IS 'ဥပမာ အရောင် / အရှည် (D-DB-04)';

COMMENT ON COLUMN "service_option_values"."name_mm" IS 'ဥပမာ Ash / ၇–၁၂ လက်မ (D-DB-04)';

COMMENT ON TABLE "service_variants" IS 'Combination တစ်ခု = ဇယား ကွက်တစ်ကွက် (ဥပမာ Ash + ၇–၁၂") · (service_id, variant_key) unique (SQL)';

COMMENT ON COLUMN "service_variants"."variant_key" IS 'option_value id တွေကို sort လုပ်ပြီး ဆက် — combination တူ ၂ ခါ မဝင်အောင် (app ထုတ်)';

COMMENT ON TABLE "service_variant_values" IS 'option_value က ဒီ service ရဲ့ group ထဲကဖြစ်ရ (app စစ်)';

COMMENT ON TABLE "service_prices" IS 'ဈေးရှာပုံ: ဝန်ဆောင်မှုပေးမယ့်ရက် (booking = ချိန်းရက်၊ walk-in = ဒီနေ့ — D-PLT-15) မှာ သက်ရောက်နေတဲ့ row
  → barber override → branch ဈေး; HOME row မရှိ → BRANCH ဈေး (D-SVC-06)
OPTIONS service မှာ ကွက်လပ် (row မရှိ) = အဲ့ branch မှာ အဲ့ combination မရောင်း (D-SVC-05)
(branch_id, service_id) → branch_services · (service_variant_id, service_id) → service_variants (composite FK — SQL)
Key တူ + ရက် ထပ် ✖ (EXCLUDE — SQL) · ဈေးအဟောင်း row မဖျက်ဘူး = ဈေး history (D-SVC-08)
Booking / sale က ရှာတွေ့တဲ့ဈေးကို snapshot (D-SVC-04)
';

COMMENT ON COLUMN "service_prices"."service_variant_id" IS 'NULL = SIMPLE service · ဖြည့် = ဇယား ကွက် (D-SVC-05) · (service_variant_id, service_id) composite FK = SQL';

COMMENT ON COLUMN "service_prices"."location_type" IS '1 BRANCH (ဆိုင်) · 2 HOME (အိမ်ဈေး — D-SVC-06)';

COMMENT ON COLUMN "service_prices"."employee_id" IS 'NULL = branch ဈေး · ဖြည့် = barber override (D-SVC-03) — V1 UI: SIMPLE + ဆိုင် ပဲ (D-SVC-05)';

COMMENT ON COLUMN "service_prices"."price_amount" IS 'MMK (D-DB-01)';

COMMENT ON COLUMN "service_prices"."duration_minutes" IS 'NULL → branch_services.duration_minutes (D-SVC-05)';

COMMENT ON COLUMN "service_prices"."effective_from" IS 'ဒီဈေး စသက်ရောက်တဲ့ MMT ရက် — ကြိုသတ်မှတ်လို့ရ (D-SVC-08)';

COMMENT ON COLUMN "service_prices"."effective_to" IS 'NULL = ဆက်သက်ရောက် · ဈေးအသစ် မစခင်ရက်';

COMMENT ON TABLE "employee_service_eligibilities" IS '🔒 D-EMP-05 — branch အလိုက် ✔ + effective date
(branch_id, service_id) → branch_services (composite FK — SQL)
employee + branch + service ဖွင့်ထားတဲ့ row ၁ ခုပဲ (partial unique — SQL)
';

COMMENT ON COLUMN "employee_service_eligibilities"."home_allowed" IS 'ဒီ service ကို အိမ်မှာ လုပ်ခွင့် (D-SVC-06, D-BKG-22)';

COMMENT ON COLUMN "employee_service_eligibilities"."archived_at" IS 'v1.3 — တစ်နေ့တည်း ပြန်ဖြုတ် (effective_from = ဒီနေ့ row ကို ပိတ်လို့ မရ) → archive; archived row = history ပဲ (API P2-RULE-04 #5)';

COMMENT ON TABLE "schedule_patterns" IS 'D-SCH-01 "repeat" — အပတ်စဉ် ပုံစံ · 🔒 D-DB-06: ညတိုင်း schedule_shifts ကို ကြိုထုတ် — booking window (D-BKG-06 setting, default 14 ရက်) + အပို · job ပုံစံ = REC-31';

COMMENT ON COLUMN "schedule_patterns"."day_of_week" IS '1 Mon … 7 Sun (ISO)';

COMMENT ON COLUMN "schedule_patterns"."start_time" IS 'MMT';

COMMENT ON COLUMN "schedule_patterns"."end_time" IS 'MMT';

COMMENT ON COLUMN "schedule_patterns"."archived_at" IS 'v1.3 — set ကို တစ်နေ့တည်း ပြန်ရေးရင် ဖျက်ရမယ့် segment ကို archive (schedule_shifts.schedule_pattern_id FK ဆက်ရှိ — hard delete ✖)';

COMMENT ON TABLE "schedule_shifts" IS '🔒 D-SCH-01 — တစ်ရက်မှာ branch / အပိုင်း အများကြီး
🔒 D-SCH-02 — ဝန်ထမ်း တစ်ယောက် အချိန်ထပ် ✖ (EXCLUDE — SQL; ထိစပ်ရုံ ရ) · branch ပြောင်းရင် ခရီးချိန် (setting, default 60) = app စစ်
Booking availability (D-BKG-04) = shift − booking − leave (pending ပါ — D-LV-04) − home service သွားချိန် (D-SCH-03)
employee က ဒီ branch မှာ ရှိရမယ် (employee_branches — app စစ်)
';

COMMENT ON COLUMN "schedule_shifts"."shift_date" IS 'MMT ရက် (D-PLT-15)';

COMMENT ON COLUMN "schedule_shifts"."source" IS '1 PATTERN (ပုံစံကထုတ်) · 2 MANUAL (တစ်ရက်ချင်း ထည့် / ပြင်)';

COMMENT ON TABLE "leave_types" IS '🔒 D-LV-01 — initial data = Fresha blocked-time ၁၀ မျိုး ("Late to work" မပါ) · (company_id, name_mm) unique (SQL)';

COMMENT ON COLUMN "leave_types"."company_id" IS 'D-ORG-03';

COMMENT ON COLUMN "leave_types"."name_mm" IS 'D-DB-04';

COMMENT ON COLUMN "leave_types"."is_paid" IS 'လစာရ / မရ (payroll — Part 5)';

COMMENT ON COLUMN "leave_types"."status" IS '0 INACTIVE · 1 ACTIVE';

COMMENT ON TABLE "leaves" IS '🔒 D-LV-02 — approval = permission · PENDING မှာ ပြင်ရ · overlap ✖ (EXCLUDE on half-day unit — SQL) · noti
🔒 D-LV-04 — PENDING + APPROVED = booking ပိတ်
🔒 D-LV-05 — နေ့ခွဲချိန် setting (default 13:00)
';

COMMENT ON COLUMN "leaves"."employee_id" IS 'Employee-level — branch အကုန် ပိတ် (D-LV-03)';

COMMENT ON COLUMN "leaves"."day_portion" IS '1 FULL · 2 MORNING · 3 AFTERNOON — နေ့တစ်ဝက်က ရက် ၁ ရက်ပဲ (D-LV-03, D-LV-05)';

COMMENT ON COLUMN "leaves"."status" IS '0 CANCELLED · 1 PENDING · 2 APPROVED · 3 REJECTED';

COMMENT ON COLUMN "leaves"."reason" IS 'Free text (D-DB-04)';

COMMENT ON COLUMN "leaves"."requested_by_user_id" IS 'ကိုယ်တိုင် ဒါမှမဟုတ် manager က ကိုယ်စား';

COMMENT ON TABLE "customers" IS 'Booking / walk-in မှာ ဖုန်းနဲ့ auto match / create (D-CUS-03) — archive ပြီးသား ဖုန်းဆို row အသစ် မဖန်တီး၊ ပြန်ဖွင့် (F-BK-21)
Account / login မရှိ (D-CUS-04) · customer ဆီ ဘာမှမပို့ — email field မထား (D-CUS-05)
Preferred barber / timeline / statistics = history ကနေ တွက် — column မထား (D-CUS-07, D-CUS-08)
F-BK-08: R365 ရဲ့ preferences ✖ (lock မရှိ)
';

COMMENT ON COLUMN "customers"."id" IS 'UUIDv7';

COMMENT ON COLUMN "customers"."company_id" IS 'D-ORG-03 — company-level customer (D-CUS-01)';

COMMENT ON COLUMN "customers"."name" IS 'ပြောတဲ့အတိုင်း တစ်ခု (D-DB-04)';

COMMENT ON COLUMN "customers"."phone" IS 'ရိုက်ထည့်တဲ့အတိုင်း (ပြဖို့)';

COMMENT ON COLUMN "customers"."phone_normalized" IS 'E.164 (+959…) — 🔒 D-CUS-02 identity · (company_id, phone_normalized) unique (archive ပြီးသားပါ — F-BK-21)';

COMMENT ON COLUMN "customers"."notes" IS 'Optional၊ staff အားလုံးမြင် (D-CUS-01) · free text (D-DB-04)';

COMMENT ON COLUMN "customers"."status" IS '0 INACTIVE · 1 ACTIVE (D-CUS-07, D-DB-03)';

COMMENT ON COLUMN "customers"."archived_at" IS 'Soft delete (D-CUS-07)';

COMMENT ON TABLE "booking_cancel_reasons" IS 'F-BK-17 — 🔒 D-BKG-14 preset + D-DB-04 ("cancel reason" = admin master list, MM + EN)
Seed: Customer ပြောင်းချင် · Barber မအား · Customer မလာ (system_code 1) · Other (requires_note)
(company_id, system_code) unique · (company_id, name_mm) unique — archive မလုပ်ရသေးတာတွေအတွင်း (SQL)
';

COMMENT ON COLUMN "booking_cancel_reasons"."company_id" IS 'D-ORG-03';

COMMENT ON COLUMN "booking_cancel_reasons"."name_mm" IS 'D-DB-04 (admin master list)';

COMMENT ON COLUMN "booking_cancel_reasons"."requires_note" IS '"Other" — စာ မဖြစ်မနေ (D-BKG-14) · app စစ်';

COMMENT ON COLUMN "booking_cancel_reasons"."system_code" IS 'NULL = admin ထည့်တာ · 1 NO_SHOW (D-BKG-17 auto-cancel က သုံး — ပိတ် / archive ✖)';

COMMENT ON COLUMN "booking_cancel_reasons"."status" IS '0 INACTIVE · 1 ACTIVE';

COMMENT ON TABLE "bookings" IS '🔒 D-BKG-08 — barber တစ်ယောက် ပိတ်ချိန် (block) ထပ် ✖ — branch မတူလည်း (EXCLUDE — SQL) · first success wins
🔒 D-BKG-09 (v5.1) — active (BOOKED / STARTED) ၁ ခု = ONLINE booking မှာပဲ app စစ် (customer row FOR UPDATE) · DB index မသုံး
🔒 D-BKG-12 (v5.1) — reschedule: အချိန်ပဲ ရွှေ့ = items ဈေး / ကြာချိန် / buffer မပြောင်း၊ block ပြန်တွက် ·
   service / option ပြောင်း = အဲ့ item ပဲ ဈေးအသစ် · barber / ဆိုင် ↔ အိမ် ပြောင်း = item အကုန် + ကားခ ဈေးအသစ်
🔒 D-BKG-16 — CANCELLED ကနေ ပြန်မဖွင့် · CANCELLED ⇔ cancel field တွေ (CHECK — SQL)
Availability (D-BKG-04) = shift − booking block − leave (pending ပါ — D-LV-04) − walk-in visit (Part 4) — app, code တစ်နေရာတည်း (§6.4b A-2)
Cancel / reschedule / no-show = code လမ်းကြောင်း တစ်ခုတည်း (§6.4b A-3) · noti + audit (D-BKG-15, Part 8)
Employee: ဒီ branch မှာ ရှိ (employee_branches) + eligible (D-EMP-05; HOME = home_allowed) — app စစ်
STARTED / COMPLETED = visit (Part 4) က ပြောင်း — visits.booking_id FK Part 4 မှာ
';

COMMENT ON COLUMN "bookings"."branch_id" IS 'Home service ဆိုလည်း barber ထွက်တဲ့ branch (D-SVC-06)';

COMMENT ON COLUMN "bookings"."customer_id" IS 'Auto match / create (D-CUS-03) · F-BK-06';

COMMENT ON COLUMN "bookings"."customer_name" IS 'ဒီ booking မှာ ရိုက်ထည့်တဲ့ နာမည် — ဥပမာ အမေဖုန်းနဲ့ သား (D-BKG-09 v5.1) · customers.name ကို auto မပြောင်း (F-BK-19)';

COMMENT ON COLUMN "bookings"."booked_employee_id" IS '🔒 D-BKG-05 customer ရွေး · D-BKG-08 · F-BK-01/05';

COMMENT ON COLUMN "bookings"."location_type" IS '1 BRANCH (ဆိုင်) · 2 HOME (အိမ်) — D-BKG-22';

COMMENT ON COLUMN "bookings"."home_address" IS 'HOME ဆို မဖြစ်မနေ (D-BKG-22) · free text';

COMMENT ON COLUMN "bookings"."home_address_note" IS 'HOME — မှတ်သားစရာ (optional, D-BKG-22)';

COMMENT ON COLUMN "bookings"."transport_fee_amount" IS 'HOME ဆို ကားခ snapshot (MMK — D-SVC-06; 0 = ဆိုင်ခံ) · BRANCH ဆို NULL · sale line = Part 4';

COMMENT ON COLUMN "bookings"."channel" IS '1 ONLINE (website) · 2 STAFF — F-BK-11 ✅ (D-BKG-09 v5.1)';

COMMENT ON COLUMN "bookings"."created_by_user_id" IS 'STAFF ဆို မဖြစ်မနေ · ONLINE ဆို NULL';

COMMENT ON COLUMN "bookings"."starts_at" IS 'Customer ချိန်းချိန် (HOME = အိမ်ရောက်ချိန်)';

COMMENT ON COLUMN "bookings"."ends_at" IS 'Service အကုန် ပြီးချိန် = starts_at + Σ items.duration_minutes';

COMMENT ON COLUMN "bookings"."block_starts_at" IS 'Barber ပိတ်ချိန် အစ = starts_at − သွားချိန် (HOME — D-SCH-03) · F-BK-16';

COMMENT ON COLUMN "bookings"."block_ends_at" IS 'Barber ပိတ်ချိန် အဆုံး = ends_at + buffer (D-SVC-07) + ပြန်ချိန် (HOME) · F-BK-16';

COMMENT ON COLUMN "bookings"."business_date" IS 'starts_at ရဲ့ MMT ရက် (D-PLT-15)';

COMMENT ON COLUMN "bookings"."status" IS '0 CANCELLED · 1 BOOKED · 2 STARTED · 3 COMPLETED (D-BKG-18)';

COMMENT ON COLUMN "bookings"."cancel_reason_id" IS 'D-BKG-14 · no-show auto = system_code 1 (D-BKG-17)';

COMMENT ON COLUMN "bookings"."cancel_note" IS 'Other ဆို မဖြစ်မနေ (app)';

COMMENT ON COLUMN "bookings"."cancelled_by_actor" IS '1 CUSTOMER (manage link) · 2 STAFF · 3 SYSTEM (no-show) — F-BK-09';

COMMENT ON COLUMN "bookings"."cancelled_by_user_id" IS 'STAFF ဆို မဖြစ်မနေ';

COMMENT ON COLUMN "bookings"."manage_token_hash" IS 'Raw token မသိမ်း (D-BKG-11) · staff ထည့်တဲ့ booking လည်း link ထုတ် — F-BK-10';

COMMENT ON TABLE "booking_items" IS 'Service အများကြီး + barber တစ်ယောက် + ဆက်တိုက် (D-BKG-03)
Service နာမည် snapshot မထား — services ကို မဖျက်ဘူး (D-DAT-05); receipt နာမည် snapshot = sale (Part 4) — F-BK-18
';

COMMENT ON COLUMN "booking_items"."sort_order" IS 'ဆက်တိုက် အစဉ် (D-BKG-03)';

COMMENT ON COLUMN "booking_items"."service_id" IS 'F-BK-15 ✅ (Part 2 🔒)';

COMMENT ON COLUMN "booking_items"."service_variant_id" IS 'OPTIONS service = မဖြစ်မနေ (OPEN-29 (က) — app စစ်) · SIMPLE = NULL · ဒီ service ရဲ့ variant ပဲ (composite FK — SQL)';

COMMENT ON COLUMN "booking_items"."unit_price_amount" IS 'ချိန်းရက်ရဲ့ ဈေး snapshot (D-SVC-04, D-SVC-08; barber / HOME ဈေး ပါ) — F-BK-02';

COMMENT ON COLUMN "booking_items"."duration_minutes" IS 'Snapshot (D-SVC-05 ကွက် ကြာချိန် ဒါမှမဟုတ် branch ပုံမှန်)';

COMMENT ON COLUMN "booking_items"."buffer_minutes" IS 'Snapshot (D-SVC-07) — item တိုင်း ကြာချိန် + buffer';

COMMENT ON TABLE "visits" IS '🔒 D-VIS-11 flow: START (barber + branch ပဲ — D-VIS-02 v5.1) → COMPLETE (service မဖြစ်မနေ) → payment → FINISH · visit ၁ ခု = barber ၁ ယောက် (V1 UI)
🔒 D-VIS-07 — payment မပြီး FINISH ✖ · 🔒 D-VIS-08 — FINISHED ⇒ visit + sale immutable (refund / adjustment ပဲ)
🔒 D-VIS-09 — INCOMPLETE = revenue / commission ✖ → sale status 0 CANCELLED · F-P4-13 booking → 3 COMPLETED
Customer = sales.customer_id (FINISH မှာ optional — D-VIS-02) / booking.customer_id
Late entry ⇒ started_at / completed_at / payments.received_at = user ရိုက်၊ created_at = သွင်းချိန် · F-P4-09 product-only sale late entry ⏭
Booking status: START → 2 STARTED · FINISH → 3 COMPLETED (Part 3 — app)
';

COMMENT ON COLUMN "visits"."id" IS 'UUIDv7';

COMMENT ON COLUMN "visits"."client_request_id" IS 'App က request တိုင်း ထုတ် — double submit ကာ (🔒 D-VIS-10) · F-P4-08';

COMMENT ON COLUMN "visits"."branch_id" IS 'Home service ဆိုလည်း barber ရဲ့ branch (D-SVC-06)';

COMMENT ON COLUMN "visits"."booking_id" IS 'Booking ကလာရင် (D-VIS-01) · booking ၁ ခု = visit ၁ ခု (partial unique — SQL) · NULL = walk-in';

COMMENT ON COLUMN "visits"."performed_by_employee_id" IS '🔒 D-VIS-03 Actual service barber · commission / KPI (D-COM-03, D-KPI-01)';

COMMENT ON COLUMN "visits"."performer_change_reason" IS 'booking.booked_employee_id ≠ performed_by ဆို မဖြစ်မနေ (🔒 D-VIS-04 — app စစ်)';

COMMENT ON COLUMN "visits"."proxy_reason" IS 'NULL = barber ကိုယ်တိုင် ကိုယ့်ဖုန်းနဲ့ မှတ် (D-VIS-11) · 1 PHONE_UNAVAILABLE (🔒 D-VIS-12 — B က payment / FINISH ပါ လုပ်ရ) · 2 OTHER (D-VIS-04 ကူမှတ်)';

COMMENT ON COLUMN "visits"."location_type" IS '1 BRANCH · 2 HOME (D-SVC-06)';

COMMENT ON COLUMN "visits"."home_address" IS 'HOME ဆို မဖြစ်မနေ (booking ကနေ ကူး / walk-in ဆို ရိုက်)';

COMMENT ON COLUMN "visits"."status" IS '0 INCOMPLETE (D-VIS-09) · 1 STARTED · 2 COMPLETED (service ပြီး၊ ငွေမရှင်းသေး) · 3 FINISHED (D-VIS-07)';

COMMENT ON COLUMN "visits"."started_at" IS 'တကယ် စချိန် — late entry ဆို user ရိုက် (performed_at — D-VIS-13)';

COMMENT ON COLUMN "visits"."started_by_user_id" IS 'START နှိပ်သူ = Recorded by (D-VIS-03 / 12)';

COMMENT ON COLUMN "visits"."completed_at" IS 'တကယ် ပြီးချိန်';

COMMENT ON COLUMN "visits"."completed_by_user_id" IS 'D-VIS-03 Completed by';

COMMENT ON COLUMN "visits"."finished_at" IS '= sales.finished_at (D-VIS-07)';

COMMENT ON COLUMN "visits"."incomplete_reason" IS 'D-VIS-09 — status 0 ဆို မဖြစ်မနေ';

COMMENT ON COLUMN "visits"."is_late_entry" IS '🔒 D-VIS-13 — စက္ကူ / မေ့သွား → နောက်မှ သွင်း · report flag';

COMMENT ON COLUMN "visits"."late_entry_reason" IS '1 INTERNET_OUTAGE · 2 POWER_OUTAGE · 3 PHONE_BROKEN · 4 FORGOT · 9 OTHER (D-VIS-13 preset) — is_late_entry ⇔ ဖြည့်';

COMMENT ON COLUMN "visits"."late_entry_note" IS 'OTHER ဆို မဖြစ်မနေ (CHECK)';

COMMENT ON COLUMN "visits"."business_date" IS 'started_at ရဲ့ MMT ရက် (D-PLT-15) · late entry = ဒီ branch-day closing မပိတ်ခင်ပဲ (Part 7 — app စစ်)';

COMMENT ON COLUMN "visits"."created_at" IS '= recorded_at (D-VIS-13: performed_at ≠ recorded_at)';

COMMENT ON TABLE "sales" IS 'START မှာ OPEN sale ဖန်တီး (visit နဲ့ အတူ) → COMPLETE မှာ service line → payment → FINISH = receipt နံပါတ် + immutable
FINISH ⇔ receipt / finished_at / finished_by / business_date (CHECK — SQL)
Discount: sale တစ်ခုလုံး · code XOR request · ကားခ line မလျှော့ (app) · line ခွဲ ဈေးအချိုး (app) — D-PAY-04 v5.1
Tax / service charge = amount snapshot (D-PAY-08) — တွက်အစဉ် 🟡 ဖွင့်မှ
Commission estimate (D-COM-04) = screen မှာ တွက်ပြ၊ DB မသိမ်း · final = Part 5
';

COMMENT ON COLUMN "sales"."client_request_id" IS 'D-VIS-10 · F-P4-08';

COMMENT ON COLUMN "sales"."visit_id" IS 'Service sale = visit ၁ ခု : sale ၁ ခု · NULL = product-only sale (🔒 D-PAY-03) · F-P4-01';

COMMENT ON COLUMN "sales"."customer_id" IS 'Optional (D-VIS-02 v5.1) — booking ကနေ / FINISH မှာ ဖုန်း · once_per_customer code သုံးရင် မဖြစ်မနေ (app)';

COMMENT ON COLUMN "sales"."status" IS '0 CANCELLED (visit INCOMPLETE) · 1 OPEN (ပြင်ရ) · 2 FINISHED (immutable — D-VIS-08)';

COMMENT ON COLUMN "sales"."subtotal_amount" IS 'Σ active line (unit × qty) — MMK · app / Part 8 trigger';

COMMENT ON COLUMN "sales"."discount_amount" IS 'Code / approval ကနေ — sale တစ်ခုလုံး (D-PAY-04) · line တွေဆီ ခွဲ = sale_items.line_discount_amount';

COMMENT ON COLUMN "sales"."discount_code_id" IS 'Standing code — sale ၁ ခု code ၁ ခု (D-PAY-04)';

COMMENT ON COLUMN "sales"."discount_request_id" IS 'App ထဲ တောင်း / ✔ (D-PAY-04 v5.1) — APPROVED ပဲ (app) · code နဲ့ တစ်ခုပဲ (CHECK)';

COMMENT ON COLUMN "sales"."service_charge_rate" IS 'Snapshot % (D-PAY-08 — Additional Settings, default OFF = 0)';

COMMENT ON COLUMN "sales"."tax_rate" IS 'Snapshot % (D-PAY-08)';

COMMENT ON COLUMN "sales"."total_amount" IS '= subtotal − discount + service charge + tax (CHECK) · Σ payments = total (app — F-P4-10)';

COMMENT ON COLUMN "sales"."receipt_number" IS '🔒 D-PAY-06 v5.1 `B3-2026-OCT-00125` — FINISH မှာ receipt_counters ကနေ (gapless) · F-P4-04';

COMMENT ON COLUMN "sales"."receipt_seq" IS '(branch, year, month) အတွင်း ဆက်တိုက် — unique (SQL)';

COMMENT ON COLUMN "sales"."business_date" IS 'finished_at ရဲ့ MMT ရက် = ဝင်ငွေရက် (D-PLT-15) · daily closing (Part 7) ဒီရက်နဲ့ · F-P4-12';

COMMENT ON COLUMN "sales"."finished_at" IS 'D-VIS-07 — payment ပြီးမှ';

COMMENT ON COLUMN "sales"."finished_by_user_id" IS 'FINISH နှိပ်သူ — performer / proxy (D-VIS-12) / override';

COMMENT ON COLUMN "sales"."cancelled_at" IS 'status 0 (visit INCOMPLETE)';

COMMENT ON TABLE "sale_items" IS 'Service line = "visit item" — visit_items table သီးသန့် မထား (ဈေး snapshot တစ်နေရာတည်း) · F-P4-01
line_total_amount = unit × qty − line_discount (generated — SQL)
Commissionable (D-COM-02) = SERVICE line ပဲ (PRODUCT / TRANSPORT_FEE ✖) — Part 5 က ဖတ်
HOME visit ⇒ TRANSPORT_FEE line ၁ ခု (list = branch setting / booking snapshot; 0 = ဆိုင်ခံ) — app
';

COMMENT ON COLUMN "sale_items"."line_type" IS '1 SERVICE · 2 PRODUCT (D-PAY-03 — Part 6) · 3 TRANSPORT_FEE (ကားခ — D-SVC-06, commission ✖)';

COMMENT ON COLUMN "sale_items"."service_id" IS 'SERVICE ⇒ မဖြစ်မနေ (CHECK)';

COMMENT ON COLUMN "sale_items"."service_variant_id" IS 'OPTIONS service ⇒ ကွက် (D-SVC-05) · ဒီ service ရဲ့ variant ပဲ (composite FK — SQL)';

COMMENT ON COLUMN "sale_items"."product_id" IS 'PRODUCT ⇒ မဖြစ်မနေ (CHECK) · → products (Part 6) — FK Part 6 မှာ ထည့် (§6.5 #9)';

COMMENT ON COLUMN "sale_items"."booking_item_id" IS 'Booking ကနေ ကြိုဖြည့်တဲ့ line (D-VIS-02 v5.1) · NULL = visit မှာ ထည့်';

COMMENT ON COLUMN "sale_items"."performed_by_employee_id" IS 'SERVICE ⇒ မဖြစ်မနေ — commission / KPI (D-COM-03) · V1 = visit.performed_by (app) · F-P4-02';

COMMENT ON COLUMN "sale_items"."description_mm" IS 'Receipt စာသား snapshot (service + ကွက် / product / ကားခ) — reprint တူအောင် (D-PAY-06) · F-P4-11';

COMMENT ON COLUMN "sale_items"."description_en" IS 'D-DB-04';

COMMENT ON COLUMN "sale_items"."quantity" IS 'SERVICE / TRANSPORT_FEE = 1';

COMMENT ON COLUMN "sale_items"."list_price_amount" IS 'ဈေး table / ကားခ setting ကနေ ရှာတဲ့ ဈေး — ဝန်ဆောင်မှုရက် (D-SVC-04 / 08, D-SVC-06)';

COMMENT ON COLUMN "sale_items"."unit_price_amount" IS 'တကယ် ယူတဲ့ ဈေး — ≠ list ဆို override reason + by (CHECK) · barber ✖ (D-SVC-04) · F-P4-03';

COMMENT ON COLUMN "sale_items"."price_override_by_user_id" IS 'Permission `sale.override_price` (D-SVC-04 / D-SVC-06 ကားခ လျှော့)';

COMMENT ON COLUMN "sale_items"."line_discount_amount" IS 'sales.discount_amount ကို ဈေးအချိုးနဲ့ ခွဲ (D-PAY-04 v5.1) — TRANSPORT_FEE = 0 (CHECK) · commission = net (D-COM-02)';

COMMENT ON COLUMN "sale_items"."added_reason" IS 'Booking visit မှာ booking ထဲ မပါတဲ့ service ထည့်ရင် (🔒 D-VIS-05 — app စစ်)';

COMMENT ON COLUMN "sale_items"."removed_at" IS 'Sale OPEN တုန်း ဖြုတ် — row မဖျက် (D-DAT-05) · totals ထဲ မပါ';

COMMENT ON COLUMN "sale_items"."removed_reason" IS 'D-VIS-05 — removed_at ⇔ (CHECK)';

COMMENT ON TABLE "payment_methods" IS 'Seed: CASH (kind 1, is_cash) · KBZPAY (kind 2, reference + verification) — D-PAY-01 · Tips ✖ (D-PAY-09)';

COMMENT ON COLUMN "payment_methods"."company_id" IS 'D-ORG-03';

COMMENT ON COLUMN "payment_methods"."code" IS 'CASH · KBZPAY (code ထဲ constant) — နောက်ထပ် ထည့်နိုင် (D-PAY-01)';

COMMENT ON COLUMN "payment_methods"."name_mm" IS 'D-DB-04';

COMMENT ON COLUMN "payment_methods"."kind" IS '1 CASH · 2 MOBILE_WALLET · 3 BANK_TRANSFER · 4 CARD (D-DB-03)';

COMMENT ON COLUMN "payment_methods"."is_cash" IS 'Drawer cash in (D-FIN-07) · closing expected cash';

COMMENT ON COLUMN "payment_methods"."requires_reference" IS 'KBZPay = true (🔒 D-PAY-02)';

COMMENT ON COLUMN "payment_methods"."requires_verification" IS 'KBZPay = true — closing မှာ တစ်ခုချင်း ✔ (D-PAY-02 v5.1)';

COMMENT ON COLUMN "payment_methods"."reference_regex" IS 'Reference ပုံစံ စစ် — Additional Settings (D-PLT-07, OPEN-24) · NULL = မစစ်';

COMMENT ON COLUMN "payment_methods"."status" IS '0 INACTIVE · 1 ACTIVE';

COMMENT ON TABLE "payments" IS 'Verify ≠ FINISH (C-1 — D-VIS-07): FINISH = payment *မှတ်ပြီး*; verify = closing (Part 7)
Closing list = requires_verification method · voided_at IS NULL · verified_at IS NULL · sale.business_date = ရက် (partial index — SQL)
';

COMMENT ON COLUMN "payments"."client_request_id" IS 'D-VIS-10 · F-P4-08';

COMMENT ON COLUMN "payments"."amount" IS '> 0 · Σ (voided မပါ) = sales.total_amount (app — F-P4-10 split payment ရ)';

COMMENT ON COLUMN "payments"."collected_by_employee_id" IS '🔒 D-VIS-06 ငွေလက်ခံသူ — default performer · proxy (D-VIS-12) = B · closing တာဝန်';

COMMENT ON COLUMN "payments"."received_at" IS 'တကယ် လက်ခံချိန် (late entry = user ရိုက်)';

COMMENT ON COLUMN "payments"."external_reference" IS 'KBZPay transaction ref (D-DB-01 naming) — method requires_reference ⇒ မဖြစ်မနေ (app) · method အလိုက် unique (partial — SQL) 🔒 D-PAY-02';

COMMENT ON COLUMN "payments"."verified_at" IS 'D-PAY-02 v5.1 — closing မှာ KBZPay app history နဲ့ တိုက်ပြီး ✔';

COMMENT ON COLUMN "payments"."voided_at" IS 'Sale OPEN တုန်း မှားရိုက်တာ ပြန်ဖြုတ် — row မဖျက် (D-DAT-05) · FINISHED ⇒ refund / adjustment ပဲ';

COMMENT ON TABLE "receipt_counters" IS 'F-P4-04 — FINISH / refund transaction ထဲမှာ row lock (UPDATE … SET last_seq = last_seq + 1 RETURNING) → gapless (🔒 D-PAY-06 v5.1)
Row မရှိသေးရင် INSERT … ON CONFLICT · transaction တို (FINISH click တစ်ခုတည်း)
';

COMMENT ON COLUMN "receipt_counters"."kind" IS '1 SALE · 2 REFUND (RF series — D-PAY-06)';

COMMENT ON COLUMN "receipt_counters"."receipt_month" IS '1–12 (MMT business date)';

COMMENT ON TABLE "discount_codes" IS 'Report: code / barber / ကြိမ် / ပမာဏ = sales (discount_code_id) ကနေ · ဘယ် code ကြိုဖန်တီး = go-live data · service ကန့်သတ် ⏭ · website /book မှာ code ⏭';

COMMENT ON COLUMN "discount_codes"."company_id" IS 'D-ORG-03';

COMMENT ON COLUMN "discount_codes"."code" IS 'ရိုက် / ပြောတဲ့ code — uppercase သိမ်း · (company_id, code) unique (archive ပါ — code ပြန်မသုံး)';

COMMENT ON COLUMN "discount_codes"."name_mm" IS 'Admin label — ဥပမာ ပုံမှန် customer (D-DB-04)';

COMMENT ON COLUMN "discount_codes"."discount_type" IS '1 PERCENT · 2 AMOUNT';

COMMENT ON COLUMN "discount_codes"."discount_percent" IS 'PERCENT ⇒ 1–100 (CHECK)';

COMMENT ON COLUMN "discount_codes"."discount_amount" IS 'AMOUNT ⇒ > 0 MMK (CHECK)';

COMMENT ON COLUMN "discount_codes"."is_public" IS 'true = social media promo — customer ပြောမှ၊ barber checkout list မှာ မပြ · false = internal (list ကနေ ရွေး)';

COMMENT ON COLUMN "discount_codes"."once_per_customer" IS 'true ⇒ customer ဖုန်း မဖြစ်မနေ (app) · discount_code_customer_uses unique';

COMMENT ON COLUMN "discount_codes"."max_uses" IS 'NULL = အကန့်အသတ်မဲ့ · N = စုစုပေါင်း (app — code row lock ပြီး count)';

COMMENT ON COLUMN "discount_codes"."scope_type" IS '1 ALL_BRANCHES · 2 BRANCHES (discount_code_branches)';

COMMENT ON COLUMN "discount_codes"."valid_from" IS 'MMT · NULL = ချက်ချင်း';

COMMENT ON COLUMN "discount_codes"."valid_to" IS 'NULL = သက်တမ်း မကုန်';

COMMENT ON COLUMN "discount_codes"."status" IS '0 INACTIVE · 1 ACTIVE';

COMMENT ON TABLE "discount_code_branches" IS 'scope_type = 2 ⇒ row ၁ ခု အနည်းဆုံး (app) — employee_role_branches ပုံစံ';

COMMENT ON TABLE "discount_code_customer_uses" IS 'once_per_customer = true code သုံးတဲ့ FINISH မှာပဲ INSERT (app) · unique က ၂ ကြိမ် တားတယ်';

COMMENT ON TABLE "discount_requests" IS 'F-P4-05 — in-app noti (D-NTF-01) → ✔ → sales.discount_request_id = ဒီ row၊ discount_amount တွက် (app) · ဖုန်း ✖
အဖြေမရ → barber က CANCELLED + ဈေးအပြည့် FINISH → admin နောက်မှ refund (D-PAY-05)
Report: barber အလိုက် တောင်းတဲ့ / ရတဲ့ အရေအတွက်
';

COMMENT ON COLUMN "discount_requests"."sale_id" IS 'OPEN sale · PENDING ၁ ခုပဲ (partial unique — SQL)';

COMMENT ON COLUMN "discount_requests"."requested_by_user_id" IS 'Barber — checkout မှာ "လျှော့ခွင့် တောင်း"';

COMMENT ON COLUMN "discount_requests"."discount_type" IS '1 PERCENT · 2 AMOUNT';

COMMENT ON COLUMN "discount_requests"."reason" IS 'မဖြစ်မနေ (D-PAY-04 v5.1)';

COMMENT ON COLUMN "discount_requests"."status" IS '0 CANCELLED (barber ပြန်ရုပ် / ဈေးအပြည့်နဲ့ FINISH) · 1 PENDING · 2 APPROVED · 3 REJECTED';

COMMENT ON COLUMN "discount_requests"."decided_by_user_id" IS 'Permission `discount.approve` (admin / manager — role အလိုက် ပိုင်ရှင် ရွေး)';

COMMENT ON COLUMN "refunds"."client_request_id" IS 'D-VIS-10';

COMMENT ON COLUMN "refunds"."sale_id" IS 'FINISHED sale ပဲ (app)';

COMMENT ON COLUMN "refunds"."kind" IS '1 SALE_REFUND (full / partial — refund_items ⇒ commission reversal, Part 5) · 2 OVERPAYMENT_RETURN (KBZPay ၂ ခါ လွှဲ — ဝင်ငွေ မလျော့၊ commission မထိ — D-PAY-05) · F-P4-06';

COMMENT ON COLUMN "refunds"."payment_method_id" IS 'ပြန်ပေးပုံ (cash / KBZPay)';

COMMENT ON COLUMN "refunds"."amount" IS '> 0 · kind 1 ⇒ = Σ refund_items (app)';

COMMENT ON COLUMN "refunds"."external_reference" IS 'KBZPay နဲ့ ပြန်လွှဲရင် ref';

COMMENT ON COLUMN "refunds"."reason" IS 'မဖြစ်မနေ (D-VIS-08)';

COMMENT ON COLUMN "refunds"."refund_receipt_number" IS '`B3-RF-2026-OCT-00003` — receipt_counters kind 2 (D-PAY-06 v5.1)';

COMMENT ON COLUMN "refunds"."business_date" IS 'refunded_at ရဲ့ MMT ရက် — closing (Part 7) · commission period (Part 5, 🟡 OPEN-26 finalize ပြီးမှ)';

COMMENT ON COLUMN "refunds"."refunded_by_user_id" IS 'Permission `sale.refund`';

COMMENT ON TABLE "refund_items" IS 'Partial refund → ဘယ် line / ဘယ် performer → commission reversal (D-PAY-05, Part 5)';

COMMENT ON COLUMN "refund_items"."amount" IS '> 0 · ≤ line_total_amount − ယခင် refund (app)';

COMMENT ON TABLE "sale_adjustments" IS 'ငွေပမာဏ ပြင်တာ ✖ — ပိုယူမိ = refund · လျော့ယူမိ = product-only sale ပုံစံ line အသစ် (app) · KBZPay ၂ ခါ = refunds kind 2
Audit before / after = audit_events (Part 8 — D-AUD-02)
';

COMMENT ON COLUMN "sale_adjustments"."sale_id" IS 'FINISHED sale — sale / payment row မပြင် (D-VIS-08) · report / closing / commission က adjustment ကို ပေါင်းဖတ် · F-P4-07';

COMMENT ON COLUMN "sale_adjustments"."adjustment_type" IS '1 PAYMENT_METHOD (payment X → method Y) · 2 PERFORMER (line → barber) · 3 COLLECTED_BY (payment → ငွေလက်ခံသူ) · 9 OTHER (note ပဲ)';

COMMENT ON COLUMN "sale_adjustments"."payment_id" IS 'type 1 / 3 ⇒ မဖြစ်မနေ (CHECK)';

COMMENT ON COLUMN "sale_adjustments"."sale_item_id" IS 'type 2 ⇒ မဖြစ်မနေ (CHECK)';

COMMENT ON COLUMN "sale_adjustments"."new_payment_method_id" IS 'type 1';

COMMENT ON COLUMN "sale_adjustments"."new_employee_id" IS 'type 2 / 3';

COMMENT ON COLUMN "sale_adjustments"."adjusted_by_user_id" IS 'Permission `sale.adjust` (admin override — D-VIS-06)';

COMMENT ON TABLE "commission_plans" IS 'Progressive tier plan (D-COM-01) · basis = commissionable sales (D-COM-02 — SERVICE line net of discount, FINISHED, ကားခ ✖) · period = payroll run period · (company_id, name_mm) unique (SQL)';

COMMENT ON COLUMN "commission_plans"."id" IS 'UUIDv7';

COMMENT ON COLUMN "commission_plans"."company_id" IS 'D-ORG-03';

COMMENT ON COLUMN "commission_plans"."name_mm" IS 'D-DB-04 — seed: "Point ပုံမှန်" (15% / 20%)';

COMMENT ON COLUMN "commission_plans"."status" IS '0 INACTIVE · 1 ACTIVE';

COMMENT ON TABLE "commission_plan_tiers" IS 'Tier ထပ် ✖ (EXCLUDE int8range — SQL) · ကွက်လပ် မရှိရ (app) · plan ကို employee assign ပြီးရင် tier ပြင်ရင် plan အသစ် (history — app)';

COMMENT ON COLUMN "commission_plan_tiers"."tier_order" IS '1, 2, 3 …';

COMMENT ON COLUMN "commission_plan_tiers"."from_amount" IS 'MMK ≥ 0 — ပထမ tier = 0';

COMMENT ON COLUMN "commission_plan_tiers"."to_amount" IS 'NULL = အဆုံးမရှိ (နောက်ဆုံး tier) · Point: 0 → 2,250,000 = 15% · 2,250,000 → ∞ = 20%';

COMMENT ON COLUMN "commission_plan_tiers"."rate_percent" IS '0–100';

COMMENT ON TABLE "employee_commission_plans" IS '🔒 D-COM-01 (v5.1) — employee ၁ ယောက် scope တူ plan ၁ ခု (EXCLUDE daterange — SQL; v1.2 = archived မပါ) · assignment မရှိ = commission ✖ (basic ပဲ)
Branch-all row နဲ့ branch row တစ်ချိန်တည်း ✖ (app)
v1.2 (OPEN-40 b) — မှား assignment = archive (archived_at / by / reason) ပြီးမှ ရှေ့ row ရဲ့ effective_to ပြန်ချိတ် / မှန်တဲ့ row အသစ် ထည့် (archived row = history — screen မှာ ပြန်ကြည့်ရ)
';

COMMENT ON COLUMN "employee_commission_plans"."branch_id" IS 'NULL = branch အကုန်ပေါင်း (default — C-2) · ဖြည့် = အဲ့ branch ရဲ့ sales ပဲ (P63 branch % မတူ case — branch တစ်ခုချင်း row) · F-P5-01';

COMMENT ON COLUMN "employee_commission_plans"."effective_from" IS '"Qualify" ဖြစ်တဲ့ရက် — admin assign (D-COM-01 v5.1)';

COMMENT ON COLUMN "employee_commission_plans"."effective_to" IS 'NULL = ဆက်သက်ရောက်';

COMMENT ON COLUMN "employee_commission_plans"."archived_at" IS 'v1.2 OPEN-40 (b) — မှားချိတ်မိ + မသုံးရသေး (FINALIZED / PUBLISHED / PAID run ရဲ့ commission_results မချိတ် — app) ⇒ ရုပ်သိမ်း = archive (row မဖျက် — D-DAT-05) · archived ⇒ commission တွက် / EXCLUDE ထဲ မပါ (P5.CPA.04)';

COMMENT ON COLUMN "employee_commission_plans"."archived_by_user_id" IS 'ရုပ်သိမ်းသူ (API P5.CPA.04 — permission `commission.assign`, private level)';

COMMENT ON COLUMN "employee_commission_plans"."archive_reason" IS 'archived_at ⇔ by ⇔ reason (CHECK — all-or-none, reason ဗလာ ✖)';

COMMENT ON TABLE "commission_results" IS 'Run Calculate မှာ ထုတ် · Finalize ⇒ immutable (D-PAYR-06) · Reopen ⇒ ဖျက်ပြီး ပြန်တွက် (run DRAFT ပြန်ဖြစ်မှ)';

COMMENT ON COLUMN "commission_results"."employee_commission_plan_id" IS 'ဘယ် assignment (plan + scope) နဲ့ တွက်လဲ';

COMMENT ON COLUMN "commission_results"."commissionable_amount" IS 'Period စုစုပေါင်း (D-COM-02) — Σ EARN lines';

COMMENT ON COLUMN "commission_results"."commission_amount" IS 'Tier နဲ့ တွက်ပြီး (final — D-COM-04)';

COMMENT ON COLUMN "commission_results"."effective_rate_percent" IS 'commission ÷ commissionable — line ခွဲ / reversal % (OPEN-26) · F-P5-02';

COMMENT ON COLUMN "commission_results"."tier_breakdown" IS 'Payslip ပြဖို့ — [{from, to, rate, base, amount}] snapshot';

COMMENT ON TABLE "commission_result_lines" IS 'Finalize မတိုင်ခင် refund = sale line ကို EARN ထဲ မထည့် / base လျှော့ (D-COM-02 fully paid) — REVERSAL မလို
Finalize ပြီး refund → refund လ run မှာ REVERSAL line (payslip: "28/Oct ဆိုးဆေး refund — 6,000")
ထွက်သွားလို့ run မရှိ → REVERSAL ကို admin ဆုံးဖြတ် (🟡 app screen — "ပြန်ယူစရာ")
';

COMMENT ON COLUMN "commission_result_lines"."kind" IS '1 EARN (sale line) · 2 REVERSAL (finalize ပြီးမှ refund — OPEN-26)';

COMMENT ON COLUMN "commission_result_lines"."sale_item_id" IS 'EARN ⇒ မဖြစ်မနေ · line ၁ ခု ၁ ကြိမ်ပဲ (partial unique)';

COMMENT ON COLUMN "commission_result_lines"."refund_item_id" IS 'REVERSAL ⇒ မဖြစ်မနေ · ၁ ကြိမ်ပဲ';

COMMENT ON COLUMN "commission_result_lines"."original_line_id" IS 'REVERSAL → မူလ EARN line (မူလ % ယူ)';

COMMENT ON COLUMN "commission_result_lines"."branch_id" IS 'sale.branch_id — branch P&L ခွဲ (D-PAYR-08 / C-2)';

COMMENT ON COLUMN "commission_result_lines"."base_amount" IS 'EARN = line_total (net of discount) > 0 · REVERSAL = − refund_item.amount';

COMMENT ON COLUMN "commission_result_lines"."rate_percent" IS 'EARN = result.effective_rate · REVERSAL = original_line.rate_percent (D-COM-04 v5.1)';

COMMENT ON COLUMN "commission_result_lines"."commission_amount" IS 'base × rate (rounded) — REVERSAL အနုတ်';

COMMENT ON TABLE "employee_salaries" IS '🔒 D-PAYR-02 — ၁ ယောက် ၁ ခု + effective date + history (EXCLUDE daterange — SQL; v1.2 = archived မပါ) · branch မခွဲ · မရှိ = basic 0 (commission ပဲ case)
v1.2 (OPEN-40 b) — မှား row = archive (archived_at / by / reason) ပြီးမှ ရှေ့ row ရဲ့ effective_to ပြန်ချိတ် / မှန်တဲ့ row အသစ် ထည့် (archived row = history — screen မှာ ပြန်ကြည့်ရ)
';

COMMENT ON COLUMN "employee_salaries"."basic_salary_amount" IS 'MMK / လ (D-PAYR-02) — period weekly ဆို app prorate';

COMMENT ON COLUMN "employee_salaries"."archived_at" IS 'v1.2 OPEN-40 (b) — မှားထည့်မိ + မသုံးရသေး (နောက်ဆုံး finalize ပြီး period နောက်မှ စတဲ့ row — app) ⇒ ရုပ်သိမ်း = archive (row မဖျက် — D-DAT-05) · archived ⇒ payroll တွက် / EXCLUDE ထဲ မပါ (P5.EPY.04)';

COMMENT ON COLUMN "employee_salaries"."archived_by_user_id" IS 'ရုပ်သိမ်းသူ (API P5.EPY.04 — permission `payroll.update`, private level)';

COMMENT ON COLUMN "employee_salaries"."archive_reason" IS 'archived_at ⇔ by ⇔ reason (CHECK — all-or-none, reason ဗလာ ✖)';

COMMENT ON TABLE "payroll_line_categories" IS 'Seed system ၈ ခု · (company_id, system_code) unique · (company_id, name_mm) unique (SQL) · F-P5-03';

COMMENT ON COLUMN "payroll_line_categories"."company_id" IS 'D-ORG-03';

COMMENT ON COLUMN "payroll_line_categories"."name_mm" IS 'D-DB-04';

COMMENT ON COLUMN "payroll_line_categories"."kind" IS '1 EARNING · 2 DEDUCTION';

COMMENT ON COLUMN "payroll_line_categories"."system_code" IS 'NULL = admin ဖန်တီး (D-PAYR-03) · system: 1 BASIC · 2 COMMISSION · 3 COMMISSION_REVERSAL · 4 LATE · 5 ABSENT · 6 UNPAID_LEAVE · 7 ADVANCE_REPAYMENT · 8 LOAN_REPAYMENT — archive ✖';

COMMENT ON COLUMN "payroll_line_categories"."status" IS '0 INACTIVE · 1 ACTIVE';

COMMENT ON TABLE "payroll_runs" IS 'Period ထပ် ✖ (EXCLUDE daterange — CANCELLED မပါ — SQL) · status ⇔ timestamp (CHECK)
FINALIZED+ ⇒ entries / lines / commission_results immutable — reopen (→ DRAFT) မှ ပြန်တွက်; PAID reopen ✖ (app)
Salary expense (Part 7 P&L) = Σ entries.gross_amount (D-FIN-04 Gross) · branch ခွဲ = payroll_entry_branch_allocations
';

COMMENT ON COLUMN "payroll_runs"."company_id" IS 'D-ORG-03 — payroll = company-level';

COMMENT ON COLUMN "payroll_runs"."period_type" IS '1 MONTHLY (default) · 2 WEEKLY · 3 BIWEEKLY · 4 CUSTOM (D-PAYR-01)';

COMMENT ON COLUMN "payroll_runs"."period_start" IS 'MMT';

COMMENT ON COLUMN "payroll_runs"."status" IS '0 CANCELLED · 1 DRAFT · 2 CALCULATED (review) · 3 FINALIZED (lock) · 4 PUBLISHED (payslip noti) · 5 PAID (D-PAYR-06)';

COMMENT ON COLUMN "payroll_runs"."rules_snapshot" IS 'Calculate ချိန်က deduction rule + allocation basis + period setting (D-PAYR-05 v5.1 snapshot) · F-P5-04';

COMMENT ON COLUMN "payroll_runs"."paid_at" IS 'D-PAYR-06 Paid (date / by)';

COMMENT ON COLUMN "payroll_runs"."last_reopen_reason" IS 'Reopen = reason + audit (D-PAYR-06)';

COMMENT ON TABLE "payroll_entries" IS 'Payslip ၁ ခု (D-PAYR-07 PDF / Excel = app render) · gross / deduction = Σ lines (app / Part 8 trigger)';

COMMENT ON COLUMN "payroll_entries"."basic_salary_amount" IS 'employee_salaries snapshot (prorate ပြီး)';

COMMENT ON COLUMN "payroll_entries"."gross_amount" IS 'Σ EARNING lines (basic + commission + other) — Salary expense = Gross (D-FIN-04)';

COMMENT ON COLUMN "payroll_entries"."deduction_amount" IS 'Σ DEDUCTION lines (late / absent / unpaid / advance / loan / other)';

COMMENT ON COLUMN "payroll_entries"."net_amount" IS '= gross − deduction (CHECK) · တကယ်ပေးရမယ့်ငွေ';

COMMENT ON COLUMN "payroll_entries"."late_count" IS 'Attendance summary snapshot (payslip ပြ) — detail = payroll_attendance_items';

COMMENT ON COLUMN "payroll_entries"."absent_days" IS 'နေ့တစ်ဝက် = 0.5';

COMMENT ON COLUMN "payroll_entries"."scheduled_days" IS 'Period ထဲ schedule ရက် (÷ schedule ရက် basis)';

COMMENT ON TABLE "payroll_lines" IS 'MANUAL line = admin ထည့် (category admin manage) · AUTO line ဖျက် ✖ — amount 0 + reason';

COMMENT ON COLUMN "payroll_lines"."kind" IS '1 EARNING · 2 DEDUCTION — = category.kind (app)';

COMMENT ON COLUMN "payroll_lines"."source" IS '1 AUTO (system တွက်) · 2 MANUAL (admin ထည့် — D-PAYR-03)';

COMMENT ON COLUMN "payroll_lines"."description_mm" IS 'Payslip စာသား — ဥပမာ "နောက်ကျ × 3"';

COMMENT ON COLUMN "payroll_lines"."amount" IS '≥ 0 (kind က အနုတ် / အပေါင်း ဆုံးဖြတ်)';

COMMENT ON COLUMN "payroll_lines"."auto_amount" IS 'AUTO ⇒ system တွက်တဲ့ မူလ · amount ≠ auto ⇒ override reason + by (CHECK — D-PAYR-05)';

COMMENT ON COLUMN "payroll_lines"."commission_result_id" IS 'COMMISSION / COMMISSION_REVERSAL line';

COMMENT ON COLUMN "payroll_lines"."employee_receivable_id" IS 'ADVANCE / LOAN repayment line → employee_receivable_repayments';

COMMENT ON TABLE "payroll_attendance_items" IS 'F-P5-05 — Calculate မှာ attendance_exceptions (OPEN / CONFIRMED) + leaves (unpaid, APPROVED) ကနေ ထုတ် (D-PAYR-05) · payslip မှာ ရက်အလိုက် ပြ
Σ deduction_amount (type အလိုက်) → payroll_lines AUTO (LATE / ABSENT / UNPAID_LEAVE) · item override = payroll ချိန် (exception EXCUSED = calculate မတိုင်ခင် manager ဆုံးဖြတ်)
';

COMMENT ON COLUMN "payroll_attendance_items"."item_date" IS 'MMT';

COMMENT ON COLUMN "payroll_attendance_items"."item_type" IS '1 LATE · 2 EARLY_LEAVE · 3 ABSENT · 4 UNPAID_LEAVE (D-LV-01 unpaid) · 5 LATE_TO_ABSENT (N ကြိမ် = ၁ ရက်)';

COMMENT ON COLUMN "payroll_attendance_items"."attendance_exception_id" IS 'LATE / EARLY_LEAVE / ABSENT ⇒ မဖြစ်မနေ (OPEN / CONFIRMED exception ပဲ — app) · entry ၁ ခုမှာ ၁ ကြိမ်ပဲ';

COMMENT ON COLUMN "payroll_attendance_items"."leave_id" IS 'UNPAID_LEAVE ⇒ မဖြစ်မနေ (APPROVED unpaid leave)';

COMMENT ON COLUMN "payroll_attendance_items"."minutes" IS 'LATE / EARLY_LEAVE (exception snapshot)';

COMMENT ON COLUMN "payroll_attendance_items"."day_portion" IS 'ABSENT / UNPAID_LEAVE / LATE_TO_ABSENT = 1 / 0.5';

COMMENT ON COLUMN "payroll_attendance_items"."auto_deduction_amount" IS 'Rule snapshot နဲ့ တွက်';

COMMENT ON COLUMN "payroll_attendance_items"."deduction_amount" IS 'Override ပြီး (≠ auto ⇒ reason + by — CHECK)';

COMMENT ON TABLE "payroll_entry_branch_allocations" IS '🔒 D-PAYR-08 (v5.1) — report / P&L ပဲ (ငွေပေး ၁ ခု) · Finalize snapshot · commission ကတော့ commission_result_lines.branch_id
v1.2 (OPEN-40 a — Part 7 v1.2): reopen ⇒ run ရဲ့ salary expense (Part 7 expenses source 3) ကို soft delete အရင် ပြီးမှ ဒီ row ဖျက် (🔒 F-P5-09 ပြန်တွက်) — expenses FK = ON DELETE SET NULL; expense soft delete မလုပ်ရသေးရင် DB က ဖျက်ခွင့် မပေး (expenses_source_refs_chk)
';

COMMENT ON COLUMN "payroll_entry_branch_allocations"."ratio" IS '0–1 · Σ = 1 (app)';

COMMENT ON COLUMN "payroll_entry_branch_allocations"."allocated_gross_amount" IS 'gross × ratio (rounded; နောက်ဆုံး row က ကျန်ငွေ)';

COMMENT ON COLUMN "payroll_entry_branch_allocations"."basis" IS '1 ATTENDANCE_HOURS (default — REC-19) · 2 SCHEDULED_HOURS · 3 MANUAL_PERCENT · 4 PRIMARY_BRANCH (attendance မရှိ)';

COMMENT ON TABLE "employee_receivables" IS 'Receivable (ဆိုင်က ပြန်ရမယ့်ငွေ) — expense ✖ (REC-15 🔒), salary expense မလျှော့ (D-FIN-04)
Balance = principal − Σ repayments − pending (FINALIZED / PUBLISHED run ရဲ့ ADVANCE / LOAN line — Mark paid မတိုင်ခင်; v1.1 G b) (view / app — P5-RULE-11) · SETTLED ⇔ balance 0 (app)
';

COMMENT ON COLUMN "employee_receivables"."client_request_id" IS 'v1.1 G (b) — P5.RCV.03 Idempotency-Key (ဗီရိုကနေ မဟုတ်တဲ့ advance / loan — ၂ ခါ မှတ်မိ ကာ, D-VIS-10) · NULL = ဗီရို advance (Part 7 cash_outs.client_request_id က ကာ) / migration';

COMMENT ON COLUMN "employee_receivables"."kind" IS '1 SALARY_ADVANCE · 2 STAFF_LOAN — balance သီးခြား (D-PAYR-04) · F-P5-06';

COMMENT ON COLUMN "employee_receivables"."principal_amount" IS '> 0 MMK';

COMMENT ON COLUMN "employee_receivables"."cash_out_id" IS 'ငွေထုတ်ပေးတဲ့ Cash Out (Part 7 — reason = employee balance, expense ✖ — D-FIN-07 / 08) · FK Part 7 မှာ';

COMMENT ON COLUMN "employee_receivables"."installment_amount" IS 'Payroll တစ်ကြိမ် ဖြတ်မယ့် ပမာဏ (NULL = နောက် payroll မှာ အကုန် — advance ပုံမှန်)';

COMMENT ON COLUMN "employee_receivables"."repayment_start_date" IS 'ဒီရက် နောက်ပိုင်း period ကစ ဖြတ်';

COMMENT ON COLUMN "employee_receivables"."status" IS '0 CANCELLED · 1 ACTIVE · 2 SETTLED';

COMMENT ON TABLE "employee_receivable_repayments" IS 'Payroll line ✖ cash ✖ ၂ ခုလုံး / တစ်ခုမှ မရှိ ✖ (CHECK) · payroll repayment = Mark paid မှာ INSERT (G b, D-PAYR-04) · cash ပြန်ဆပ် = owner / admin လက်ထဲ, ဗီရို ✖ — Part 7 closing expected cash မပါ (owner C3)';

COMMENT ON COLUMN "employee_receivable_repayments"."client_request_id" IS 'v1.1 G (b) — P5.RCV.05 cash repayment ရဲ့ Idempotency-Key (၂ ခါ မှတ်မိ ကာ) · payroll repayment = NULL (payroll_line_id unique က ကာ)';

COMMENT ON COLUMN "employee_receivable_repayments"."amount" IS '> 0';

COMMENT ON COLUMN "employee_receivable_repayments"."payroll_line_id" IS 'Payroll deduction နဲ့ ဖြတ် (ပုံမှန်) — run **Mark paid** မှာ ထည့် (v1.1 — G b, D-PAYR-04 · FINALIZE ✖ — reopen မှာ ငွေ row မဖျက်)';

COMMENT ON COLUMN "employee_receivable_repayments"."received_at" IS 'Cash နဲ့ ပြန်ဆပ် (payroll မဟုတ်) ⇒ received_at + received_by (CHECK — တစ်မျိုးပဲ) · owner / admin လက်ထဲ — ဗီရို ✖ (owner C3)';

COMMENT ON COLUMN "employee_receivable_repayments"."received_by_user_id" IS 'ငွေလက်ခံတဲ့ owner / admin (P5.RCV.05 caller — owner C3)';

COMMENT ON TABLE "branch_attendance_qr_tokens" IS 'F-P5-07 — branch ၁ ခု active token ၁ ခု (partial unique — SQL) · D-ATT-01 static QR · GPS radius = branches.location_radius_meters (Part 1)';

COMMENT ON COLUMN "branch_attendance_qr_tokens"."token" IS 'QR ထဲ — random (branch id သက်သက် ✖) · print ပြန်ထုတ်ရင် အသစ် + အဟောင်း revoke';

COMMENT ON TABLE "attendance_records" IS '🔒 D-ATT-01 (v5.1) — GPS / QR ကို setting နဲ့ ပိတ်ရ (method မပြောင်း) · F-P5-08
🔒 D-ATT-06 — colleague က သူများအတွက် clock-in ✖ (QR_GPS record ရဲ့ session user = employee.user — app) · MANUAL screen မှာ အဲ့နေ့ visit သက်သေပြ · လစဉ် manual count (employee အလိုက်) report
Late / early leave / absent / incomplete → attendance_exceptions (detect ပြီး row သိမ်း — D-ATT-03) · Incomplete = clock_out NULL နေ့ကုန် (auto / manual ပိတ် — D-ATT-04)
Record ထပ် ✖ — employee တစ်ယောက် အချိန်ထပ် (EXCLUDE tstzrange — SQL)
v1.1 (G a) — void = voided_at / by / reason · one_open + no_overlap = voided မပါ (SQL) · LATE / EARLY / INCOMPLETE exception → VOID, ABSENT ပြန်စစ် (app — P5-RULE-15)
';

COMMENT ON COLUMN "attendance_records"."branch_id" IS 'QR ရဲ့ branch · တစ်ရက် branch အများကြီး = record အများကြီး (D-ATT-02)';

COMMENT ON COLUMN "attendance_records"."business_date" IS 'clock_in_at ရဲ့ MMT ရက် (D-PLT-15)';

COMMENT ON COLUMN "attendance_records"."clock_out_at" IS 'NULL = ဆိုင်ထဲ ရှိနေ (active) · employee ၁ ယောက် active ၁ ခု (partial unique — voided မပါ, v1.1)';

COMMENT ON COLUMN "attendance_records"."method" IS '1 QR_GPS (ကိုယ့်ဖုန်း) · 2 MANUAL (Manager / Admin — D-ATT-06)';

COMMENT ON COLUMN "attendance_records"."qr_token_id" IS 'QR_GPS ⇒ scan လုပ်တဲ့ token';

COMMENT ON COLUMN "attendance_records"."clock_in_latitude" IS 'QR_GPS ⇒ မဖြစ်မနေ (CHECK)';

COMMENT ON COLUMN "attendance_records"."clock_in_distance_meters" IS 'ဆိုင်နဲ့ အကွာအဝေး — radius ကျော်ရင် app ပယ် (D-ATT-01)';

COMMENT ON COLUMN "attendance_records"."clock_in_device_label" IS 'user_sessions.device_label (D-AUTH-05)';

COMMENT ON COLUMN "attendance_records"."clock_out_source" IS '1 SELF (QR_GPS) · 2 MANUAL (Manager / Admin — D-ATT-04) · 3 AUTO_SHIFT_END (setting — D-ATT-04) · NULL = မထွက်သေး';

COMMENT ON COLUMN "attendance_records"."manual_reason" IS 'MANUAL ⇒ 1 PHONE_UNAVAILABLE · 9 OTHER (D-ATT-06 preset) — CHECK';

COMMENT ON COLUMN "attendance_records"."manual_note" IS 'OTHER ⇒ မဖြစ်မနေ';

COMMENT ON COLUMN "attendance_records"."entered_by_user_id" IS 'MANUAL ⇒ Manager / Admin (permission `attendance.manual`)';

COMMENT ON COLUMN "attendance_records"."schedule_shift_id" IS 'ကိုက်တဲ့ shift (app match) — late / early leave တွက်ဖို့';

COMMENT ON COLUMN "attendance_records"."late_minutes" IS 'clock_in − shift.starts_at (grace မနုတ်ခင် raw) · payroll က rule နဲ့ တွက်';

COMMENT ON COLUMN "attendance_records"."corrected_at" IS 'D-ATT-05 — Manager / Admin ပြင် (before / after = audit_events)';

COMMENT ON COLUMN "attendance_records"."voided_at" IS 'v1.1 G (a) — လူ / branch မှား / ထပ်ထည့်မိ ⇒ void (row မဖျက် — D-DAT-05) · voided ⇒ hours / allocation / one-open / overlap ထဲ မပါ (P5-RULE-15)';

COMMENT ON COLUMN "attendance_records"."voided_by_user_id" IS 'Manager / Admin (permission `attendance.update`) — ကိုယ့် record ✖ (owner C11 — app)';

COMMENT ON COLUMN "attendance_records"."void_reason" IS 'voided_at ⇔ by ⇔ reason (CHECK — all-or-none, reason ဗလာ ✖)';

COMMENT ON COLUMN "attendance_records"."created_at" IS '= recorded_at';

COMMENT ON TABLE "attendance_exceptions" IS 'F-P5-05 (v1 ပြင်) — "ဒီနေ့ ဘယ်သူ ပျက်လဲ / ဘာကြောင့်လဲ" admin screen + manager က အဲ့နေ့မှာပဲ ဆုံးဖြတ် (ဖုန်းဆက် → EXCUSED / LEAVE / CONFIRMED)
Detect ပြီး row သိမ်း — schedule နောက်မှ ပြင်လည်း မှတ်တမ်း မပျောက် (VOID နဲ့ပဲ ပိတ်) · D-ATT-03 "auto + admin manual ပြင်" · D-ATT-05 audit
Payroll calculate = OPEN + CONFIRMED ⇒ ဖြတ် · EXCUSED / LEAVE / VOID ⇒ မဖြတ် (unpaid leave = leaves ကနေ) · OPEN ကျန်နေရင် calculate မှာ သတိပေး (app)
Employee အလိုက် လစဉ် အရေအတွက် (type / status) report
';

COMMENT ON COLUMN "attendance_exceptions"."branch_id" IS 'Shift ရဲ့ branch (ABSENT) / record ရဲ့ branch';

COMMENT ON COLUMN "attendance_exceptions"."business_date" IS 'MMT';

COMMENT ON COLUMN "attendance_exceptions"."exception_type" IS '1 LATE · 2 EARLY_LEAVE · 3 ABSENT (shift ရှိ၊ record / leave မရှိ) · 4 INCOMPLETE (clock-out မလုပ် — D-ATT-04) — 🔒 D-ATT-03 auto';

COMMENT ON COLUMN "attendance_exceptions"."schedule_shift_id" IS 'LATE / EARLY_LEAVE / ABSENT ⇒ မဖြစ်မနေ · shift ၁ ခု type ၁ ခု ၁ ကြိမ် (partial unique)';

COMMENT ON COLUMN "attendance_exceptions"."attendance_record_id" IS 'LATE / EARLY_LEAVE / INCOMPLETE ⇒ မဖြစ်မနေ · ABSENT = NULL';

COMMENT ON COLUMN "attendance_exceptions"."minutes" IS 'LATE / EARLY_LEAVE ⇒ > 0 (grace မနုတ်ခင် raw — rule = payroll)';

COMMENT ON COLUMN "attendance_exceptions"."detected_at" IS 'LATE = clock-in ချိန် · EARLY_LEAVE = clock-out · ABSENT / INCOMPLETE = ညနေ job (REC-31 ပုံစံ)';

COMMENT ON COLUMN "attendance_exceptions"."status" IS '0 VOID (detect မှား — schedule ပြင်) · 1 OPEN · 2 EXCUSED (ခွင့်လွှတ် — မဖြတ်) · 3 CONFIRMED (ဖြတ်) · 4 LEAVE (ခွင့်အဖြစ် ပြောင်း)';

COMMENT ON COLUMN "attendance_exceptions"."leave_id" IS 'LEAVE ⇒ မဖြစ်မနေ (leave record — reason / approval အဲ့မှာ)';

COMMENT ON COLUMN "attendance_exceptions"."resolution_reason" IS 'VOID / EXCUSED ⇒ မဖြစ်မနေ · CONFIRMED optional';

COMMENT ON COLUMN "attendance_exceptions"."resolved_by_user_id" IS 'Manager / Admin (permission `attendance.resolve`) — status ≠ OPEN ⇒ မဖြစ်မနေ';

COMMENT ON TABLE "product_categories" IS 'F-P6-01 — service_categories ပုံစံတူ (Fresha product category) · (company_id, name_mm) unique (SQL)';

COMMENT ON COLUMN "product_categories"."id" IS 'UUIDv7';

COMMENT ON COLUMN "product_categories"."company_id" IS 'D-ORG-03';

COMMENT ON COLUMN "product_categories"."name_mm" IS 'D-DB-04';

COMMENT ON COLUMN "product_categories"."status" IS '0 INACTIVE · 1 ACTIVE';

COMMENT ON TABLE "products" IS '🔒 D-STK-01 — unit = pcs (column မလို) · (company_id, name_mm) unique (SQL) · archive ပဲ (D-DAT-05)
Sale: sale_items.product_id (Part 4) → FINISH မှာ stock_movements SALE_OUT · refund kind 1 product line → SALE_RETURN_IN
ကုန်ကျစရိတ် = purchase_items.unit_cost_amount (product မှာ standard cost မထား) · P&L = purchase = Part 7 expense (F-P6-03)
';

COMMENT ON COLUMN "products"."company_id" IS 'D-ORG-03 — company master (branch stock = branch_stock_levels)';

COMMENT ON COLUMN "products"."name_mm" IS 'D-DB-04';

COMMENT ON COLUMN "products"."sku" IS 'Barcode / code (optional) — company အတွင်း unique (SQL) · F-P6-02';

COMMENT ON COLUMN "products"."is_sellable" IS 'true = customer ကို ရောင်း (D-PAY-03) · false = ဆိုင်သုံးပဲ (ဆိုးဆေး / shampoo — D-STK-04 usage)';

COMMENT ON COLUMN "products"."sell_price_amount" IS 'MMK — sellable ⇒ မဖြစ်မနေ (CHECK) · company-level (branch override ⏭) · sale line = snapshot (list_price)';

COMMENT ON COLUMN "products"."default_low_stock_threshold" IS 'D-STK-06 — branch_stock_levels.low_stock_threshold NULL ဆို ဒါ';

COMMENT ON COLUMN "products"."status" IS '0 INACTIVE · 1 ACTIVE';

COMMENT ON TABLE "suppliers" IS 'D-STK-02 — supplier optional · (company_id, name) unique (SQL)';

COMMENT ON COLUMN "suppliers"."company_id" IS 'D-ORG-03';

COMMENT ON COLUMN "suppliers"."name" IS 'ပြောတဲ့အတိုင်း ၁ ခု (D-DB-04)';

COMMENT ON COLUMN "suppliers"."status" IS '0 INACTIVE · 1 ACTIVE';

COMMENT ON TABLE "branch_stock_levels" IS '🔒 D-STK-01 branch အလိုက် stock · row = product ကို ဒီ branch မှာ သုံး / ရောင်း';

COMMENT ON COLUMN "branch_stock_levels"."quantity_on_hand" IS 'pcs — Σ stock_movements (cache; app same transaction · ညတိုင်း recompute check — F-P6-04) · အနုတ် ဖြစ်နိုင် (ရိုက်ကျန်) — report flag';

COMMENT ON COLUMN "branch_stock_levels"."low_stock_threshold" IS 'D-STK-06 — NULL → products.default_low_stock_threshold · ≤ ⇒ admin noti (Part 8)';

COMMENT ON COLUMN "branch_stock_levels"."low_stock_notified_at" IS 'Noti ထပ်မပို့အောင် — threshold အထက် ပြန်ရောက်ရင် NULL';

COMMENT ON TABLE "stock_movements" IS '🔒 D-STK-06 movement history — **append-only ledger** (UPDATE / DELETE ✖ — ပြင်ရင် movement အသစ်) · F-P6-05
🔒 D-STK-04 usage = တစ်ဘူးလုံး ကုန်မှ USAGE_OUT (qty −1 ပုံမှန်) — barber / staff ကိုယ့်ဖုန်းကနေ
Type ⇔ ref တစ်ခုပဲ (CHECK) · ref ၁ ခု movement ၁ ခု (partial unique — transfer item = OUT + IN ၂ ခု)
v1.2 (G c) — ref မရှိတဲ့ USAGE_OUT / MANUAL_ADJUST = client_request_id နဲ့ ၂ ခါ ကာ (partial unique — SQL)
';

COMMENT ON COLUMN "stock_movements"."client_request_id" IS 'v1.2 G (c) — usage (P6.STK.05) / manual adjust (P6.STK.07) ရဲ့ Idempotency-Key (double tap — D-VIS-10) · တခြား movement (FINISH / post / receive / count) = NULL · partial unique (SQL)';

COMMENT ON COLUMN "stock_movements"."movement_type" IS '1 PURCHASE_IN · 2 TRANSFER_OUT · 3 TRANSFER_IN · 4 SALE_OUT · 5 SALE_RETURN_IN · 6 USAGE_OUT (D-STK-04) · 7 COUNT_ADJUST (D-STK-05) · 8 MANUAL_ADJUST (D-STK-05 reason)';

COMMENT ON COLUMN "stock_movements"."quantity_delta" IS '≠ 0 · IN = + · OUT = − (CHECK type ⇔ sign)';

COMMENT ON COLUMN "stock_movements"."purchase_item_id" IS 'PURCHASE_IN';

COMMENT ON COLUMN "stock_movements"."stock_transfer_item_id" IS 'TRANSFER_OUT / TRANSFER_IN';

COMMENT ON COLUMN "stock_movements"."sale_item_id" IS 'SALE_OUT (Part 4 — FINISH)';

COMMENT ON COLUMN "stock_movements"."refund_item_id" IS 'SALE_RETURN_IN (Part 4)';

COMMENT ON COLUMN "stock_movements"."stock_count_item_id" IS 'COUNT_ADJUST';

COMMENT ON COLUMN "stock_movements"."adjustment_reason_id" IS 'MANUAL_ADJUST ⇒ မဖြစ်မနေ (D-STK-05) · USAGE_OUT optional';

COMMENT ON COLUMN "stock_movements"."note" IS 'MANUAL_ADJUST / USAGE_OUT — free text';

COMMENT ON COLUMN "stock_movements"."occurred_at" IS 'တကယ် ဖြစ်ချိန်';

COMMENT ON COLUMN "stock_movements"."business_date" IS 'occurred_at ရဲ့ MMT ရက် (D-PLT-15)';

COMMENT ON TABLE "stock_adjustment_reasons" IS '🔒 D-STK-05 — admin manage · delete ✖ (archived_at မထား — disable ပဲ) · (company_id, name_mm) unique';

COMMENT ON COLUMN "stock_adjustment_reasons"."company_id" IS 'D-ORG-03';

COMMENT ON COLUMN "stock_adjustment_reasons"."name_mm" IS 'D-DB-04 — ဥပမာ ပျက်စီး / ပျောက် / ရိုက်မှား';

COMMENT ON COLUMN "stock_adjustment_reasons"."status" IS '0 INACTIVE (disable ပဲ) · 1 ACTIVE';

COMMENT ON TABLE "purchases" IS 'Header = company (branch ၁ ခု / အများကြီး = items မှာ branch — D-STK-02) · POSTED ⇒ items တိုင်း PURCHASE_IN movement (branch အလိုက်) · ကုန်ကျစရိတ် → Part 7 expenses.purchase_id (purchase × branch ၁ ခု — F-P6-03 / F-P7-05; v1.1: expense_id column ဖြုတ်)';

COMMENT ON COLUMN "purchases"."company_id" IS 'D-ORG-03';

COMMENT ON COLUMN "purchases"."supplier_id" IS 'Optional (D-STK-02)';

COMMENT ON COLUMN "purchases"."invoice_reference" IS 'Supplier ဘောင်ချာ နံပါတ် (optional)';

COMMENT ON COLUMN "purchases"."status" IS '0 CANCELLED · 1 DRAFT (ပြင်ရ) · 2 POSTED (stock ဝင်ပြီ — immutable)';

COMMENT ON COLUMN "purchases"."total_amount" IS 'Σ items (app) — MMK';

COMMENT ON COLUMN "purchases"."purchased_at" IS 'ဝယ်တဲ့ရက် (POSTED မှာ movement occurred_at)';

COMMENT ON COLUMN "purchases"."business_date" IS 'MMT';

COMMENT ON TABLE "purchase_items" IS 'line_total = quantity × unit_cost (generated — SQL)';

COMMENT ON COLUMN "purchase_items"."branch_id" IS 'ဒီ line ဘယ် branch stock ထဲ ဝင် (D-STK-02)';

COMMENT ON COLUMN "purchase_items"."quantity" IS '> 0 pcs';

COMMENT ON COLUMN "purchase_items"."unit_cost_amount" IS 'MMK ≥ 0 — ကုန်ကျစရိတ် history (product မှာ cost မထား)';

COMMENT ON TABLE "stock_transfers" IS '🔒 D-STK-03 (v5.1 — REC-14): DRAFT → SENT → RECEIVED · SENT ပြီး items ပြင် ✖ (app) · in transit report = SENT
Receive = actual qty + ကွာချက် reason (items) · noti receiver (Part 8)
';

COMMENT ON COLUMN "stock_transfers"."to_branch_id" IS '≠ from (CHECK)';

COMMENT ON COLUMN "stock_transfers"."status" IS '0 CANCELLED (DRAFT ကနေပဲ) · 1 DRAFT (ပြင် / cancel ရ) · 2 SENT (ထွက်ပြီ — source −, in transit) · 3 RECEIVED (destination +)';

COMMENT ON COLUMN "stock_transfers"."receiver_type" IS '1 EMPLOYEE (တစ်ယောက်) · 2 BRANCH_STAFF (to_branch ဝန်ထမ်း အားလုံး) — noti (D-STK-03)';

COMMENT ON COLUMN "stock_transfers"."receiver_employee_id" IS 'EMPLOYEE ⇒ မဖြစ်မနေ (CHECK)';

COMMENT ON COLUMN "stock_transfers"."sent_at" IS 'SENT ⇒ (CHECK) — TRANSFER_OUT movement occurred_at';

COMMENT ON COLUMN "stock_transfers"."received_at" IS 'RECEIVED ⇒ (CHECK) — TRANSFER_IN movement';

COMMENT ON TABLE "stock_transfer_items" IS 'TRANSFER_OUT = −quantity_sent (from) · TRANSFER_IN = +quantity_received (to) · ကွာချက် = ပျောက် (from branch ခံ — report) F-P6-06';

COMMENT ON COLUMN "stock_transfer_items"."quantity_sent" IS '> 0';

COMMENT ON COLUMN "stock_transfer_items"."quantity_received" IS 'RECEIVED မှာ ဖြည့် (≥ 0) · ≠ sent ⇒ difference_reason (CHECK)';

COMMENT ON TABLE "stock_counts" IS 'Branch ၁ ခု IN_PROGRESS count ၁ ခုပဲ (partial unique) · POSTED ⇒ items ကွာချက် ≠ 0 တိုင်း COUNT_ADJUST movement';

COMMENT ON COLUMN "stock_counts"."status" IS '0 CANCELLED · 1 IN_PROGRESS · 2 POSTED (ကွာချက် movement ထုတ်ပြီ — immutable)';

COMMENT ON TABLE "stock_count_items" IS 'difference = counted − expected (generated — SQL)';

COMMENT ON COLUMN "stock_count_items"."expected_quantity" IS 'Count စချိန် quantity_on_hand snapshot';

COMMENT ON COLUMN "stock_count_items"."counted_quantity" IS 'ရေတဲ့ အရေအတွက် (≥ 0) — NULL = မရေရသေး (POSTED ⇒ NOT NULL — app)';

COMMENT ON COLUMN "stock_count_items"."adjustment_reason_id" IS 'ကွာချက် ≠ 0 ⇒ optional reason (D-STK-05)';

COMMENT ON TABLE "expense_categories" IS '🔒 D-FIN-02 — admin manage · "Staff Advance" category ✖ (REC-15 — advance / loan = receivable, Part 5) · (company_id, name_mm) unique (SQL) · F-P7-01';

COMMENT ON COLUMN "expense_categories"."id" IS 'UUIDv7';

COMMENT ON COLUMN "expense_categories"."company_id" IS 'D-ORG-03';

COMMENT ON COLUMN "expense_categories"."name_mm" IS 'D-DB-04';

COMMENT ON COLUMN "expense_categories"."system_code" IS 'NULL = admin ဖန်တီး (D-FIN-02) · 1 SALARY (payroll auto — D-FIN-04) · 2 PRODUCT_PURCHASE (Part 6 auto) · 3 HOME_SERVICE_TRANSPORT (D-SVC-06) — archive ✖';

COMMENT ON COLUMN "expense_categories"."status" IS '0 INACTIVE · 1 ACTIVE';

COMMENT ON TABLE "income_categories" IS '🔒 D-FIN-01 manual income category · service / product / ကားခ revenue = sales (Part 4) auto — category မလို';

COMMENT ON COLUMN "income_categories"."company_id" IS 'D-ORG-03';

COMMENT ON COLUMN "income_categories"."name_mm" IS 'D-DB-04 — ဥပမာ ပစ္စည်း ရောင်း (ဟောင်း) / အခြား';

COMMENT ON COLUMN "income_categories"."status" IS '0 INACTIVE · 1 ACTIVE';

COMMENT ON TABLE "expenses" IS '🔒 D-FIN-03 — PENDING မှာ ပြင်ရ · APPROVED ပြီး ပြင် ✖ (delete + အသစ်) · attachment = Part 8
🔒 D-FIN-04 — salary expense = payroll_entry_branch_allocations.allocated_gross_amount (Gross · advance / loan ✖)
🔒 D-FIN-09 / OPEN-25 — MUST_RETURN_AUTO (+) မူလလ · REVERSAL (−) ပြန်ထည့်လ — category တူ · P&L row ၂ ကြောင်း + label + note (F-P7-04)
Source AUTO (2–6) ⇒ status APPROVED (app) · MANUAL admin ⇒ APPROVED · MANUAL non-admin ⇒ PENDING → noti approver (D-NTF-03)
v1.2 (OPEN-40 a — owner "OPEN-40 OK") — payroll reopen: source 3 row တွေ soft delete ("Payroll reopened — <reason>") → allocation ဖျက် (FK SET NULL — row ကျန်, Finance list မှာ မြင်ရ) → finalize ပြန် = row အသစ် · hard delete ✖ (D-DAT-05)
';

COMMENT ON COLUMN "expenses"."client_request_id" IS 'v1.1 G (d) — P7.EXP.03 manual expense Idempotency-Key (၂ ခါ နှိပ်မိ ကာ — D-VIS-10) · auto source (2–6) = NULL';

COMMENT ON COLUMN "expenses"."company_id" IS 'D-ORG-03';

COMMENT ON COLUMN "expenses"."branch_id" IS 'NULL = company-wide (D-FIN-02 / D-FIN-05 company P&L) · ဖြည့် = branch P&L';

COMMENT ON COLUMN "expenses"."source" IS '1 MANUAL · 2 CASH_OUT (drawer — D-FIN-07) · 3 PAYROLL (finalize auto — D-FIN-04) · 4 PURCHASE (POSTED auto — Part 6) · 5 MUST_RETURN_AUTO (လကုန် — D-FIN-09) · 6 CASH_RETURN_REVERSAL (ပြန်ထည့် — OPEN-25, အနုတ်)';

COMMENT ON COLUMN "expenses"."amount" IS 'MMK · > 0 · REVERSAL ⇒ < 0 (CHECK) · P&L = Σ (APPROVED, deleted ✖)';

COMMENT ON COLUMN "expenses"."expense_date" IS 'MMT — P&L လ (PAYROLL = period_end · MUST_RETURN_AUTO = မူလလ ကုန်ရက် · REVERSAL = ပြန်ထည့်ရက်)';

COMMENT ON COLUMN "expenses"."description_mm" IS 'Free text (D-DB-04)';

COMMENT ON COLUMN "expenses"."paid_via" IS 'MANUAL ⇒ မဖြစ်မနေ: 1 BANK · 2 OWNER_PERSONAL · 3 OTHER (drawer cash = CASH_OUT source ကနေပဲ)';

COMMENT ON COLUMN "expenses"."status" IS '1 PENDING (admin မဟုတ်သူ ထည့် — D-FIN-03) · 2 APPROVED (P&L ထဲ) · 3 REJECTED';

COMMENT ON COLUMN "expenses"."approved_by_user_id" IS 'Permission `expense.approve` · admin ထည့်ရင် ကိုယ်တိုင် (auto APPROVED)';

COMMENT ON COLUMN "expenses"."deleted_at" IS 'Soft delete (D-FIN-03 — "Void" ✖) · P&L ထဲ မပါ · reason + by · v1.2: payroll reopen ⇒ source 3 row soft delete (deletion_reason = "Payroll reopened — <reason>" — OPEN-40 a)';

COMMENT ON COLUMN "expenses"."cash_out_id" IS 'source CASH_OUT / MUST_RETURN_AUTO ⇒ မဖြစ်မနေ (cash out ၁ ခု expense ၁ ခု)';

COMMENT ON COLUMN "expenses"."payroll_entry_branch_allocation_id" IS 'source PAYROLL ⇒ (employee × branch drill-down — D-FIN-04 / D-PAYR-08) · Gross · v1.2: FK ON DELETE SET NULL — NULL = payroll reopen ကြောင့် soft delete ဖြစ်ပြီးသား row ပဲ (CHECK: source 3 ⇒ allocation ရှိ ဒါမှမဟုတ် deleted_at ရှိ)';

COMMENT ON COLUMN "expenses"."purchase_id" IS 'source PURCHASE ⇒ (purchase × branch ၁ ခု — F-P7-05)';

COMMENT ON COLUMN "expenses"."original_expense_id" IS 'REVERSAL ⇒ မူလ MUST_RETURN_AUTO expense (label: မူလ ရက် / ပမာဏ — OPEN-25)';

COMMENT ON COLUMN "expenses"."cash_return_id" IS 'REVERSAL ⇒ ပြန်ထည့်တဲ့ cash return';

COMMENT ON TABLE "manual_incomes" IS '🔒 D-FIN-01 manual income (branch / company) · P&L revenue = sales (Part 4) + ဒီ table (APPROVED ပဲ) · cash income = PENDING / APPROVED ⇒ expected cash (owner E7 — ဗီရိုထဲ ရောက်ပြီ; REJECTED / deleted ✖)';

COMMENT ON COLUMN "manual_incomes"."client_request_id" IS 'v1.1 G (d) — P7.INC.03 Idempotency-Key (၂ ခါ နှိပ်မိ ကာ — D-VIS-10)';

COMMENT ON COLUMN "manual_incomes"."company_id" IS 'D-ORG-03';

COMMENT ON COLUMN "manual_incomes"."branch_id" IS 'NULL = company-wide (D-FIN-01)';

COMMENT ON COLUMN "manual_incomes"."amount" IS '> 0 MMK';

COMMENT ON COLUMN "manual_incomes"."income_date" IS 'MMT';

COMMENT ON COLUMN "manual_incomes"."payment_method_id" IS 'Cash ⇒ drawer cash in → closing expected (REC-17 "± cash in") — PENDING ကတည်းက (owner E7) · branch မဖြစ်မနေ (CHECK)';

COMMENT ON COLUMN "manual_incomes"."status" IS '1 PENDING · 2 APPROVED · 3 REJECTED — expense ပုံစံတူ (F-P7-02)';

COMMENT ON TABLE "cash_out_reasons" IS '🔒 D-FIN-08 Cash Out Reason Master — reason က accounting ဆုံးဖြတ် · (company_id, name_mm) unique (SQL)
Seed: ဝန်ထမ်း ထမင်း (1) · မီးဖိုး (1) · supplier (1) · Home service ကားခ (1 — D-SVC-06) · လစာ ကြိုထုတ် (2, advance) · ဝန်ထမ်း ချေးငွေ (2, loan) · ဘဏ်သွင်း (3) · ပိုင်ရှင် ယာယီ ထုတ် (4)
';

COMMENT ON COLUMN "cash_out_reasons"."company_id" IS 'D-ORG-03';

COMMENT ON COLUMN "cash_out_reasons"."name_mm" IS 'D-DB-04 — ဥပမာ ဝန်ထမ်း ထမင်း / မီးဖိုး / supplier / ဘဏ်သွင်း / ပိုင်ရှင် ယာယီ ထုတ်';

COMMENT ON COLUMN "cash_out_reasons"."accounting_type" IS '1 EXPENSE (→ expenses) · 2 EMPLOYEE_BALANCE (advance / loan → employee_receivables) · 3 CASH_MOVEMENT (ဘဏ်သွင်း — expense ✖) · 4 MUST_RETURN (ယာယီ — D-FIN-09) — 🔒 D-FIN-08';

COMMENT ON COLUMN "cash_out_reasons"."expense_category_id" IS 'EXPENSE / MUST_RETURN ⇒ မဖြစ်မနေ (CHECK — D-FIN-08) · MUST_RETURN = လကုန် auto expense category';

COMMENT ON COLUMN "cash_out_reasons"."receivable_kind" IS 'EMPLOYEE_BALANCE ⇒ 1 SALARY_ADVANCE · 2 STAFF_LOAN (Part 5 employee_receivables.kind) — CHECK';

COMMENT ON COLUMN "cash_out_reasons"."status" IS '0 INACTIVE · 1 ACTIVE (admin "active" — D-FIN-08)';

COMMENT ON TABLE "cash_outs" IS '🔒 D-FIN-07 — drawer ထုတ်တိုင်း form · closing expected cash − Σ cash_outs (business_date)
Type ⇒ ဘာဖြစ်လဲ (app, same tx): EXPENSE → expenses (source 2) · EMPLOYEE_BALANCE → employee_receivables (kind = reason.receivable_kind) · CASH_MOVEMENT → ဘာမှ (cash ↓ ပဲ) · MUST_RETURN → outstanding (report "ပြန်ထည့်ရန်")
Closing CLOSED ပြီး ဒီ branch-date မှာ cash out အသစ် ✖ (reopen မှ — app)
v1.1 (owner E5) — cancel = cancelled_at / by / reason · EXPENSE ⇒ linked expense soft delete · EMPLOYEE_BALANCE ⇒ receivable cancel (Part 5) · active return ရှိ / converted ⇒ cancel ✖ (app — P7-RULE-10)
';

COMMENT ON COLUMN "cash_outs"."client_request_id" IS 'D-VIS-10 double submit';

COMMENT ON COLUMN "cash_outs"."branch_id" IS 'ဘယ် drawer ကနေ';

COMMENT ON COLUMN "cash_outs"."accounting_type" IS 'reason.accounting_type snapshot (reason နောက်မှ ပြင်လည်း history မပြောင်း) — CHECK ⇔ field';

COMMENT ON COLUMN "cash_outs"."amount" IS '> 0 MMK';

COMMENT ON COLUMN "cash_outs"."note" IS 'D-FIN-07 note';

COMMENT ON COLUMN "cash_outs"."taken_by_user_id" IS 'MUST_RETURN ⇒ ယူသူ (user ရှိရင်) · မရှိရင် taken_by_name';

COMMENT ON COLUMN "cash_outs"."taken_by_name" IS 'MUST_RETURN ⇒ user မဟုတ်တဲ့ ယူသူ (CHECK: user ✖ name ✖ ၂ ခုလုံး မရှိ ✖)';

COMMENT ON COLUMN "cash_outs"."expected_return_date" IS 'MUST_RETURN — optional (🟡 D-FIN-07 → F-P7-03 optional)';

COMMENT ON COLUMN "cash_outs"."employee_id" IS 'EMPLOYEE_BALANCE ⇒ ငွေယူတဲ့ ဝန်ထမ်း (CHECK) → employee_receivables (Part 5)';

COMMENT ON COLUMN "cash_outs"."occurred_at" IS 'တကယ် ထုတ်ချိန် (စာအုပ်မှတ်ပြီး closing မှာ သွင်း = user ရိုက် — D-FIN-07)';

COMMENT ON COLUMN "cash_outs"."business_date" IS 'MMT — ဒီရက် closing ရဲ့ expected cash ထဲ (REC-17)';

COMMENT ON COLUMN "cash_outs"."converted_expense_at" IS 'MUST_RETURN — လကုန် closing အထိ မပြန် ⇒ expense auto (D-FIN-09) · expense row = expenses.cash_out_id';

COMMENT ON COLUMN "cash_outs"."settled_at" IS 'MUST_RETURN — Σ cash_returns (cancelled ✖) = amount ⇒ ပိတ် (app)';

COMMENT ON COLUMN "cash_outs"."cancelled_at" IS 'v1.1 G (d) — owner E5: စာရင်းမပိတ်ခင် မှားရင် cancel (row မဖျက် — D-DAT-05) · cancelled ⇒ expected cash / outstanding / လကုန် job ထဲ မပါ';

COMMENT ON COLUMN "cash_outs"."cancelled_by_user_id" IS 'Permission `cashout.delete` (Admin / Manager)';

COMMENT ON COLUMN "cash_outs"."cancel_reason" IS 'cancelled_at ⇔ by ⇔ reason (CHECK — all-or-none, reason ဗလာ ✖)';

COMMENT ON COLUMN "cash_outs"."created_at" IS '= recorded_at';

COMMENT ON TABLE "cash_returns" IS '🔒 D-FIN-09 / OPEN-25 — မူလ cash out converted ပြီး (expense ဖြစ်ပြီး) ⇒ expenses REVERSAL row (−amount, category တူ, original_expense_id, label = မူလ ရက် / ပမာဏ)
Convert မဖြစ်သေး (လအတွင်း ပြန်) ⇒ expense မထုတ် — outstanding ↓ ပဲ
';

COMMENT ON COLUMN "cash_returns"."cash_out_id" IS 'MUST_RETURN cash out ပဲ (app) · partial ရ — Σ ≤ amount (app)';

COMMENT ON COLUMN "cash_returns"."branch_id" IS 'ပြန်ထည့်တဲ့ drawer (ပုံမှန် = cash_out.branch)';

COMMENT ON COLUMN "cash_returns"."amount" IS '> 0';

COMMENT ON COLUMN "cash_returns"."business_date" IS 'MMT — ဒီရက် closing expected cash + (REC-17)';

COMMENT ON COLUMN "cash_returns"."cancelled_at" IS 'v1.1 G (d) — owner E5: ပြန်ထည့်တာ မှားရင် cancel (row မဖျက်) · cancelled ⇒ expected cash ✖ · reversal expense soft delete · cash_out.settled_at ပြန်ဖြုတ် (app — P7-RULE-11)';

COMMENT ON COLUMN "cash_returns"."cancelled_by_user_id" IS 'Permission `cashout.delete` (return ရဲ့ branch)';

COMMENT ON COLUMN "cash_returns"."cancel_reason" IS 'cancelled_at ⇔ by ⇔ reason (CHECK — all-or-none)';

COMMENT ON TABLE "daily_closings" IS '🔒 D-FIN-06 (v5.1) — branch + ရက် · expected / counted / difference / reason · CLOSED immutable · admin reopen (reason) · company consolidated = view
Snapshot column တွေ = CLOSE ချိန် app တွက် (payments / refunds / cash_outs / cash_returns / manual_incomes ကနေ) — ပြီးမှ source ပြောင်းလည်း closing မပြောင်း (F-P7-06)
CLOSED ⇒ ဒီ branch-date late entry (D-VIS-13) / cash out / cash return / cash manual income ✖ — reopen မှ (app) · KBZPay verify = ပိတ်ပြီးလည်း ရ (owner E3 — snapshot မပြောင်း)
Opening = setting default · previous_closing_counted ≠ opening ⇒ reason (ပိုင်ရှင် ထုတ်သွား = Cash Out မှတ်)
';

COMMENT ON COLUMN "daily_closings"."business_date" IS 'MMT · (branch, date) unique';

COMMENT ON COLUMN "daily_closings"."status" IS '1 OPEN (ပိတ်ရန်) · 2 CLOSED (immutable) — reopen ⇒ OPEN + reopen field (D-FIN-06)';

COMMENT ON COLUMN "daily_closings"."opening_cash_amount" IS 'မနက် ဗီရိုထဲ ကြိုထားငွေ — default = branch setting (OPEN-05 A) · ပိတ်သူ ပြင်ရ';

COMMENT ON COLUMN "daily_closings"."previous_closing_counted_amount" IS 'မနေ့ closing ရဲ့ counted (ရှိရင်) — ≠ opening ⇒ reason (CHECK)';

COMMENT ON COLUMN "daily_closings"."cash_sales_amount" IS 'Σ payments (is_cash method, voided ✖, sale FINISHED, business_date) — snapshot';

COMMENT ON COLUMN "daily_closings"."cash_refunds_amount" IS 'Σ refunds (cash method, business_date)';

COMMENT ON COLUMN "daily_closings"."cash_outs_amount" IS 'Σ cash_outs (branch, business_date, cancelled ✖ — v1.1)';

COMMENT ON COLUMN "daily_closings"."cash_returns_amount" IS 'Σ cash_returns (ပြန်ထည့်တဲ့ branch, business_date, cancelled ✖ — v1.1)';

COMMENT ON COLUMN "daily_closings"."cash_manual_incomes_amount" IS 'Σ manual_incomes (cash, PENDING + APPROVED — owner E7, deleted ✖, branch, date)';

COMMENT ON COLUMN "daily_closings"."expected_cash_amount" IS '= opening + sales − refunds − outs + returns + manual (CHECK — REC-17)';

COMMENT ON COLUMN "daily_closings"."counted_cash_amount" IS 'ပိတ်သူ ရေတဲ့ ဗီရိုငွေ — CLOSED ⇒ မဖြစ်မနေ · cash_difference_amount = counted − expected (generated column — SQL) · ≠ 0 ⇒ reason (CHECK) · |diff| > setting ⇒ admin noti (D-NTF-03)';

COMMENT ON COLUMN "daily_closings"."noncash_expected_amount" IS 'Σ payments (non-cash method — KBZPay) business_date';

COMMENT ON COLUMN "daily_closings"."noncash_verified_amount" IS 'Σ verified (D-PAY-02 v5.1)';

COMMENT ON COLUMN "daily_closings"."unverified_payment_count" IS '✔ မရသေးတာ — CLOSED + > 0 ⇒ reason (CHECK — D-PAY-02 v5.1)';

COMMENT ON COLUMN "daily_closings"."closed_by_user_id" IS 'Permission `closing.close` (OPEN-05 A)';

COMMENT ON COLUMN "daily_closings"."last_reopened_by_user_id" IS 'Admin — D-FIN-06 reopen + audit';

COMMENT ON TABLE "settings" IS '🔒 D-PLT-16 — key-value store · (company, branch, key) unique (COALESCE partial — SQL) · row မရှိ = settings.json default
Read = branch override → company → default · Snapshot (payroll rules_snapshot, closing) = value copy
Key list (Part 2–8 setting comment တွေ စု): booking.* · schedule.* · home_service.* · leave.* · sales.* · payroll.* · attendance.* · closing.* · stock.* · site.* (hero / cover / announcement / seo / show_prices)
';

COMMENT ON COLUMN "settings"."id" IS 'UUIDv7';

COMMENT ON COLUMN "settings"."company_id" IS 'D-ORG-03';

COMMENT ON COLUMN "settings"."branch_id" IS 'NULL = company scope · ဖြည့် = branch override (key က settings.json မှာ scope: branch ခွင့်ပြုမှ — app)';

COMMENT ON COLUMN "settings"."key" IS 'settings.json key — ဥပမာ booking.slot_interval_minutes · code ထဲ constant (typo = build error)';

COMMENT ON COLUMN "settings"."value" IS 'Type = settings.json (number / boolean / time / choice / text_mm_en / json) · validation app';

COMMENT ON TABLE "settings_history" IS 'ပြောင်းတိုင်း row ၁ ခု (append-only — trigger) · "tolerance ကို ဘယ်သူ ဘယ်တော့ ပြောင်းလဲ" (D-PLT-16)';

COMMENT ON COLUMN "settings_history"."old_value" IS 'NULL = row အသစ် (default ကနေ ပထမ ပြောင်း)';

COMMENT ON TABLE "audit_events" IS '🔒 D-AUD-02 — **append-only**: UPDATE / DELETE ✖ (trigger) + app DB role = INSERT / SELECT ပဲ (GRANT — SQL) · admin လည်း ပြင်မရ
🔒 D-AUD-02 — ငွေ table ~၁၄ ခုမှာ row trigger → ဒီ table (source 2): sales, sale_items, payments, refunds, refund_items, sale_adjustments, discount_requests, cash_outs, cash_returns, expenses, manual_incomes, daily_closings, payroll_runs, payroll_entries, payroll_lines, employee_receivables, employee_receivable_repayments, commission_results
actor = current_setting(''app.user_id'') (app က transaction တိုင်း SET LOCAL) — မရှိရင် NULL (job)
🔒 D-AUD-01 — admin အကုန် · manager = assigned branch (branch_id filter) · barber ✖ · app မှာ ကြည့်ရုံ
Login event (D-AUTH-05) = source 1, action login.* · System error ≠ audit (REC-38 monitoring သီးသန့်)
F-P8-02 — retention: V1 မဖျက် (D-DAT-05) · partition by month ⏭ (data ကြီးလာမှ)
';

COMMENT ON COLUMN "audit_events"."id" IS 'UUIDv7 (app) · trigger ကနေ = gen_random_uuid()';

COMMENT ON COLUMN "audit_events"."actor_user_id" IS 'NULL = system job / DB trigger without app context';

COMMENT ON COLUMN "audit_events"."actor_session_id" IS 'D-AUD-01 device — user_sessions.device_label ကနေ';

COMMENT ON COLUMN "audit_events"."source" IS '1 APP (interceptor) · 2 DB_TRIGGER (ငွေ table auto — D-AUD-02) · 3 SYSTEM_JOB';

COMMENT ON COLUMN "audit_events"."action" IS 'INSERT · UPDATE · DELETE (trigger) · app: booking.cancel, sale.finish, payroll.finalize, closing.reopen, login.success / login.failed (D-AUTH), … (permission code ပုံစံ)';

COMMENT ON COLUMN "audit_events"."entity_type" IS 'table နာမည် (ဥပမာ sales)';

COMMENT ON COLUMN "audit_events"."entity_id" IS 'row id (login event ဆို user id)';

COMMENT ON COLUMN "audit_events"."branch_id" IS 'D-AUD-01 manager scope filter — row ရဲ့ branch_id (ရှိရင်)';

COMMENT ON COLUMN "audit_events"."before_data" IS 'UPDATE / DELETE — row အဟောင်း (D-AUD-01 before)';

COMMENT ON COLUMN "audit_events"."after_data" IS 'INSERT / UPDATE — row အသစ်';

COMMENT ON COLUMN "audit_events"."reason" IS 'App ပေးတဲ့ reason (cancel / override / reopen …) — row ရဲ့ reason column နဲ့ ထပ်ရင် ဒီမှာလည်း copy';

COMMENT ON COLUMN "audit_events"."request_id" IS 'App request correlation (client_request_id / trace)';

COMMENT ON TABLE "notification_types" IS 'Type list = code (notifications.json) → DB sync · admin = enabled ✔ / ✖ ပဲ · F-P8-03';

COMMENT ON COLUMN "notification_types"."company_id" IS 'D-ORG-03 — company အလိုက် enabled';

COMMENT ON COLUMN "notification_types"."code" IS 'notifications.json key (code sync — D-ROLE-08 ပုံစံ) — ဥပမာ booking.new, booking.cancelled, leave.requested, discount.requested, low_stock, closing.difference, payslip.published, login.new_device, account.deactivated';

COMMENT ON COLUMN "notification_types"."category" IS '1 BOOKING · 2 STAFF (leave / attendance) · 3 MONEY (discount / closing / cash out) · 4 STOCK · 5 PAYROLL · 6 SECURITY';

COMMENT ON COLUMN "notification_types"."is_mandatory" IS 'D-NTF-03 — security / payslip / deactivation = true (admin ပိတ် ✖ — CHECK enabled)';

COMMENT ON COLUMN "notification_types"."enabled" IS 'Admin ထိန်း (D-NTF-03) · mandatory ⇒ true';

COMMENT ON COLUMN "notification_types"."default_recipient_rule" IS '1 ADMINS (ငွေ / ပစ္စည်း — D-NTF-03) · 2 BRANCH_MANAGERS · 3 TARGET_USER (payslip / login / leave decision) · 4 BRANCH_STAFF (transfer receive)';

COMMENT ON COLUMN "notification_types"."archived_at" IS 'notifications.json ကဖြုတ် = archive';

COMMENT ON TABLE "notifications" IS '🔒 D-NTF-01 in-app realtime (WebSocket / SSE push = app) · bell + unread count (partial index — SQL) + mark all + deep link
🔒 D-NTF-02 — 90 ရက် history: job က created_at < now − 90d ကို hard delete (F-P8-04 — transactional data မဟုတ်၊ D-DAT-05 ချွင်းချက်)
';

COMMENT ON COLUMN "notifications"."user_id" IS 'လက်ခံသူ';

COMMENT ON COLUMN "notifications"."template_key" IS 'Language file key — user ရဲ့ ဘာသာအတိုင်း render (D-PLT-03) · စာသား DB မသိမ်း';

COMMENT ON COLUMN "notifications"."payload" IS 'Template parameter (customer name, amount, ရက် …)';

COMMENT ON COLUMN "notifications"."link_path" IS 'Deep link (D-NTF-01) — ဥပမာ /bookings/<id>';

COMMENT ON COLUMN "notifications"."entity_type" IS 'Dedupe / group — ဥပမာ bookings';

COMMENT ON COLUMN "notifications"."read_at" IS 'Bell unread = read_at IS NULL (D-NTF-01) · mark all = UPDATE';

COMMENT ON COLUMN "notifications"."deleted_at" IS 'User က ကိုယ့်ဟာ ဖျက် (D-NTF-02) — soft';

COMMENT ON TABLE "attachments" IS 'F-P8-05 — polymorphic (entity_type / entity_id — FK ✖, app စစ်) · services.image_attachment_id ကတော့ FK (SQL) · permission = entity ရဲ့ permission အတိုင်း';

COMMENT ON COLUMN "attachments"."company_id" IS 'D-ORG-03';

COMMENT ON COLUMN "attachments"."entity_type" IS 'expenses · employees (document — D-EMP-03) · manual_incomes · services (website ပုံ) · site (cover / share ပုံ) · import_jobs (ဖိုင်)';

COMMENT ON COLUMN "attachments"."kind" IS '1 DOCUMENT (receipt / ID / contract) · 2 IMAGE · 3 IMPORT_FILE';

COMMENT ON COLUMN "attachments"."storage_key" IS 'Object storage path (S3-compatible / local) — URL မသိမ်း (signed URL app ထုတ်)';

COMMENT ON COLUMN "attachments"."file_name" IS 'မူလ ဖိုင်နာမည်';

COMMENT ON COLUMN "attachments"."size_bytes" IS '> 0 · max = setting';

COMMENT ON COLUMN "attachments"."deleted_at" IS 'Soft delete — storage cleanup job';

COMMENT ON COLUMN "attachments"."deleted_by_user_id" IS 'NULL + deleted_at = system (uploads.purge / exports.purge / single-image replace — v1.1 G e) · by ⇒ deleted_at မဖြစ်မနေ (CHECK)';

COMMENT ON TABLE "import_jobs" IS '🔒 D-DAT-01 upload → validate → preview → confirm → audit (audit_events source 1, action import.confirm) · status ⇔ timestamp (CHECK)';

COMMENT ON COLUMN "import_jobs"."company_id" IS 'D-ORG-03';

COMMENT ON COLUMN "import_jobs"."source" IS '1 FRESHA_EXPORT (CSV — REC-30 master data ပဲ) · 2 TEMPLATE (ဆိုင်ရဲ့ Excel / CSV template)';

COMMENT ON COLUMN "import_jobs"."entity_type" IS 'customers · services · products · employees … (master data — REC-30)';

COMMENT ON COLUMN "import_jobs"."file_attachment_id" IS 'Upload ဖိုင် (kind 3)';

COMMENT ON COLUMN "import_jobs"."status" IS '0 CANCELLED · 1 UPLOADED · 2 VALIDATED (preview) · 3 CONFIRMED (import ပြီး) · 4 FAILED (D-DAT-01 flow)';

COMMENT ON COLUMN "import_jobs"."options" IS 'Column mapping / duplicate rule (ဖုန်းတူ = ပြန်သုံး — D-CUS-02)';

COMMENT ON COLUMN "import_jobs"."error_message" IS 'FAILED';

COMMENT ON COLUMN "import_job_rows"."row_number" IS 'ဖိုင်ထဲ row (1 = ပထမ data row)';

COMMENT ON COLUMN "import_job_rows"."raw_data" IS 'Column → value';

COMMENT ON COLUMN "import_job_rows"."status" IS '1 PENDING · 2 VALID · 3 ERROR · 4 IMPORTED · 5 SKIPPED (duplicate — ရှိပြီးသား entity ချိတ်)';

COMMENT ON COLUMN "import_job_rows"."errors" IS 'ERROR ⇒ [{column, message_key}] (language file key)';

COMMENT ON COLUMN "import_job_rows"."entity_id" IS 'IMPORTED / SKIPPED ⇒ ဖန်တီး / ချိတ်တဲ့ row id';

COMMENT ON TABLE "import_source_refs" IS '🔒 D-DB-01 / §6.1 #4 — vendor id ကို သီးသန့် table · migration ပြီးရင် reference ပဲ (REC-30)';

COMMENT ON COLUMN "import_source_refs"."source" IS '1 FRESHA · 2 TEMPLATE (§6.1 #4 — fresha_id core table မှာ မထား)';

COMMENT ON COLUMN "import_source_refs"."source_id" IS 'Fresha id / export row key';

COMMENT ON TABLE "backup_runs" IS '🔒 D-DAT-03 log · retention (၃၀ ရက် / ၁ နှစ်) = job က backup ဖိုင် ဖျက်၊ row ကျန် · RESTORE = record တစ်ခုမှား ပြင်ဖို့ ✖ (D-DAT-04) · F-P8-06';

COMMENT ON COLUMN "backup_runs"."kind" IS '1 DAILY (၃၀ ရက် သိမ်း) · 2 WEEKLY (၁ နှစ်) · 3 RESTORE_TEST (လစဉ်) · 4 RESTORE (တကယ် ပြန်သွင်း — D-DAT-04)';

COMMENT ON COLUMN "backup_runs"."status" IS '1 RUNNING · 2 SUCCESS · 3 FAILED';

COMMENT ON COLUMN "backup_runs"."location" IS 'Off-site copy path / bucket key (D-DAT-03)';

COMMENT ON COLUMN "backup_runs"."error_message" IS 'FAILED ⇒ + admin noti (D-DAT-03 failure → notify)';

COMMENT ON COLUMN "backup_runs"."performed_by_user_id" IS 'RESTORE ⇒ authorized user (D-DAT-04) · RESTORE_TEST = user ဒါမှမဟုတ် NULL (လစဉ် auto — sidecar, owner F9 / v1.1 G e) · DAILY / WEEKLY = NULL (job)';

COMMENT ON COLUMN "backup_runs"."reason" IS 'RESTORE ⇒ မဖြစ်မနေ (D-DAT-04 audit)';

COMMENT ON TABLE "branch_opening_hours" IS '🔒 D-WEB-04 (design — OPEN-21 data) — website "ဒီနေ့ ဖွင့်ချိန် / ယခုဖွင့်ထား" · receipt footer
Booking availability ကတော့ schedule_shifts (D-BKG-04) — ဒီ table မဟုတ် · F-P8-07
Permission website.branch_manage (branch scope — D-ROLE-05) = manager ကိုယ့် branch ပဲ
';

COMMENT ON COLUMN "branch_opening_hours"."day_of_week" IS '1 Mon … 7 Sun (ISO — schedule_patterns ပုံစံတူ)';

COMMENT ON COLUMN "branch_opening_hours"."is_closed" IS 'true = ဒီနေ့ ပိတ် (ဥပမာ တနင်္လာ)';

COMMENT ON COLUMN "branch_opening_hours"."opens_at" IS 'MMT — is_closed = false ⇒ မဖြစ်မနေ (CHECK)';

COMMENT ON COLUMN "branch_opening_hours"."closes_at" IS '> opens_at';

COMMENT ON TABLE "branch_closures" IS '🔒 D-WEB-04 ယာယီပိတ်ရက် — website banner + /book မှာ အဲ့ရက် branch ရွေး ✖ (app) · ရက် ထပ် ✖ (EXCLUDE — SQL)
Staff schedule / leave ကို မထိ (admin က shift ကိုယ်တိုင် ဖြုတ်) — F-P8-07
';

COMMENT ON COLUMN "branch_closures"."start_date" IS 'MMT';

COMMENT ON COLUMN "branch_closures"."end_date" IS '≥ start';

COMMENT ON COLUMN "branch_closures"."notice_mm" IS 'Website notice — ဥပမာ သင်္ကြန် ပိတ် (D-DB-04)';

COMMENT ON COLUMN "branch_closures"."archived_at" IS 'ဖျက် = archive';

ALTER TABLE "branches" ADD FOREIGN KEY ("company_id") REFERENCES "companies" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "users" ADD FOREIGN KEY ("invited_by_user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "employees" ADD FOREIGN KEY ("company_id") REFERENCES "companies" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "employees" ADD FOREIGN KEY ("user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "employee_branches" ADD FOREIGN KEY ("employee_id") REFERENCES "employees" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "employee_branches" ADD FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "roles" ADD FOREIGN KEY ("company_id") REFERENCES "companies" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "role_permissions" ADD FOREIGN KEY ("role_id") REFERENCES "roles" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "role_permissions" ADD FOREIGN KEY ("permission_id") REFERENCES "permissions" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "employee_roles" ADD FOREIGN KEY ("employee_id") REFERENCES "employees" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "employee_roles" ADD FOREIGN KEY ("role_id") REFERENCES "roles" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "employee_role_branches" ADD FOREIGN KEY ("employee_role_id") REFERENCES "employee_roles" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "employee_role_branches" ADD FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "login_otps" ADD FOREIGN KEY ("user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "user_sessions" ADD FOREIGN KEY ("user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "user_sessions" ADD FOREIGN KEY ("revoked_by_user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "service_categories" ADD FOREIGN KEY ("company_id") REFERENCES "companies" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "services" ADD FOREIGN KEY ("company_id") REFERENCES "companies" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "services" ADD FOREIGN KEY ("category_id") REFERENCES "service_categories" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "branch_services" ADD FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "branch_services" ADD FOREIGN KEY ("service_id") REFERENCES "services" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "service_option_groups" ADD FOREIGN KEY ("service_id") REFERENCES "services" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "service_option_values" ADD FOREIGN KEY ("option_group_id") REFERENCES "service_option_groups" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "service_variants" ADD FOREIGN KEY ("service_id") REFERENCES "services" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "service_variant_values" ADD FOREIGN KEY ("service_variant_id") REFERENCES "service_variants" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "service_variant_values" ADD FOREIGN KEY ("option_value_id") REFERENCES "service_option_values" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "service_prices" ADD FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "service_prices" ADD FOREIGN KEY ("service_id") REFERENCES "services" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "service_prices" ADD FOREIGN KEY ("service_variant_id") REFERENCES "service_variants" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "service_prices" ADD FOREIGN KEY ("employee_id") REFERENCES "employees" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "employee_service_eligibilities" ADD FOREIGN KEY ("employee_id") REFERENCES "employees" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "employee_service_eligibilities" ADD FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "employee_service_eligibilities" ADD FOREIGN KEY ("service_id") REFERENCES "services" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "schedule_patterns" ADD FOREIGN KEY ("employee_id") REFERENCES "employees" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "schedule_patterns" ADD FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "schedule_shifts" ADD FOREIGN KEY ("employee_id") REFERENCES "employees" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "schedule_shifts" ADD FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "schedule_shifts" ADD FOREIGN KEY ("schedule_pattern_id") REFERENCES "schedule_patterns" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "leave_types" ADD FOREIGN KEY ("company_id") REFERENCES "companies" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "leaves" ADD FOREIGN KEY ("employee_id") REFERENCES "employees" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "leaves" ADD FOREIGN KEY ("leave_type_id") REFERENCES "leave_types" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "leaves" ADD FOREIGN KEY ("requested_by_user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "leaves" ADD FOREIGN KEY ("decided_by_user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "leaves" ADD FOREIGN KEY ("cancelled_by_user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "customers" ADD FOREIGN KEY ("company_id") REFERENCES "companies" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "booking_cancel_reasons" ADD FOREIGN KEY ("company_id") REFERENCES "companies" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "bookings" ADD FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "bookings" ADD FOREIGN KEY ("customer_id") REFERENCES "customers" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "bookings" ADD FOREIGN KEY ("booked_employee_id") REFERENCES "employees" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "bookings" ADD FOREIGN KEY ("created_by_user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "bookings" ADD FOREIGN KEY ("cancel_reason_id") REFERENCES "booking_cancel_reasons" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "bookings" ADD FOREIGN KEY ("cancelled_by_user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "booking_items" ADD FOREIGN KEY ("booking_id") REFERENCES "bookings" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "booking_items" ADD FOREIGN KEY ("service_id") REFERENCES "services" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "booking_items" ADD FOREIGN KEY ("service_variant_id") REFERENCES "service_variants" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "visits" ADD FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "visits" ADD FOREIGN KEY ("booking_id") REFERENCES "bookings" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "visits" ADD FOREIGN KEY ("performed_by_employee_id") REFERENCES "employees" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "visits" ADD FOREIGN KEY ("started_by_user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "visits" ADD FOREIGN KEY ("completed_by_user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "visits" ADD FOREIGN KEY ("incomplete_by_user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "sales" ADD FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "sales" ADD FOREIGN KEY ("visit_id") REFERENCES "visits" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "sales" ADD FOREIGN KEY ("customer_id") REFERENCES "customers" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "sales" ADD FOREIGN KEY ("discount_code_id") REFERENCES "discount_codes" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "sales" ADD FOREIGN KEY ("discount_request_id") REFERENCES "discount_requests" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "sales" ADD FOREIGN KEY ("finished_by_user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "sale_items" ADD FOREIGN KEY ("sale_id") REFERENCES "sales" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "sale_items" ADD FOREIGN KEY ("service_id") REFERENCES "services" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "sale_items" ADD FOREIGN KEY ("service_variant_id") REFERENCES "service_variants" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "sale_items" ADD FOREIGN KEY ("booking_item_id") REFERENCES "booking_items" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "sale_items" ADD FOREIGN KEY ("performed_by_employee_id") REFERENCES "employees" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "sale_items" ADD FOREIGN KEY ("price_override_by_user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "sale_items" ADD FOREIGN KEY ("removed_by_user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "payment_methods" ADD FOREIGN KEY ("company_id") REFERENCES "companies" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "payments" ADD FOREIGN KEY ("sale_id") REFERENCES "sales" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "payments" ADD FOREIGN KEY ("payment_method_id") REFERENCES "payment_methods" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "payments" ADD FOREIGN KEY ("collected_by_employee_id") REFERENCES "employees" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "payments" ADD FOREIGN KEY ("recorded_by_user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "payments" ADD FOREIGN KEY ("verified_by_user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "payments" ADD FOREIGN KEY ("voided_by_user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "receipt_counters" ADD FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "discount_codes" ADD FOREIGN KEY ("company_id") REFERENCES "companies" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "discount_codes" ADD FOREIGN KEY ("created_by_user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "discount_code_branches" ADD FOREIGN KEY ("discount_code_id") REFERENCES "discount_codes" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "discount_code_branches" ADD FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "discount_code_customer_uses" ADD FOREIGN KEY ("discount_code_id") REFERENCES "discount_codes" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "discount_code_customer_uses" ADD FOREIGN KEY ("customer_id") REFERENCES "customers" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "discount_code_customer_uses" ADD FOREIGN KEY ("sale_id") REFERENCES "sales" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "discount_requests" ADD FOREIGN KEY ("sale_id") REFERENCES "sales" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "discount_requests" ADD FOREIGN KEY ("requested_by_user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "discount_requests" ADD FOREIGN KEY ("decided_by_user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "refunds" ADD FOREIGN KEY ("sale_id") REFERENCES "sales" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "refunds" ADD FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "refunds" ADD FOREIGN KEY ("payment_method_id") REFERENCES "payment_methods" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "refunds" ADD FOREIGN KEY ("refunded_by_user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "refund_items" ADD FOREIGN KEY ("refund_id") REFERENCES "refunds" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "refund_items" ADD FOREIGN KEY ("sale_item_id") REFERENCES "sale_items" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "sale_adjustments" ADD FOREIGN KEY ("sale_id") REFERENCES "sales" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "sale_adjustments" ADD FOREIGN KEY ("payment_id") REFERENCES "payments" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "sale_adjustments" ADD FOREIGN KEY ("sale_item_id") REFERENCES "sale_items" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "sale_adjustments" ADD FOREIGN KEY ("new_payment_method_id") REFERENCES "payment_methods" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "sale_adjustments" ADD FOREIGN KEY ("new_employee_id") REFERENCES "employees" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "sale_adjustments" ADD FOREIGN KEY ("adjusted_by_user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "commission_plans" ADD FOREIGN KEY ("company_id") REFERENCES "companies" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "commission_plan_tiers" ADD FOREIGN KEY ("commission_plan_id") REFERENCES "commission_plans" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "employee_commission_plans" ADD FOREIGN KEY ("employee_id") REFERENCES "employees" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "employee_commission_plans" ADD FOREIGN KEY ("commission_plan_id") REFERENCES "commission_plans" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "employee_commission_plans" ADD FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "employee_commission_plans" ADD FOREIGN KEY ("assigned_by_user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "employee_commission_plans" ADD FOREIGN KEY ("archived_by_user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "commission_results" ADD FOREIGN KEY ("payroll_run_id") REFERENCES "payroll_runs" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "commission_results" ADD FOREIGN KEY ("employee_id") REFERENCES "employees" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "commission_results" ADD FOREIGN KEY ("employee_commission_plan_id") REFERENCES "employee_commission_plans" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "commission_result_lines" ADD FOREIGN KEY ("commission_result_id") REFERENCES "commission_results" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "commission_result_lines" ADD FOREIGN KEY ("sale_item_id") REFERENCES "sale_items" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "commission_result_lines" ADD FOREIGN KEY ("refund_item_id") REFERENCES "refund_items" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "commission_result_lines" ADD FOREIGN KEY ("original_line_id") REFERENCES "commission_result_lines" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "commission_result_lines" ADD FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "employee_salaries" ADD FOREIGN KEY ("employee_id") REFERENCES "employees" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "employee_salaries" ADD FOREIGN KEY ("set_by_user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "employee_salaries" ADD FOREIGN KEY ("archived_by_user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "payroll_line_categories" ADD FOREIGN KEY ("company_id") REFERENCES "companies" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "payroll_runs" ADD FOREIGN KEY ("company_id") REFERENCES "companies" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "payroll_runs" ADD FOREIGN KEY ("calculated_by_user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "payroll_runs" ADD FOREIGN KEY ("finalized_by_user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "payroll_runs" ADD FOREIGN KEY ("published_by_user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "payroll_runs" ADD FOREIGN KEY ("paid_by_user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "payroll_runs" ADD FOREIGN KEY ("last_reopened_by_user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "payroll_runs" ADD FOREIGN KEY ("created_by_user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "payroll_entries" ADD FOREIGN KEY ("payroll_run_id") REFERENCES "payroll_runs" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "payroll_entries" ADD FOREIGN KEY ("employee_id") REFERENCES "employees" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "payroll_lines" ADD FOREIGN KEY ("payroll_entry_id") REFERENCES "payroll_entries" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "payroll_lines" ADD FOREIGN KEY ("category_id") REFERENCES "payroll_line_categories" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "payroll_lines" ADD FOREIGN KEY ("override_by_user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "payroll_lines" ADD FOREIGN KEY ("commission_result_id") REFERENCES "commission_results" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "payroll_lines" ADD FOREIGN KEY ("employee_receivable_id") REFERENCES "employee_receivables" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "payroll_attendance_items" ADD FOREIGN KEY ("payroll_entry_id") REFERENCES "payroll_entries" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "payroll_attendance_items" ADD FOREIGN KEY ("attendance_exception_id") REFERENCES "attendance_exceptions" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "payroll_attendance_items" ADD FOREIGN KEY ("leave_id") REFERENCES "leaves" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "payroll_attendance_items" ADD FOREIGN KEY ("override_by_user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "payroll_entry_branch_allocations" ADD FOREIGN KEY ("payroll_entry_id") REFERENCES "payroll_entries" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "payroll_entry_branch_allocations" ADD FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "employee_receivables" ADD FOREIGN KEY ("employee_id") REFERENCES "employees" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "employee_receivables" ADD FOREIGN KEY ("issued_by_user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "employee_receivable_repayments" ADD FOREIGN KEY ("employee_receivable_id") REFERENCES "employee_receivables" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "employee_receivable_repayments" ADD FOREIGN KEY ("payroll_line_id") REFERENCES "payroll_lines" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "employee_receivable_repayments" ADD FOREIGN KEY ("received_by_user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "branch_attendance_qr_tokens" ADD FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "branch_attendance_qr_tokens" ADD FOREIGN KEY ("created_by_user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "branch_attendance_qr_tokens" ADD FOREIGN KEY ("revoked_by_user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "attendance_records" ADD FOREIGN KEY ("employee_id") REFERENCES "employees" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "attendance_records" ADD FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "attendance_records" ADD FOREIGN KEY ("qr_token_id") REFERENCES "branch_attendance_qr_tokens" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "attendance_records" ADD FOREIGN KEY ("entered_by_user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "attendance_records" ADD FOREIGN KEY ("schedule_shift_id") REFERENCES "schedule_shifts" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "attendance_records" ADD FOREIGN KEY ("corrected_by_user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "attendance_records" ADD FOREIGN KEY ("voided_by_user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "attendance_exceptions" ADD FOREIGN KEY ("employee_id") REFERENCES "employees" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "attendance_exceptions" ADD FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "attendance_exceptions" ADD FOREIGN KEY ("schedule_shift_id") REFERENCES "schedule_shifts" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "attendance_exceptions" ADD FOREIGN KEY ("attendance_record_id") REFERENCES "attendance_records" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "attendance_exceptions" ADD FOREIGN KEY ("leave_id") REFERENCES "leaves" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "attendance_exceptions" ADD FOREIGN KEY ("resolved_by_user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "product_categories" ADD FOREIGN KEY ("company_id") REFERENCES "companies" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "products" ADD FOREIGN KEY ("company_id") REFERENCES "companies" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "products" ADD FOREIGN KEY ("category_id") REFERENCES "product_categories" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "suppliers" ADD FOREIGN KEY ("company_id") REFERENCES "companies" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "branch_stock_levels" ADD FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "branch_stock_levels" ADD FOREIGN KEY ("product_id") REFERENCES "products" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "stock_movements" ADD FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "stock_movements" ADD FOREIGN KEY ("product_id") REFERENCES "products" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "stock_movements" ADD FOREIGN KEY ("purchase_item_id") REFERENCES "purchase_items" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "stock_movements" ADD FOREIGN KEY ("stock_transfer_item_id") REFERENCES "stock_transfer_items" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "stock_movements" ADD FOREIGN KEY ("sale_item_id") REFERENCES "sale_items" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "stock_movements" ADD FOREIGN KEY ("refund_item_id") REFERENCES "refund_items" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "stock_movements" ADD FOREIGN KEY ("stock_count_item_id") REFERENCES "stock_count_items" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "stock_movements" ADD FOREIGN KEY ("adjustment_reason_id") REFERENCES "stock_adjustment_reasons" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "stock_movements" ADD FOREIGN KEY ("recorded_by_user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "stock_adjustment_reasons" ADD FOREIGN KEY ("company_id") REFERENCES "companies" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "purchases" ADD FOREIGN KEY ("company_id") REFERENCES "companies" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "purchases" ADD FOREIGN KEY ("supplier_id") REFERENCES "suppliers" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "purchases" ADD FOREIGN KEY ("posted_by_user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "purchases" ADD FOREIGN KEY ("created_by_user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "purchase_items" ADD FOREIGN KEY ("purchase_id") REFERENCES "purchases" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "purchase_items" ADD FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "purchase_items" ADD FOREIGN KEY ("product_id") REFERENCES "products" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "stock_transfers" ADD FOREIGN KEY ("from_branch_id") REFERENCES "branches" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "stock_transfers" ADD FOREIGN KEY ("to_branch_id") REFERENCES "branches" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "stock_transfers" ADD FOREIGN KEY ("receiver_employee_id") REFERENCES "employees" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "stock_transfers" ADD FOREIGN KEY ("created_by_user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "stock_transfers" ADD FOREIGN KEY ("sent_by_user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "stock_transfers" ADD FOREIGN KEY ("received_by_user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "stock_transfer_items" ADD FOREIGN KEY ("stock_transfer_id") REFERENCES "stock_transfers" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "stock_transfer_items" ADD FOREIGN KEY ("product_id") REFERENCES "products" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "stock_counts" ADD FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "stock_counts" ADD FOREIGN KEY ("started_by_user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "stock_counts" ADD FOREIGN KEY ("posted_by_user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "stock_count_items" ADD FOREIGN KEY ("stock_count_id") REFERENCES "stock_counts" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "stock_count_items" ADD FOREIGN KEY ("product_id") REFERENCES "products" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "stock_count_items" ADD FOREIGN KEY ("adjustment_reason_id") REFERENCES "stock_adjustment_reasons" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "expense_categories" ADD FOREIGN KEY ("company_id") REFERENCES "companies" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "income_categories" ADD FOREIGN KEY ("company_id") REFERENCES "companies" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "expenses" ADD FOREIGN KEY ("company_id") REFERENCES "companies" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "expenses" ADD FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "expenses" ADD FOREIGN KEY ("category_id") REFERENCES "expense_categories" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "expenses" ADD FOREIGN KEY ("requested_by_user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "expenses" ADD FOREIGN KEY ("approved_by_user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "expenses" ADD FOREIGN KEY ("deleted_by_user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "expenses" ADD FOREIGN KEY ("cash_out_id") REFERENCES "cash_outs" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "expenses" ADD FOREIGN KEY ("purchase_id") REFERENCES "purchases" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "expenses" ADD FOREIGN KEY ("original_expense_id") REFERENCES "expenses" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "expenses" ADD FOREIGN KEY ("cash_return_id") REFERENCES "cash_returns" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "expenses" ADD FOREIGN KEY ("payroll_entry_branch_allocation_id") REFERENCES "payroll_entry_branch_allocations" ("id") ON DELETE SET NULL DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "manual_incomes" ADD FOREIGN KEY ("company_id") REFERENCES "companies" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "manual_incomes" ADD FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "manual_incomes" ADD FOREIGN KEY ("category_id") REFERENCES "income_categories" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "manual_incomes" ADD FOREIGN KEY ("payment_method_id") REFERENCES "payment_methods" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "manual_incomes" ADD FOREIGN KEY ("requested_by_user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "manual_incomes" ADD FOREIGN KEY ("approved_by_user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "manual_incomes" ADD FOREIGN KEY ("deleted_by_user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "cash_out_reasons" ADD FOREIGN KEY ("company_id") REFERENCES "companies" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "cash_out_reasons" ADD FOREIGN KEY ("expense_category_id") REFERENCES "expense_categories" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "cash_outs" ADD FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "cash_outs" ADD FOREIGN KEY ("reason_id") REFERENCES "cash_out_reasons" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "cash_outs" ADD FOREIGN KEY ("taken_by_user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "cash_outs" ADD FOREIGN KEY ("employee_id") REFERENCES "employees" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "cash_outs" ADD FOREIGN KEY ("recorded_by_user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "cash_outs" ADD FOREIGN KEY ("cancelled_by_user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "cash_returns" ADD FOREIGN KEY ("cash_out_id") REFERENCES "cash_outs" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "cash_returns" ADD FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "cash_returns" ADD FOREIGN KEY ("received_by_user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "cash_returns" ADD FOREIGN KEY ("cancelled_by_user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "daily_closings" ADD FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "daily_closings" ADD FOREIGN KEY ("closed_by_user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "daily_closings" ADD FOREIGN KEY ("last_reopened_by_user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "settings" ADD FOREIGN KEY ("company_id") REFERENCES "companies" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "settings" ADD FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "settings" ADD FOREIGN KEY ("updated_by_user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "settings_history" ADD FOREIGN KEY ("setting_id") REFERENCES "settings" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "settings_history" ADD FOREIGN KEY ("changed_by_user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "audit_events" ADD FOREIGN KEY ("actor_user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "audit_events" ADD FOREIGN KEY ("actor_session_id") REFERENCES "user_sessions" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "audit_events" ADD FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "notification_types" ADD FOREIGN KEY ("company_id") REFERENCES "companies" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "notifications" ADD FOREIGN KEY ("user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "notifications" ADD FOREIGN KEY ("notification_type_id") REFERENCES "notification_types" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "notifications" ADD FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "attachments" ADD FOREIGN KEY ("company_id") REFERENCES "companies" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "attachments" ADD FOREIGN KEY ("uploaded_by_user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "attachments" ADD FOREIGN KEY ("deleted_by_user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "import_jobs" ADD FOREIGN KEY ("company_id") REFERENCES "companies" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "import_jobs" ADD FOREIGN KEY ("file_attachment_id") REFERENCES "attachments" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "import_jobs" ADD FOREIGN KEY ("created_by_user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "import_jobs" ADD FOREIGN KEY ("confirmed_by_user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "import_job_rows" ADD FOREIGN KEY ("import_job_id") REFERENCES "import_jobs" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "import_source_refs" ADD FOREIGN KEY ("import_job_id") REFERENCES "import_jobs" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "backup_runs" ADD FOREIGN KEY ("performed_by_user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "branch_opening_hours" ADD FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "branch_opening_hours" ADD FOREIGN KEY ("updated_by_user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "branch_closures" ADD FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "branch_closures" ADD FOREIGN KEY ("created_by_user_id") REFERENCES "users" ("id") DEFERRABLE INITIALLY IMMEDIATE;
