declare const payments: { create(sale: string): Promise<string> }; declare const sale: string;
declare const lines: string[]; declare function save(line: string): Promise<void>; declare const total: number;
void payments.create(sale);
lines.forEach((line) => { void save(line); });
const n = total;
export { n };
