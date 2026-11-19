const total = 0n;
const rate = 15;
function discount(line: { amount: number }) { return { ...line, amount: 0 }; }
function addTax(amount: bigint) { return amount + 1n; }
class Cart { private readonly lines: string[] = []; add(x: string) { this.lines.push(x); } }
export { total, rate, discount, addTax, Cart };
