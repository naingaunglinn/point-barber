type SaleRow = { business_date: string; total_amount: bigint };
declare const sale: SaleRow; declare const paidSoFar: bigint;
const { total_amount, business_date } = sale;
const isFullyPaid = paidSoFar >= total_amount;
const row = { collected_by_employee_id: 'e1', 'X-Requested-With': 'point-app' };
const MAX_LIST_LIMIT = 100;
export function Button() {}
const read = ({ total_amount }: SaleRow) => total_amount;
export { business_date, isFullyPaid, row, MAX_LIST_LIMIT, read };
