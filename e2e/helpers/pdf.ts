// The text of a PDF as pdf.js reads it — the text items of every page joined by spaces, as
// apps/api/test/document-renderer.int.test.ts reads a rendered receipt back. The legacy build runs in
// Node without a DOM; add-company-profile task 5.3 reads the first words of a receipt with it.
export async function pdfText(pdf: Buffer): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({ data: new Uint8Array(pdf) });
  const doc = await task.promise;
  const pages: string[] = [];
  for (let number = 1; number <= doc.numPages; number += 1) {
    const content = await (await doc.getPage(number)).getTextContent();
    pages.push(content.items.map((item) => ('str' in item ? item.str : '')).join(' '));
  }
  await task.destroy();
  return pages.join(' ');
}
