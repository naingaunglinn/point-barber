// Public surface of the `booking` module (CG-ARCH-01 · ADR-001 rule 1).
export { BookingModule } from './booking.module.js';
export { type BookedInRange, type BookedRange, BookingReads } from './reads/booking-reads.js';
export {
  CUSTOMER_CREATE,
  CUSTOMER_REACTIVATE,
  CUSTOMER_RESTORE,
  type CustomerActivity,
  type CustomerRef,
  Customers,
  type MatchResult,
} from './customers/customers.js';
