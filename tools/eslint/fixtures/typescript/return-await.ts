declare function save(sale: string): Promise<string>; declare const sale: string;
export async function a() { try { return save(sale); } catch (error) { throw new Error('save failed', { cause: error }); } }

export async function b() {
  // no try here
  return save(sale);
}
