import { Injectable } from '@nestjs/common';
import { type BookingQr, ErrorCode } from '@point/shared';

import { ProblemException } from '../../../common/http/problem.exception.js';
import { isUuid } from '../../../common/http/uuid-v7.js';
import { AppConfig } from '../../../common/config/config.js';
import { WebsiteDirectory } from './website-ports.js';

// P8.WEB.11 — a branch's booking link (D-WEB-02 · AD-QR-01 · design D11 · owner WM8 ★): `url` =
// `SITE_ORIGIN/book?branch=<code>`, `display_url` the same without the scheme. A non-public branch is
// served — its link works. The screen draws the code from `url`; nothing is stored.
@Injectable()
export class BookingQrReader {
  constructor(
    private readonly directory: WebsiteDirectory,
    private readonly config: AppConfig,
  ) {}

  async read(branchId: string): Promise<BookingQr> {
    const branch = isUuid(branchId)
      ? (await this.directory.branchesForWebsite([branchId]))[0]
      : undefined;
    if (branch === undefined) throw new ProblemException(ErrorCode.NOT_FOUND, 404);
    const url = `${this.config.env.SITE_ORIGIN}/book?branch=${branch.code}`;
    return {
      branch_id: branch.id,
      code: branch.code,
      name_mm: branch.name_mm,
      name_en: branch.name_en,
      url,
      display_url: url.replace(/^https?:\/\//, ''),
      logo_url: (await this.directory.company()).logo_url,
      is_public: branch.is_public,
    };
  }
}
