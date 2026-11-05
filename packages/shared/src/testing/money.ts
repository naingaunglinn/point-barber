import type { Mmk } from '../money/mmk.js';
import { negateMoney, parseMoneyInput } from '../money/money.js';

/** An `Mmk` for a test value of any size or sign, built through the production parser (CG-MONEY-02). */
export function testMoney(amount: bigint): Mmk {
  const parsed = parseMoneyInput((amount < 0n ? -amount : amount).toString());
  if (typeof parsed !== 'bigint') throw new Error(`Not a test amount: ${String(amount)}`);
  return amount < 0n ? negateMoney(parsed) : parsed;
}
