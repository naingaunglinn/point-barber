// Fixture: $transaction outside src/common/database/ (CG-DB-03).
declare const prisma: { $transaction<T>(work: () => Promise<T>): Promise<T> };

export const result = prisma.$transaction(async () => 1);
