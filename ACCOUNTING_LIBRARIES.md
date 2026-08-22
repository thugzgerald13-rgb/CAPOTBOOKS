# Accounting Webapp Library Stack

The CAPOT frontend is a React/Vite accounting application. The following libraries were added to support production accounting workflows without duplicating capabilities already present in the project.

## Added runtime libraries

- `decimal.js` — exact decimal arithmetic for money, taxes, withholding, depreciation, and journal calculations. Avoids JavaScript floating-point errors in financial calculations.
- `date-fns` — reliable fiscal-period, due-date, aging, reporting-period, and date-range handling.
- `zod` — runtime validation for accounting transactions, imported files, forms, API payloads, and configuration.
- `react-hook-form` + `@hookform/resolvers` — scalable validation-heavy forms for invoices, vendors, customers, journals, tax forms, and settings.
- `@tanstack/react-query` — server-state caching, retries, invalidation, and synchronization for Supabase-backed accounting data.
- `dexie` — IndexedDB abstraction for offline drafts, import queues, temporary documents, and resilient client-side caching.
- `tesseract.js` — browser-side OCR for scanned invoices/receipts when text extraction is unavailable.
- `recharts` — accounting dashboards, financial trends, aging, cash-flow, and KPI visualizations.
- `jspdf` — client-side generation of printable/exportable accounting documents and reports.
- `file-saver` — reliable browser downloads for generated reports and exported files.
- `papaparse` — robust CSV import/export for chart of accounts, customers, vendors, transactions, and bank data.

## Existing libraries retained

The project already includes `pdf-lib`, `pdfjs-dist`, `xlsx`, Supabase, Gemini, React Router, Lucide, Motion, and browser image compression. These cover PDF manipulation/text extraction, spreadsheet files, persistence/authentication, AI integration, routing, icons/animation, and image preprocessing respectively.

## Important architecture note

Python libraries such as PaddleOCR, Tesseract, spaCy, Transformers, scikit-learn, XGBoost, LightGBM, PyTorch, TensorFlow, Prophet, statsmodels, NeuralProphet, LangChain, LlamaIndex, beancount, ledger, and hledger should **not** be placed in this browser application's npm dependencies. They require a server/worker or Python environment. They should be introduced as a separate backend/worker only when the corresponding OCR, ML, forecasting, LLM orchestration, or accounting-engine features are implemented.
