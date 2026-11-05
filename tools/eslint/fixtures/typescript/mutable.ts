var total = 0;
let rate = 15;
function discount(line: { amount: number }) { line.amount = 0; }
function addTax(total: bigint) { total = total + 1n; return total; }
class Cart { private lines: string[] = []; add(x: string) { this.lines.push(x); } }
export { total, rate, discount, addTax, Cart };
