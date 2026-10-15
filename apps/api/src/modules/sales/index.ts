// Public surface of the `sales` module (CG-ARCH-01 · ADR-001 rule 1): other modules import only from
// here.
export { SalesModule } from './sales.module.js';
export { PaymentMethodSeed } from './seed/payment-method-seed.js';
