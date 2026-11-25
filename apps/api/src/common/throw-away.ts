/** Throw-away: check-date-slice must fail on this line (add-ci-guards task 4.2). */
export const throwAwayDate = (): string => new Date().toISOString().slice(0, 10);
