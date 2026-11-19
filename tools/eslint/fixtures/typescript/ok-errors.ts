declare function post(tx: string): Promise<void>; declare const tx: string;
try { await post(tx); } catch { /* quota: defaults apply */ }
throw new Error('bad total');
try { await post(tx); } catch (error) { throw new Error('post failed', { cause: error }); }
post(tx).catch((e: unknown) => String(e));
