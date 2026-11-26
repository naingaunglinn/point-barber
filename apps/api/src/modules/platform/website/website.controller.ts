import { Controller, Get, HttpCode, Post, Put } from '@nestjs/common';
import type {
  BookingQr,
  SharePreview,
  SiteContent,
  TeamProfile,
  WebsiteOverview,
} from '@point/shared';

import { Can, CanView } from '../../../common/access/declarations.js';
import { notBuilt } from './not-built.js';

// The website's company-master routes and its branch QR (API Part 8 §10 · P8-RULE-01 · owner F7 ·
// add-website-management design D2): any `website.*` code at any scope reads the overview, the team
// and the share preview; the content save and the manual refresh need `website.update` at company
// scope (403 `company_scope_required` at branch scope); the QR needs a code covering its branch.
// Not mounted yet — see not-built.ts.
@Controller('v1/website')
export class WebsiteController {
  /** P8.WEB.01 — the overview (part A5). */
  @Get()
  @CanView('website')
  overview(): Promise<WebsiteOverview> {
    return notBuilt('P8.WEB.01');
  }

  /** P8.WEB.02 — the site content, saved together (part A6). */
  @Put('content')
  @Can('website.update', { level: 'company' })
  saveContent(): Promise<SiteContent> {
    return notBuilt('P8.WEB.02');
  }

  /** P8.WEB.09 — the team's public profiles (part A5). */
  @Get('team')
  @CanView('website')
  team(): Promise<{ items: TeamProfile[] }> {
    return notBuilt('P8.WEB.09');
  }

  /** P8.WEB.10 — the share preview of `/` or `/branches/<code>` (part A5). */
  @Get('share-preview')
  @CanView('website')
  sharePreview(): Promise<SharePreview> {
    return notBuilt('P8.WEB.10');
  }

  /** P8.WEB.11 — the branch booking QR link (part A5). */
  @Get('booking-qr/:branch_id')
  @CanView('website', { branch: 'params.branch_id' })
  bookingQr(): Promise<BookingQr> {
    return notBuilt('P8.WEB.11');
  }

  /** P8.WEB.12 — refresh the website by hand: 202 `{ queued_tags }` (part A5). */
  @Post('revalidate')
  @HttpCode(202)
  @Can('website.update', { level: 'company' })
  revalidate(): Promise<{ queued_tags: string[] }> {
    return notBuilt('P8.WEB.12');
  }
}
