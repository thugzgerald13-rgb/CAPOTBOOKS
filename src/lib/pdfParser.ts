import { PDFDocument } from 'pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

export interface ParsedPdf {
  pageCount: number;
  text: string;
}

/**
 * Extract text from a PDF in the browser.
 * pdf-lib validates/loads the document while PDF.js extracts selectable text.
 * The PDF bytes stay client-side; nothing is uploaded by this helper.
 */
export async function parsePdf(file: Blob | ArrayBuffer): Promise<ParsedPdf> {
  const data = file instanceof ArrayBuffer ? file : await file.arrayBuffer();

  // Load with pdf-lib so the application can work with the PDF document model
  // in addition to PDF.js text extraction.
  const document = await PDFDocument.load(data, { ignoreEncryption: true });
  const pageCount = document.getPageCount();

  const pdf = await getDocument({ data: new Uint8Array(data) }).promise;
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
      pageCount,
      text: pages.join('\n\n'),
    };
  } finally {
    await pdf.destroy();
  }
}

