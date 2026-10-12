// Money in front-end and shared code is a whole number of kyats held as a branded `bigint`
// (CG-MONEY-01 · CG-MONEY-02 · AD-IMPL-05 · add-shared-ui-components design D4): a JavaScript
// `number` is not assignable to it, so float money does not compile. On the wire an `_amount` is a
// JSON integer (API-DATA-02); moneyFromWire / moneyToWire convert at the API-client boundary.
export type Mmk = bigint & { readonly __brand: 'Mmk' };
