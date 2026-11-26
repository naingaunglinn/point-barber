import { Controller, Get, Header, Param, Post, Query, Req, Res } from '@nestjs/common';
import {
  ErrorCode,
  attachmentListQuerySchema,
  attachmentUploadSchema,
  urlQuerySchema,
} from '@point/shared';
import type { Request, Response } from 'express';
import type { z } from 'zod';

import { Staff } from '../../../common/access/declarations.js';
import { ProblemException } from '../../../common/http/problem.exception.js';
import { RequestContext } from '../../../common/http/request-context.js';
import { ZQuery, ZodValidationPipe } from '../../../common/http/zod-validation.pipe.js';
import { type AttachmentDto } from './attachment-dto.js';
import { AttachmentReads, type SignedUrl } from './attachment-reads.js';
import { AttachmentUploads } from './attachment-uploads.js';
import { readUpload } from './multipart.js';

// The staff endpoints of the attachments module (P8.ATT.01 - 04 · API-PERM-02 · add-attachments-upload
// design D2): every one is `@Staff()` — "any staff" in Part 8 — and the policy table (D8) decides inside
// `AttachmentReads` because the right depends on the row.

const upload = new ZodValidationPipe(attachmentUploadSchema);

function caller(): { user_id: string } {
  const user_id = RequestContext.current()?.user_id;
  if (user_id === undefined) throw new ProblemException(ErrorCode.UNAUTHENTICATED, 401);
  return { user_id };
}

@Controller('v1')
export class AttachmentsController {
  constructor(
    private readonly uploads: AttachmentUploads,
    private readonly reads: AttachmentReads,
  ) {}

  /** P8.ATT.01 — 201 with the staging row; the body is `multipart/form-data` (`file`, `purpose`). */
  @Post('attachments')
  @Staff()
  async create(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AttachmentDto> {
    const { user_id } = caller();
    const max_mb = await this.uploads.maxMb();
    const form = await readUpload(req, res, max_mb);
    const shape = upload.transform({ file: form.file?.name, purpose: form.purpose });
    // The schema refuses a missing file part, so `file` is there.
    if (form.file === undefined)
      throw new ProblemException(ErrorCode.VALIDATION, 400, { errors: [] });
    return this.uploads.upload(user_id, {
      file_name: form.file.name,
      bytes: form.file.bytes,
      purpose: shape.purpose,
      max_mb,
    });
  }

  /** P8.ATT.02 — the files of one entity the caller may read; no URL. */
  @Get('attachments')
  @Staff()
  list(
    @ZQuery(attachmentListQuerySchema) query: z.infer<typeof attachmentListQuerySchema>,
  ): Promise<{ items: AttachmentDto[] }> {
    return this.reads.list(caller(), query);
  }

  /** P8.ATT.03 — the metadata of one file; the same 404 for another's, a removed and an unknown id. */
  @Get('attachments/:id')
  @Staff()
  read(@Param('id') id: string): Promise<AttachmentDto> {
    return this.reads.get(caller(), id);
  }

  /** P8.ATT.04 — a link that lives 5 minutes, made for this request. */
  @Get('attachments/:id/url')
  @Staff()
  // The answer is a live link: no shared cache may keep it for its five minutes (CG-SEC-10).
  @Header('Cache-Control', 'no-store')
  url(
    @Param('id') id: string,
    @ZQuery(urlQuerySchema) query: z.infer<typeof urlQuerySchema>,
  ): Promise<SignedUrl> {
    return this.reads.url(caller(), id, query);
  }
}
