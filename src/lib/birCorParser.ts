import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import pdfjsWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import { createWorker } from 'tesseract.js';
import { RDO_CODES } from './utils';

GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

export interface BirCorClientFields {
  tin?: string;
  taxpayerClassification?: 'Individual' | 'Non-Individual';
  registeredName?: string;
  lastName?: string;
  firstName?: string;
  middleName?: string;
  tradeName?: string;
  substreet?: string;
  street?: string;
  barangay?: string;
  district?: string;
  city?: string;
  zipCode?: string;
  rdoCode?: string;
  phone?: string;
  email?: string;
  name?: string;
}

export interface BirCorExtractionResult {
  text: string;
  fields: BirCorClientFields;
  source: 'pdf-text' | 'ocr';
  pageCount?: number;
}

export type BirCorProgress = (message: string) => void;

const KNOWN_LABELS = [
  'TIN',
  'BRANCH CODE',
  'REGISTERED NAME',
  'TAXPAYER NAME',
  'TRADE NAME',
  'BUSINESS NAME',
  'REGISTERED ADDRESS',
  'BUSINESS ADDRESS',
  'PRINCIPAL ADDRESS',
  'ADDRESS',
  'RDO CODE',
  'RDO NO',
  'REVENUE DISTRICT OFFICE',
  'TELEPHONE',
  'TELEPHONE NUMBER',
  'CONTACT NUMBER',
  'MOBILE NUMBER',
  'MOBILE',
  'EMAIL',
  'E-MAIL',
  'ZIP CODE',
  'LAST NAME',
  'FIRST NAME',
  'MIDDLE NAME',
  'TAXPAYER TYPE',
  'TYPE OF TAXPAYER',
  'CLASSIFICATION',
];

