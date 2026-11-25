import { Controller, Post, Req, Res } from '@nestjs/common';
import { ErrorCode, attachmentUploadSchema } from '@point/shared';
import type { Request, Response } from 'express';

import { Staff } from '../../../common/access/declarations.js';
import { ProblemException } from '../../../common/http/problem.exception.js';
import { RequestContext } from '../../../common/http/request-context.js';
import { ZodValidationPipe } from '../../../common/http/zod-validation.pipe.js';
import { type AttachmentDto } from './attachment-dto.js';
import { AttachmentUploads } from './attachment-uploads.js';
import { readUpload } from './multipart.js';

// The staff endpoints of the attachments module (P8.ATT.01 · API-PERM-02 · add-attachments-upload design
// D2): every one is `@Staff()` — "any staff" in Part 8.

const upload = new ZodValidationPipe(attachmentUploadSchema);

function caller(): { user_id: string } {
  const user_id = RequestContext.current()?.user_id;
  if (user_id === undefined) throw new ProblemException(ErrorCode.UNAUTHENTICATED, 401);
  return { user_id };
}

@Controller('v1')
export class AttachmentsController {
  constructor(private readonly uploads: AttachmentUploads) {}

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
}
