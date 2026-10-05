import { Controller, Get } from '@nestjs/common';

import { Public, Staff } from './access.js';

// Fixture for "Second decorator fails the build": two access decorators on one endpoint.
@Controller('v1/things')
export class ThingsController {
  @Get()
  @Public()
  @Staff()
  list(): string[] {
    return [];
  }
}
