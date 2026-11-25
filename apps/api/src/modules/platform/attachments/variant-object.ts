import { ATTACHMENT_VARIANTS, VARIANT_WIDTHS } from '@point/shared';

// Which object answers a variant of a stored file (ADR-014 decision 2 · AT3 · add-attachments-upload
// design D1 / D6). One rule, used by `Attachments.variantObject`, the signed-link endpoint and the public
// media path: a variant that was made is `<folder>/<variant>.webp`; a variant that was not made (wider
// than the stored original) and every non-image answer with the original object.

export type AttachmentVariant = (typeof ATTACHMENT_VARIANTS)[number];

/** The members of an `attachments` row the rule reads. `image_width` is NULL for every non-image. */
export interface VariantSource {
  readonly storage_key: string;
  readonly mime_type: string;
  readonly image_width: number | null;
}

export const VARIANT_MIME = 'image/webp';

/** The key of a variant object: the row's own key for `original`, else `<folder>/<variant>.webp`. */
export function objectKey(
  row: Pick<VariantSource, 'storage_key'>,
  variant: AttachmentVariant,
): string {
  if (variant === 'original') return row.storage_key;
  return `${row.storage_key.slice(0, row.storage_key.lastIndexOf('/'))}/${variant}.webp`;
}

/** `"original"` then the widths of `VARIANT_WIDTHS` that are not wider than the stored original. */
export function variantsOf(imageWidth: number | null): AttachmentVariant[] {
  if (imageWidth === null) return [];
  return [
    'original',
    ...VARIANT_WIDTHS.filter((width) => width <= imageWidth).map((w) => `w${w}` as const),
  ];
}

/** The object and content type that answer `variant` for this row. Checks no read right. */
export function variantObject(
  row: VariantSource,
  variant: AttachmentVariant,
): { key: string; mime: string } {
  if (variant !== 'original' && variantsOf(row.image_width).includes(variant)) {
    return { key: objectKey(row, variant), mime: VARIANT_MIME };
  }
  return { key: row.storage_key, mime: row.mime_type };
}
