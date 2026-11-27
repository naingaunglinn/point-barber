import { Injectable } from '@nestjs/common';
import { ErrorCode, type SharePreview, type SharePreviewQuery, siteMetadata } from '@point/shared';

import { ProblemException } from '../../../common/http/problem.exception.js';
import { SiteContentReader } from './site-content-reader.js';
import { WebsiteDirectory } from './website-ports.js';

// P8.WEB.10 — what a link-preview crawler gets for `/` or `/branches/<code>` in a language (AD-WEB-04 ·
// FE-SEO-01 / 02 / 04 · design D10): `siteMetadata()` of packages/shared — the function the public pages
// call — derives the answer. An unknown, INACTIVE or non-public branch is a 404. The share image comes
// with part A6, so `image` is null until then.
const BRANCH_PATH = '/branches/';

@Injectable()
export class SharePreviewReader {
  constructor(
    private readonly content: SiteContentReader,
    private readonly directory: WebsiteDirectory,
  ) {}

  async read(query: SharePreviewQuery): Promise<SharePreview> {
    const [content, company] = await Promise.all([this.content.read(), this.directory.company()]);
    let branch;
    if (query.path.startsWith(BRANCH_PATH)) {
      const code = query.path.slice(BRANCH_PATH.length);
      branch = (await this.directory.branchesForWebsite()).find((row) => row.code === code);
      if (branch?.is_public !== true) throw new ProblemException(ErrorCode.NOT_FOUND, 404);
    }
    const metadata = siteMetadata({
      siteOrigin: content.site_origin,
      locale: query.locale,
      path: query.path,
      company,
      content: { seo_title: content.seo_title, seo_description: content.seo_description },
      shareImage: null,
      ...(branch === undefined ? {} : { branch }),
    });
    return {
      url: metadata.url,
      locale: query.locale,
      title: metadata.title,
      description: metadata.description,
      image: metadata.image,
      site_name: metadata.siteName,
      warnings: [...metadata.warnings],
    };
  }
}
