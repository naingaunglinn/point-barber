import { Inject, Injectable } from '@nestjs/common';
import {
  BYTES_PER_MB,
  ErrorCode,
  UPLOAD_ALLOWED_FORMATS,
  type UploadPurpose,
  detectFileType,
  isZawgyi,
} from '@point/shared';
import type { Logger } from 'pino';

import { Clock } from '../../../common/clock/clock.js';
import { TransactionRunner } from '../../../common/database/transaction-runner.js';
import { ProblemException } from '../../../common/http/problem.exception.js';
import { LOGGER } from '../../../common/logging/logger.js';
import {
  type AttachmentRow,
  AttachmentsRepository,
} from '../repositories/attachments.repository.js';
import { SettingsReader } from '../settings/settings-reader.js';
import { CompanyOfSettings } from '../settings/ports.js';
import { StorageService } from '../storage/storage.service.js';
import { type AttachmentDto, toAttachment } from './attachment-dto.js';
import { Attachments } from './attachments.service.js';
import { ImageNotDecodable, processImage } from './image-pipeline.js';
import { UploaderNames } from './uploader-names.js';
import { objectKey } from './variant-object.js';

// `POST /v1/attachments` (P8.ATT.01 · P8-RULE-03 · ADR-014 decision 3 · add-attachments-upload design D3 /
// D5 / D6). The order of the checks is the spec's: shape (the controller) → Zawgyi file name → size → type
// → decoding; then the objects, then one transaction for the row. No bucket call runs inside the
// transaction (CG-DB-10). A refusal leaves no object and no row.

export interface UploadInput {
  readonly file_name: string;
  readonly bytes: Buffer;
  readonly purpose: UploadPurpose;
  /** `system.upload_max_mb`, read by the controller before the body is read. */
  readonly max_mb: number;
}

const refuse = (code: ErrorCode, status: number, context?: Record<string, unknown>) =>
  new ProblemException(code, status, context === undefined ? {} : { context });

@Injectable()
export class AttachmentUploads {
  constructor(
    private readonly settings: SettingsReader,
    private readonly attachments: Attachments,
    private readonly repository: AttachmentsRepository,
    private readonly runner: TransactionRunner,
    private readonly storage: StorageService,
    private readonly companies: CompanyOfSettings,
    private readonly names: UploaderNames,
    private readonly clock: Clock,
    @Inject(LOGGER) private readonly log: Logger,
  ) {}

  /** The size limit of an upload in megabytes — the setting, a whole number 1 - 10 (API-LIM-03). */
  async maxMb(): Promise<number> {
    return (await this.settings.effective(['system.upload_max_mb']))['system.upload_max_mb'];
  }

  async upload(userId: string, input: UploadInput): Promise<AttachmentDto> {
    const { file_name, bytes, purpose } = input;
    if (isZawgyi(file_name)) {
      throw new ProblemException(ErrorCode.ZAWGYI_TEXT, 400, {
        errors: [{ field: 'file', code: ErrorCode.ZAWGYI_TEXT }],
      });
    }
    if (bytes.length > input.max_mb * BYTES_PER_MB) {
      throw refuse(ErrorCode.FILE_TOO_LARGE, 422, { max_mb: input.max_mb });
    }
    const detected = detectFileType(bytes, purpose);
    const notAllowed = () =>
      refuse(ErrorCode.FILE_TYPE_NOT_ALLOWED, 422, { allowed: UPLOAD_ALLOWED_FORMATS[purpose] });
    if (!detected.ok) throw notAllowed();
    const { type } = detected;

    // An image is decoded and re-encoded (EXIF and GPS dropped, 2,560 px, variants); the rest is kept as received.
    let original = { body: bytes, width: null as number | null, height: null as number | null };
    let variants: readonly { name: 'w400' | 'w800' | 'w1600'; body: Buffer }[] = [];
    if (type.mime.startsWith('image/')) {
      try {
        const image = await processImage(bytes, type);
        original = image.original;
        variants = image.variants;
      } catch (error) {
        if (error instanceof ImageNotDecodable) throw notAllowed();
        throw error;
      }
    }

    const companyId = await this.companies.id();
    if (companyId === null) throw new Error('AttachmentUploads: the company does not exist yet');
    const { id, storage_key } = this.attachments.newGeneratedKey(type.ext);
    const written: string[] = [];
    let row: AttachmentRow;
    try {
      // Remembered before the write: a put that fails here (a timeout) may still have stored the object.
      written.push(storage_key);
      await this.storage.put(storage_key, original.body, type.mime);
      for (const variant of variants) {
        const key = objectKey({ storage_key }, variant.name);
        written.push(key);
        await this.storage.put(key, variant.body, 'image/webp');
      }
      row = await this.runner.run((tx) =>
        this.repository.insertStaging(tx, {
          id,
          company_id: companyId,
          kind: type.kind,
          storage_key,
          file_name,
          mime_type: type.mime,
          size_bytes: original.body.length,
          uploaded_by_user_id: userId,
          uploaded_at: this.clock.now(),
          image_width: original.width,
          image_height: original.height,
        }),
      );
    } catch (error) {
      await this.removeObjects(written);
      throw error;
    }
    // After the commit: a failure here must not remove the objects of a row that exists.
    // The row is stored: a failed name lookup must not turn it into a 500, so the name falls back to empty.
    const uploader = await this.names
      .of([userId])
      .then((names) => names.get(userId) ?? '')
      .catch((error: unknown) => {
        this.log.warn({ err: error }, 'uploader name not read');
        return '';
      });
    return toAttachment(row, uploader);
  }

  /** Best effort: an object that stays is only reported by the weekly integrity check (ADR-014 decision 5). */
  private async removeObjects(keys: readonly string[]): Promise<void> {
    const results = await Promise.allSettled(keys.map((key) => this.storage.delete(key)));
    const failed = results.filter((result) => result.status === 'rejected').length;
    if (failed > 0) this.log.warn({ objects: failed }, 'attachment objects were not removed');
  }
}
