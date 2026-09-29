# COR / BIR Form 2303 Client Import

## What changed

- Added a **Upload COR / 2303** button to the **Add New Client** form in `src/components/Extras.tsx`.
- Accepts PDFs and image uploads (`image/*`, including common JPG/PNG/WEBP/BMP/GIF/TIFF/HEIC/HEIF extensions).
- Extracts text locally in the browser:
  - Selectable-text PDF -> PDF text extraction.
  - Scanned PDF -> renders pages and uses Tesseract OCR.
  - Image -> Tesseract OCR.
- Maps detected COR / 2303 values into the client form for review:
  - TIN + branch code
  - Taxpayer classification
  - Registered name
  - Taxpayer name (last / first / middle when explicitly labeled)
  - Trade / business name
  - Registered/business address
  - Barangay
  - City/province
  - ZIP code
  - RDO code
  - Contact number
  - Email address
- Preserves the uploaded COR / 2303 in Supabase Storage under the client's `BIR Registration` folder after the client is saved.

## Main implementation file

`src/lib/birCorParser.ts`

The parser is intentionally local and rule-based so the uploaded tax document is not sent to an external AI service. The fields remain editable after extraction so OCR mistakes can be corrected before saving.

## Validation performed

- `src/lib/birCorParser.ts` passes a targeted TypeScript check with module stubs.
- Both changed TypeScript/TSX files pass the TypeScript parser syntax check.
- Pure text parsing was exercised with representative 2303-style samples, including 9-digit TIN + separate branch code, registered/business names, address, RDO, email, contact number, and individual taxpayer name fields.
- Full application build could not be executed because the uploaded workspace does not contain `node_modules` and npm dependency installation timed out in the execution environment. No application dependency was added; `tesseract.js` was already present in `package.json`.
