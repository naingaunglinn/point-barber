import {
  type MeResponse,
  type PaymentDto,
  type PaymentMethodDto,
  type SaleDto,
  type SaleItemDto,
  type ServiceListItemDto,
  type VisitDto,
  saleSchema,
  serviceListItemSchema,
  visitSchema,
} from '@point/shared';

// add-walkin-visit-checkout — whole DTOs of the fixture day for the web screen tests (spec-fixtures: Ko
// Aung at B3, Haircut 10,000 his own price, Monday 05/Oct/2026). Each builder parses its result with the
// strict response schema, so a test never feeds the screens a shape the API cannot answer.

export const IDS = {
  B3: '0199a3f2-0000-7000-8001-0000000000b3',
  AUNG_USER: '0199a3f2-0000-7000-8002-00000000e004',
  AUNG: '0199a3f2-0000-7000-8003-00000000e004',
  VISIT: '0199a3f2-0000-7000-8005-000000000001',
  SALE: '0199a3f2-0000-7000-8006-000000000001',
  HAIRCUT: '0199a3f2-0000-7000-8007-000000000001',
  SHAVE: '0199a3f2-0000-7000-8007-000000000002',
  LINE: '0199a3f2-0000-7000-8008-000000000001',
  CASH: '0199a3f2-0000-7000-8009-0000000000c1',
  KBZPAY: '0199a3f2-0000-7000-8009-0000000000c2',
  PAYMENT: '0199a3f2-0000-7000-800a-000000000001',
} as const;

const AT = '2026-10-05T10:05:00+06:30';
const DURATION = { min: 30, max: 30 };
const aung = { id: IDS.AUNG, display_name: 'Ko Aung' };
const aungUser = { user_id: IDS.AUNG_USER, display_name: 'Ko Aung' };

export function meOf(overrides: Partial<MeResponse> = {}): MeResponse {
  return {
    user: {
      id: IDS.AUNG_USER,
      email: 'aung@point.test',
      status: 1,
      ui_language: null,
      last_login_at: '2026-10-05T09:02:00+06:30',
    },
    employee: {
      id: IDS.AUNG,
      employee_code: 'E004',
      name_mm: 'ကိုအောင်',
      name_en: 'Ko Aung',
      photo_url: null,
      status: 1,
    },
    grants: [],
    branches_in_scope: [
      {
        id: IDS.B3,
        code: 'B3',
        name_mm: 'ပွိုင့် ၃.၀',
        name_en: 'Point 3.0',
        phone: null,
        status: 1,
        is_public: true,
      },
    ],
    today_branch_id: null,
    assigned_branch_ids: [IDS.B3],
    effective: { show_own_earnings: false },
    settings: {},
    system: { maintenance: false, server_time: '2026-10-05T10:42:00+06:30', default_language: 1 },
    session: {
      id: '0199a3f2-0000-7000-8004-000000000001',
      device_label: null,
      created_at: '2026-10-05T09:02:00+06:30',
    },
    ...overrides,
  };
}

export function lineOf(overrides: Partial<SaleItemDto> = {}): SaleItemDto {
  return {
    id: IDS.LINE,
    sort_order: 1,
    line_type: 1,
    service_id: IDS.HAIRCUT,
    service_variant_id: null,
    product_id: null,
    booking_item_id: null,
    performed_by: aung,
    effective_performed_by: aung,
    description_mm: 'ဆံပင်ညှပ်',
    description_en: 'Haircut',
    quantity: 1,
    list_price_amount: 10_000,
    unit_price_amount: 10_000,
    price_overridden: false,
    price_override_reason: null,
    price_override_by: null,
    line_discount_amount: 0,
    line_total_amount: 10_000,
    refunded_amount: 0,
    added_reason: null,
    removed_at: null,
    removed_by: null,
    removed_reason: null,
    ...overrides,
  };
}

