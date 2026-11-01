import { Injectable } from '@nestjs/common';

import type { VisitsPort } from './visits-port.js';

// Where delivery registers its VisitsPort at start-up (design D1); every sales service that needs the
// visit — the line endpoints, FINISH — reads it from here.
@Injectable()
export class VisitsRegistry {
  private port: VisitsPort | undefined;

  use(port: VisitsPort): void {
    this.port = port;
  }

  get visits(): VisitsPort {
    if (this.port === undefined)
      throw new Error('No VisitsPort registered (DeliveryModule not loaded)');
    return this.port;
  }
}
