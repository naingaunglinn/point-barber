declare const payments: { create(sale: string): Promise<string> }; declare const sale: string;
declare const lines: string[]; declare function save(line: string): Promise<void>; declare const total: number;
payments.create(sale);
lines.forEach(async (line) => { await save(line); });
const n = await total;
export { n };
