import { Controller, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import {
  type BookingQr,
  type RevalidateRequestBody,
  type SharePreview,
  type SharePreviewQuery,
  type SiteContent,
  type TeamProfile,
  type WebsiteOverview,
  revalidateRequestSchema,
  sharePreviewQuerySchema,
} from '@point/shared';

import { AccessContext } from '../../../common/access/access-context.js';
import { Can, CanView } from '../../../common/access/declarations.js';
import { ZBody, ZQuery } from '../../../common/http/zod-validation.pipe.js';
import { RequestContext } from '../../../common/http/request-context.js';
import { Audited } from '../audit/audited.js';
import { BookingQrReader } from './booking-qr.js';
import { notBuilt } from './not-built.js';
import { SharePreviewReader } from './share-preview.js';
import { TeamOverviewReader } from './team-overview.js';
import { WebsiteOverviewReader } from './website-overview.js';
import { WEBSITE_REVALIDATE, WebsiteRevalidate } from './website-revalidate.js';

// The website's company-master routes and its branch QR (API Part 8 §10 · P8-RULE-01 · owner F7 ·
// add-website-management design D2): any `website.*` code at any scope reads the overview, the team
// and the share preview; the content save and the manual refresh need `website.update` at company
// scope (403 `company_scope_required` at branch scope); the QR needs a code covering its branch.
// Part A5 builds the reads and the refresh; the content save answers 501 until part A6 (not-built.ts).
@Controller('v1/website')
export class WebsiteController {
  constructor(
    private readonly overviewReader: WebsiteOverviewReader,
    private readonly teamReader: TeamOverviewReader,
    private readonly previewReader: SharePreviewReader,
    private readonly qrReader: BookingQrReader,
    private readonly refresh: WebsiteRevalidate,
  ) {}

  /** P8.WEB.01 — the overview. */
  @Get()
  @CanView('website')
  overview(): Promise<WebsiteOverview> {
    return this.overviewReader.read(grantsOfRequest(), AccessContext.scope());
  }

  /** P8.WEB.02 — the site content, saved together (part A6). */
  @Put('content')
  @Can('website.update', { level: 'company' })
  saveContent(): Promise<SiteContent> {
    return notBuilt('P8.WEB.02');
  }

  /** P8.WEB.09 — the team's public profiles. */
  @Get('team')
  @CanView('website')
  team(): Promise<{ items: TeamProfile[] }> {
    return this.teamReader.list(grantsOfRequest());
  }

  /** P8.WEB.10 — the share preview of `/` or `/branches/<code>`. */
  @Get('share-preview')
  @CanView('website')
  sharePreview(@ZQuery(sharePreviewQuerySchema) query: SharePreviewQuery): Promise<SharePreview> {
    return this.previewReader.read(query);
  }

  /** P8.WEB.11 — the branch booking QR link. */
  @Get('booking-qr/:branch_id')
  @CanView('website', { branch: 'params.branch_id' })
  bookingQr(@Param('branch_id') branchId: string): Promise<BookingQr> {
    return this.qrReader.read(branchId);
  }

  /** P8.WEB.12 — refresh the website by hand: 202 `{ queued_tags }`. */
  @Post('revalidate')
  @HttpCode(202)
  @Can('website.update', { level: 'company' })
  @Audited({ actions: [WEBSITE_REVALIDATE] })
  revalidate(
    @ZBody(revalidateRequestSchema) body: RevalidateRequestBody,
  ): Promise<{ queued_tags: string[] }> {
    return this.refresh.run(body);
  }
}

/** The caller's grants, built once per request by the access guard (design D11). */
function grantsOfRequest() {
  const grants = RequestContext.current()?.grants;
  if (grants === undefined) throw new Error('the access guard set no grants');
  return grants;
}
