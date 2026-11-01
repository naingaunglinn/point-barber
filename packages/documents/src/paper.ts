// Thermal receipt paper (ADR-013 decision 3 · AD-RCPT-02): 203 dpi = 8 dots per mm; the printable width
// is 48 mm on 58 mm paper = 384 dots and 72 mm on 80 mm paper = 576 dots. A receipt is laid out at the
// dots of its printer, so the PNG prints one CSS pixel per dot and the PDF shows the same layout scaled
// to the paper width (the branch setting `receipt.printer_width_mm`, default 58).
export const PRINTER_WIDTH_PX = { 58: 384, 80: 576 } as const;
export type PaperWidthMm = keyof typeof PRINTER_WIDTH_PX;
