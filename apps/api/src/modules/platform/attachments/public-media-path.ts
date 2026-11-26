import type { AttachmentVariant } from './variant-object.js';

// The stable address of a website image (P8-RULE-04 · research E9 · add-attachments-upload design D1):
// other changes store `publicMediaPath(id)` in `logo_url`, `photo_url` and `image_url`, never a signed
// link, and a client takes another size by swapping the last segment (`original` → `w400`).

/** `/api/v1/public/media/<attachment_id>/<variant>`. */
export function publicMediaPath(
  attachmentId: string,
  variant: AttachmentVariant = 'original',
): string {
  return `/api/v1/public/media/${attachmentId}/${variant}`;
}

/** The same address with the site's origin in front — for an Open Graph image. */
export function publicMediaUrl(
  siteOrigin: string,
  attachmentId: string,
  variant: AttachmentVariant = 'original',
): string {
  return `${siteOrigin}${publicMediaPath(attachmentId, variant)}`;
}
