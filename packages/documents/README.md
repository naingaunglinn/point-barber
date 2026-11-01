# @point/documents

Document templates rendered by the API's `DocumentRenderer` (ADR-013): receipts first, payslips later.

- `fonts/` — Pyidaungsu Regular / Bold and Inter (D-UX-02) with their licence files, copied from
  `packages/ui/fonts` (built there by `build-subsets.sh`). `pnpm fonts:check` checks both folders.
- `fontFaceCss()` — the faces inlined as data URIs: the renderer blocks every network request.
- `PRINTER_WIDTH_PX` — 58 mm paper → 384 px, 80 mm → 576 px (203 dpi); `receiptBaseCss(paper)` lays a
  receipt out at those pixels with 22 px body text (AD-RCPT-02).

The receipt and refund-receipt templates come with `add-walkin-visit-checkout` tasks 9.2 / 9.3. The API
image gets the built package and its `fonts/` through `pnpm deploy` (the `files` field).
