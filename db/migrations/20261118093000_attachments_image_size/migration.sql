-- add-attachments-upload task 1.9 — DB Part 8 v1.2 (owner AT8 = A, 16/Nov/2026): the pixel size of an
-- image file is stored on its attachments row. Additive: two nullable columns with no default and one
-- CHECK; no existing column, row or constraint changes, nothing is backfilled (generated receipt files
-- keep both sizes NULL). Hand-written; the CHECK is copied from
-- point-sdd docs/db/part8-system-website-v1-constraints.sql (v1.2). Rollback = drop the two columns.

ALTER TABLE "attachments" ADD COLUMN "image_width" integer, ADD COLUMN "image_height" integer;

COMMENT ON COLUMN "attachments"."image_width" IS 'v1.2 (AT8 = A) - pixel width of an image file (mime_type image/...), whatever its kind; NULL for a file that is not an image; set together with image_height (both > 0 - CHECK attachments_image_size_chk)';

COMMENT ON COLUMN "attachments"."image_height" IS 'v1.2 (AT8 = A) - pixel height; set together with image_width, or NULL';

ALTER TABLE attachments ADD CONSTRAINT attachments_image_size_chk CHECK ((image_width IS NULL) = (image_height IS NULL) AND (image_width IS NULL OR (image_width > 0 AND image_height > 0 AND mime_type LIKE 'image/%')));
