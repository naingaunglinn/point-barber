type Customer = { phone: string }; type SaleDto = { total_amount: number };
declare const sale: { customer: Customer | null }; declare const body: unknown;
const phone = sale.customer!.phone;
const dto = body as SaleDto;
const methods = ['cash', 'kbzpay'] as const;
export { phone, dto, methods };