export function paymentOf(overrides: Partial<PaymentDto> = {}): PaymentDto {
  const cash = { id: IDS.CASH, code: 'CASH', name_mm: 'ငွေသား', name_en: 'Cash', kind: 1 };
  return {
    id: IDS.PAYMENT,
    sale_id: IDS.SALE,
    payment_method: cash,
    effective_payment_method: cash,
    amount: 10_000,
    external_reference: null,
    collected_by: aung,
    effective_collected_by: aung,
    received_at: '2026-10-05T10:41:00+06:30',
    recorded_by: aungUser,
    requires_verification: false,
    verified_at: null,
    verified_by: null,
    voided_at: null,
    voided_by: null,
    void_reason: null,
    created_at: '2026-10-05T10:41:00+06:30',
    ...overrides,
  } as PaymentDto;
}

export function saleOf(overrides: Partial<SaleDto> = {}): SaleDto {
  return saleSchema.parse({
    id: IDS.SALE,
    branch_id: IDS.B3,
    visit_id: IDS.VISIT,
    kind: 'service',
    status: 1,
    customer: null,
    items: [lineOf()],
    subtotal_amount: 10_000,
    discount_amount: 0,
    discount: null,
    pending_discount_request: null,
    service_charge_rate: 0,
    service_charge_amount: 0,
    tax_rate: 0,
    tax_amount: 0,
    total_amount: 10_000,
    paid_amount: 0,
    remaining_amount: 10_000,
    change_due_amount: 0,
    payments: [],
    receipt_number: null,
    business_date: null,
    finished_at: null,
    finished_by: null,
    cancelled_at: null,
    refunds: [],
    refunded_amount: 0,
    adjustments: [],
    commission_estimate: null,
    difference_of: null,
    actions: {
      edit_lines: true,
      take_payment: true,
      finish: false,
      finish_needs_reason: false,
      override_price: false,
      mark_incomplete: true,
      request_discount: false,
      refund: false,
      adjust: false,
    },
    warnings: [],
    created_at: AT,
    updated_at: AT,
    ...overrides,
  });
}

export function visitOf(overrides: Partial<VisitDto> = {}): VisitDto {
  return visitSchema.parse({
    id: IDS.VISIT,
    branch_id: IDS.B3,
    booking_id: null,
    status: 1,
    performed_by: aung,
    booked_employee: null,
    performer_change_reason: null,
    proxy_reason: null,
    started_by: aungUser,
    location_type: 1,
    home_address: null,
    started_at: AT,
    completed_at: null,
    completed_by: null,
    finished_at: null,
    incomplete_at: null,
    incomplete_by: null,
    incomplete_reason: null,
    is_late_entry: false,
    late_entry_reason: null,
    late_entry_note: null,
    business_date: '2026-10-05',
    recorded_at: AT,
    updated_at: AT,
    sale: saleOf(),
    warnings: [],
    ...overrides,
  });
}

export function serviceOf(id: string, nameEn: string, sortOrder: number): ServiceListItemDto {
  return serviceListItemSchema.parse({
    id,
    category_id: '0199a3f2-0000-7000-800b-000000000001',
    name_mm: nameEn,
    name_en: nameEn,
    pricing_mode: 1,
    buffer_minutes: 0,
    status: 1,
    show_on_website: true,
    sort_order: sortOrder,
    branch_ids: [IDS.B3],
    duration_range: DURATION,
    archived_at: null,
    updated_at: AT,
  });
}

export function methodOf(code: 'CASH' | 'KBZPAY'): PaymentMethodDto {
  const cash = code === 'CASH';
  return {
    id: cash ? IDS.CASH : IDS.KBZPAY,
    code,
    name_mm: cash ? 'ငွေသား' : 'KBZPay',
    name_en: cash ? 'Cash' : 'KBZPay',
    kind: cash ? 1 : 2,
    is_cash: cash,
    requires_reference: !cash,
    requires_verification: !cash,
    reference_regex: cash ? null : '^KBZ[0-9]{10}$',
    is_system: true,
    sort_order: cash ? 1 : 2,
    status: 1,
    archived_at: null,
    updated_at: AT,
  };
}
