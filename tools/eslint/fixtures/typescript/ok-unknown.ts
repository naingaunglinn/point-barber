declare const saleTotalSchema: { parse(value: unknown): { total_amount: number } };

export function pay(text: string, item: unknown) {
  const body: unknown = JSON.parse(text);
  const amount = Math.abs(saleTotalSchema.parse(body).total_amount);
  return typeof item === 'function' ? String(amount) : '';
}
