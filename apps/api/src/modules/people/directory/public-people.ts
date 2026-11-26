import { Injectable } from '@nestjs/common';

import type { WebsiteProfile } from '../../platform/index.js';
import { WebsiteRepository } from '../repositories/website.repository.js';

// The public fields of the ACTIVE employees with their open assignments (add-website-management design
// D1 · D8 · P8.WEB.09): the team overview of the website management and, later, the public barbers (#62).
@Injectable()
export class PublicPeople {
  constructor(private readonly repository: WebsiteRepository) {}

  /** Every ACTIVE employee ordered by `employee_code`; no phone, e-mail or note member. */
  activeProfiles(): Promise<WebsiteProfile[]> {
    return this.repository.profiles();
  }

  /** How many ACTIVE employees have `public_profile`. */
  countPublicProfiles(): Promise<number> {
    return this.repository.countPublicProfiles();
  }
}
