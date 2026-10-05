import { Controller, Get } from '@nestjs/common';

// Fixture for "Missing decorator fails the build": a route decorator and no access decorator.
@Controller('v1/things')
export class ThingsController {
  @Get()
  list(): string[] {
    return [];
  }
}
