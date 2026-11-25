import type { AccessCode } from '../../../common/access/declarations.js';

// The member groups of `PATCH /v1/employees/{id}` (P1.EMP.04 · add-employee-management design D2):
// the code each member of the body needs. Members with the same code are one group.
export const EMPLOYEE_UPDATE_FIELDS: Readonly<Record<string, AccessCode>> = {
  employee_code: 'employee.update',
  name_mm: 'employee.update',
  name_en: 'employee.update',
  phone: 'employee.update',
  join_date: 'employee.update',
  internal_notes: 'employee.update',
  public_profile: 'employee.update',
  public_specialty_mm: 'employee.update',
  public_specialty_en: 'employee.update',
  public_rating: 'employee.rating_update',
  show_own_earnings: 'employee.earnings_update',
  photo_attachment_id: 'employee.update',
};
