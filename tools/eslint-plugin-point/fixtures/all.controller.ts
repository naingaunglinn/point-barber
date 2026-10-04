import { All, Controller } from '@nestjs/common';

// Fixture for "A catch-all handler is covered too": @All() and no access decorator.
@Controller('v1/things')
export class ThingsController {
  @All()
  any(): string {
    return '';
  }
}
