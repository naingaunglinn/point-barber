import { Controller, Get } from '@nestjs/common';

import { Public } from './access.js';

// Fixture for "Exactly one decorator passes": one route decorator, one access decorator.
@Controller('v1/things')
export class ThingsController {
  @Get()
  @Public()
  list(): string[] {
    return [];
  }

  // A plain method with no route decorator needs no access decorator.
  helper(): number {
    return 1;
  }
}
