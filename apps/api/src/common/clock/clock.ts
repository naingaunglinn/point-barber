import { Injectable } from '@nestjs/common';

// Time comes from the injected clock (CG-TIME-03). SystemClock is the one place in the API that
// asks the machine for the time; tests replace it with a fixed clock.
export abstract class Clock {
  abstract now(): Date;
}

@Injectable()
export class SystemClock extends Clock {
  override now(): Date {
    return new Date();
  }
}