function tidyText(text: string): string {
  return text
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function cleanValue(value: string): string {
  return value
    .replace(/^[:#\-–—\s]+/, '')
    .replace(/\s+/g, ' ')
    .replace(/[|]+/g, ' ')
    .trim();
}

function looksLikeLabel(text: string): boolean {
  const upper = text.toUpperCase().replace(/[^A-Z0-9 -]/g, ' ').replace(/\s+/g, ' ').trim();
  return KNOWN_LABELS.some((label) => upper === label || upper.startsWith(`${label} `));
}

function extractLabeledValue(text: string, labels: string[]): string | undefined {
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  const labelPattern = labels.join('|');
  const sameLine = new RegExp(`(?:^|\\b)(?:${labelPattern})\\s*(?::|#|-)?\\s*(.+)$`, 'i');

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const match = line.match(sameLine);
    if (match?.[1]) {
      const value = cleanValue(match[1]);
      if (value && !looksLikeLabel(value)) return stripTrailingKnownLabel(value);
    }

    const labelOnly = new RegExp(`^(?:${labelPattern})\\s*(?::|#|-)?\\s*$`, 'i');
    if (labelOnly.test(line)) {
      for (let j = i + 1; j < Math.min(i + 4, lines.length); j += 1) {
        const next = cleanValue(lines[j]);
        if (!next) continue;
        if (looksLikeLabel(next)) break;
        return stripTrailingKnownLabel(next);
      }
    }
  }

  const flattened = text.replace(/\n+/g, ' ');
  const fallback = new RegExp(`(?:${labelPattern})\\s*(?::|#|-)?\\s*([^;|]+?)(?=\\s+(?:${labelPattern})\\b|$)`, 'i').exec(flattened);
  return fallback?.[1] ? stripTrailingKnownLabel(cleanValue(fallback[1])) : undefined;
}

function stripTrailingKnownLabel(value: string): string {
  const matches: number[] = [];
  const upper = value.toUpperCase();
  for (const label of KNOWN_LABELS) {
    const idx = upper.indexOf(` ${label} `);
    if (idx > 0) matches.push(idx);
  }
  if (matches.length) return value.slice(0, Math.min(...matches)).trim();
  return value;
}

function extractTin(text: string): string | undefined {
  const branchCode = extractLabeledValue(text, ['BRANCH CODE'])?.replace(/\D/g, '').slice(0, 3);
  const patterns = [
    /\b(\d{3})\s*[-–—\s]\s*(\d{3})\s*[-–—\s]\s*(\d{3})(?:\s*[-–—\s]\s*(\d{3}))?\b/,
    /\b(\d{9})(\d{3})?\b/,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (!match) continue;
    let digits = `${match[1]}${match[2] || ''}${match[3] || ''}${match[4] || ''}`.replace(/\D/g, '');
    if (digits.length === 9 && branchCode) digits += branchCode;
    if (digits.length !== 9 && digits.length !== 12) continue;
    return digits.length === 12
      ? `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 9)}-${digits.slice(9, 12)}`
      : `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 9)}`;
  }

  const labeled = extractLabeledValue(text, ['TIN']);
  if (labeled) {
    let digits = labeled.replace(/\D/g, '');
    if (digits.length === 9 && branchCode) digits += branchCode;
    if (digits.length === 9 || digits.length === 12) {
      return digits.length === 12
        ? `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 9)}-${digits.slice(9, 12)}`
        : `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 9)}`;
    }
  }

  return undefined;
}

function extractRdoCode(text: string): string | undefined {
  const known = RDO_CODES
    .map((item) => item.split(' - ')[0].trim())
    .sort((a, b) => b.length - a.length);
  const knownPattern = known.map((code) => code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const labeled = new RegExp(`(?:RDO\\s*(?:CODE|NO\\.?)?|REVENUE\\s+DISTRICT\\s+OFFICE)\\s*(?::|#|-)?\\s*(${knownPattern})\\b`, 'i').exec(text);
  if (labeled?.[1]) return labeled[1].toUpperCase();

  const looseLabeled = /(?:RDO\\s*(?:CODE|NO\\.?)?|REVENUE\\s+DISTRICT\\s+OFFICE)\\s*(?::|#|-)?\\s*([0-9]{3}[A-Z]?)/i.exec(text);
  if (looseLabeled?.[1]) return looseLabeled[1].toUpperCase();

  return undefined;
}

function extractClassification(text: string): 'Individual' | 'Non-Individual' | undefined {
  if (/non[\s-]?individual|corporation|incorporated|partnership|co-?ownership|estate|trust|association|cooperative|non[-\s]?stock/i.test(text)) {
    return 'Non-Individual';
  }
  if (/\bindividual\b|sole\s+proprietor|sole[-\s]?prop/i.test(text)) {
    return 'Individual';
  }
  return undefined;
}

function extractAddressBlock(text: string): string | undefined {
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  const labels = ['REGISTERED ADDRESS', 'BUSINESS ADDRESS', 'PRINCIPAL ADDRESS'];
  const labelPattern = new RegExp(`^(?:${labels.join('|')})\\s*(?::|#|-)?\\s*(.*)$`, 'i');

  for (let i = 0; i < lines.length; i += 1) {
    const match = labelPattern.exec(lines[i]);
    if (!match) continue;
    const parts: string[] = [];
    if (match[1]) parts.push(cleanValue(match[1]));
    for (let j = i + 1; j < Math.min(i + 5, lines.length); j += 1) {
      if (looksLikeLabel(lines[j])) break;
      if (lines[j]) parts.push(cleanValue(lines[j]));
    }
    const block = cleanValue(parts.join(', '));
    if (block) return block;
  }

  return extractLabeledValue(text, ['ADDRESS']);
}

function parseAddressParts(address: string): Partial<BirCorClientFields> {
  const normalized = address
    .replace(/\s+,/g, ',')
    .replace(/,\s+/g, ', ')
    .trim();

  const result: Partial<BirCorClientFields> = {};

  const zip = normalized.match(/\b(\d{4})\b(?:\s*$|[^\d])/);
  if (zip?.[1]) result.zipCode = zip[1];

  const barangay = normalized.match(/\b(?:barangay|brgy\.?|brgy)\s*[:.-]?\s*([^,;]+?)(?=,|;|\s+city\b|\s+municipality\b|\s+province\b|$)/i);
  if (barangay?.[1]) result.barangay = cleanValue(barangay[1]);

  const municipality = normalized.match(/\b(?:municipality|mun\.?|district)\s*(?:of)?\s*[:.-]?\s*([^,;]+?)(?=,|;|\s+province\b|\s+\d{4}\b|$)/i);
  if (municipality?.[1]) result.district = cleanValue(municipality[1]);

  const city = normalized.match(/\b([A-Za-z .'-]+?\s+City)\b/i);
  if (city?.[1]) {
    const parts = normalized.split(',').map((part) => cleanValue(part)).filter(Boolean);
    const cityIndex = parts.findIndex((part) => new RegExp(`\\b${escapeRegExp(city[1])}\\b`, 'i').test(part));
    const provincePart = cityIndex >= 0 ? parts[cityIndex + 1]?.replace(/\b\d{4}\b/g, '').trim() : undefined;
    result.city = cleanValue([city[1], provincePart && !/^\d{4}$/.test(provincePart) ? provincePart : ''].filter(Boolean).join(', '));
  }

  if (!result.city) {
    const cityOrProvinceTail = normalized.split(',').map((part) => cleanValue(part)).filter(Boolean);
    const plausible = cityOrProvinceTail.find((part) => /province|city|municipality/i.test(part));
    if (plausible) result.city = plausible.replace(/\bprovince\b/i, '').trim();
  }

  let street = normalized;
  if (result.zipCode) street = street.replace(new RegExp(`\\b${result.zipCode}\\b`), '').trim();
  if (result.barangay) street = street.replace(new RegExp(`\\b(?:barangay|brgy\\.?)\\s*[:.-]?\\s*${escapeRegExp(result.barangay)}\\b`, 'i'), '').trim();
  if (result.city) street = street.replace(new RegExp(`\\b${escapeRegExp(result.city)}\\b`, 'i'), '').trim();
  street = street.replace(/\s*,\s*,+/g, ',').replace(/^,\s*|\s*,$/g, '').trim();
  if (street) result.street = street;

  return result;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractFields(rawText: string): BirCorClientFields {
  const text = tidyText(rawText);
  const registeredName = extractLabeledValue(text, ['REGISTERED NAME']);
  const tradeName = extractLabeledValue(text, ['TRADE NAME', 'BUSINESS NAME']);
  const lastName = extractLabeledValue(text, ['LAST NAME']);
  const firstName = extractLabeledValue(text, ['FIRST NAME']);
  const middleName = extractLabeledValue(text, ['MIDDLE NAME']);
  const taxpayerName = extractLabeledValue(text, ['TAXPAYER NAME']);
  const address = extractAddressBlock(text);
  const addressParts = address ? parseAddressParts(address) : {};
  const phone = extractLabeledValue(text, ['CONTACT NUMBER', 'TELEPHONE NUMBER', 'TELEPHONE', 'MOBILE NUMBER', 'MOBILE']);
  const email = extractLabeledValue(text, ['EMAIL', 'E-MAIL']);
  const rdoCode = extractRdoCode(text);
  const taxpayerClassification = extractClassification(text);
  const tin = extractTin(text);

  const personName = [lastName, firstName, middleName].filter(Boolean).join(', ').trim();
  const primaryName = registeredName || tradeName || personName || taxpayerName;

  return {
    tin,
    taxpayerClassification,
    registeredName,
    lastName,
    firstName,
    middleName,
    tradeName,
    ...addressParts,
    rdoCode,
    phone,
    email,
    name: primaryName,
  };
}

export function parseBirCorText(text: string): BirCorClientFields {
  return extractFields(text);
}

async function ocrImage(fileOrCanvas: Blob | HTMLCanvasElement, onProgress?: BirCorProgress): Promise<string> {
  const worker = await createWorker('eng', undefined, {
    logger: (message) => {
      if (message.status === 'recognizing text' && typeof message.progress === 'number') {
        onProgress?.(`Reading document… ${Math.round(message.progress * 100)}%`);
      }
    },
  });

  try {
    const result = await worker.recognize(fileOrCanvas);
    return result.data.text || '';
  } finally {
    await worker.terminate();
  }
}

async function renderPdfForOcr(file: Blob, onProgress?: BirCorProgress): Promise<string> {
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await getDocument({ data }).promise;
  const pageTexts: string[] = [];
  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      onProgress?.(`Reading scanned PDF page ${pageNumber} of ${pdf.numPages}…`);
      const page = await pdf.getPage(pageNumber);
      const initialScale = 2;
      const initialViewport = page.getViewport({ scale: initialScale });
      const scale = initialViewport.width > 2200 ? initialScale * (2200 / initialViewport.width) : initialScale;
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.ceil(viewport.width));
      canvas.height = Math.max(1, Math.ceil(viewport.height));
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) throw new Error('Unable to prepare the PDF page for OCR.');
      await page.render({ canvasContext: context, viewport }).promise;
      pageTexts.push(await ocrImage(canvas, onProgress));
      page.cleanup();
    }
    return pageTexts.join('\n\n');
  } finally {
    await pdf.destroy();
  }
}

/**
 * Extract client-profile fields from a Philippine BIR Certificate of Registration
 * (COR / BIR Form 2303). Text PDFs are parsed locally first; scanned PDFs fall
 * back to browser OCR, as do image uploads.
 */
export async function parseBirCorDocument(file: File, onProgress?: BirCorProgress): Promise<BirCorExtractionResult> {
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
    onProgress?.('Reading PDF text…');
    try {
      const data = new Uint8Array(await file.arrayBuffer());
      const pdf = await getDocument({ data }).promise;
      const pageCount = pdf.numPages;
      const selectablePages: string[] = [];
      try {
        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          const page = await pdf.getPage(pageNumber);
          const content = await page.getTextContent();
          selectablePages.push(content.items.map((item: any) => ('str' in item ? item.str : '')).filter(Boolean).join(' '));
          page.cleanup();
        }
      } finally {
        await pdf.destroy();
      }

      const selectableText = tidyText(selectablePages.join('\n\n'));
      if (selectableText.length >= 40) {
        return { text: selectableText, fields: extractFields(selectableText), source: 'pdf-text', pageCount };
      }

      onProgress?.('PDF has no usable text; switching to OCR…');
      const ocrText = tidyText(await renderPdfForOcr(file, onProgress));
      return { text: ocrText, fields: extractFields(ocrText), source: 'ocr', pageCount };
    } catch (error) {
      onProgress?.('PDF text extraction failed; switching to OCR…');
      const ocrText = tidyText(await renderPdfForOcr(file, onProgress));
      if (!ocrText) throw error;
      return { text: ocrText, fields: extractFields(ocrText), source: 'ocr' };
    }
  }

  if (file.type.startsWith('image/') || /\.(jpe?g|png|gif|webp|bmp|tiff?|heic|heif)$/i.test(file.name)) {
    onProgress?.('Preparing image for OCR…');
    const text = tidyText(await ocrImage(file, onProgress));
    return { text, fields: extractFields(text), source: 'ocr' };
  }

  throw new Error('Unsupported file type. Please upload a PDF or an image of the BIR COR / 2303.');
}
