// "View / share PDF" (AD-POS-13 · AD-RCPT-02 · AD-PWA-02 · add-walkin-visit-checkout task 13.6): the PDF
// fetched as a blob (same origin, session cookie) goes to the Web Share sheet when the device can share
// files, and otherwise opens in a new tab. There is no Print button in this change.

export interface ShareTarget {
  readonly canShare?: (data: { files: File[] }) => boolean;
  readonly share?: (data: { files: File[]; title?: string }) => Promise<void>;
}

export type ShareOutcome = 'shared' | 'opened' | 'cancelled';

export async function shareReceiptPdf(
  pdf: Blob,
  fileName: string,
  target: ShareTarget = navigator,
  open: (url: string) => void = (url) => window.open(url, '_blank', 'noopener'),
): Promise<ShareOutcome> {
  const file = new File([pdf], fileName, { type: 'application/pdf' });
  if (target.share !== undefined && target.canShare?.({ files: [file] }) === true) {
    try {
      await target.share({ files: [file], title: fileName });
      return 'shared';
    } catch (error) {
      // The user closed the share sheet: nothing to report.
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
      throw error;
    }
  }
  open(URL.createObjectURL(file));
  return 'opened';
}
