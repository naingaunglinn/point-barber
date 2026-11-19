export function pay(text: string, item: any) {
  const body = JSON.parse(text);
  const amount = Math.abs(body.total_amount);
  return item.price(amount);
}
