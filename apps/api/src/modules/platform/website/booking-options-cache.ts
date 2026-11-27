import { Injectable } from '@nestjs/common';

// The booking-options cache port (add-website-management design D9 · system design §5): the 60-second
// cache of the public booking options belongs to add-public-booking-modal (#63), which binds the real
// `clear`; a closure write calls it after commit for its branch, and #62's `site.revalidate` handler
// calls it for a `branch:<code>` tag. Until then nothing is cached and the default does nothing.
export abstract class BookingOptionsCache {
  /** Forgets the cached options of these branches (branch ids). */
  abstract clear(branchIds: readonly string[]): void;
}

@Injectable()
export class NoBookingOptionsCache extends BookingOptionsCache {
  override clear(_branchIds: readonly string[]): void {
    // Nothing is cached yet.
  }
}
