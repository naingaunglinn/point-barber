import { Injectable } from '@nestjs/common';

// The maintenance step of P1-RULE-04 (API-AUTH-06 · add-foundation-auth-access design D2 · D13). Its
// place in the session guard is fixed now, so add-settings-store adds no guard: it replaces this
// implementation with one that reads `system.maintenance` and answers 503 for non-admins.
export abstract class MaintenanceGate {
  /** Resolves when the request may go on; rejects with the maintenance problem otherwise. */
  abstract assertOpen(): Promise<void>;
  /** `/me.system.maintenance`. */
  abstract isOn(): Promise<boolean>;
}

/** `system.maintenance` cannot be set before P1.SYS.03 exists: always open. */
@Injectable()
export class OpenMaintenanceGate extends MaintenanceGate {
  override assertOpen(): Promise<void> {
    return Promise.resolve();
  }
  override isOn(): Promise<boolean> {
    return Promise.resolve(false);
  }
}
