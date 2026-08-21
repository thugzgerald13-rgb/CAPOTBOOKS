import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

export interface ParsedPdf {
  pageCount: number;
  text: string;
}

/**
 * Extract text from a PDF in the browser.
 * The PDF bytes stay client-side; nothing is uploaded by this helper.
 */
export async function parsePdf(file: Blob | ArrayBuffer): Promise<ParsedPdf> {
  const data = file instanceof ArrayBuffer ? file : await file.arrayBuffer();
  const pdf = await getDocument({ data, disableWorker: true }).promise;
  const pages: string[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item) => ('str' in item ? item.str : ''))
        .filter(Boolean)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();

      if (pageText) pages.push(pageText);
      page.cleanup();
    }

    return {
      pageCount: pdf.numPages,
      text: pages.join('\n\n'),
    };
  } finally {
    await pdf.destroy();
  }
}
