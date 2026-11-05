declare function post(tx: string): Promise<void>; declare const tx: string;
try { await post(tx); } catch {}
throw 'bad total';
try { await post(tx); } catch (error) { throw new Error('post failed'); }
post(tx).catch((e) => String(e));
