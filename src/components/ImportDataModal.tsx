import React, { useState } from 'react';
import { parseImportedFile, ImportResult } from '../utils/fileParser';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onImportSuccess: (result: ImportResult) => void;
  pageType: 'balance-sheet' | 'profit-loss';
}

export const ImportDataModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onImportSuccess,
  pageType,
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [targetYear, setTargetYear] = useState(new Date().getFullYear());
  const [isImporting, setIsImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  if (!isOpen) return null;

  const handleImport = async () => {
    if (!selectedFile) return;
    setIsImporting(true);
    setResult(null);

    const importResult = await parseImportedFile(selectedFile, targetYear);
    setResult(importResult);

    if (importResult.success) {
      onImportSuccess(importResult);
      setTimeout(() => {
        setSelectedFile(null);
        setResult(null);
      }, 2500);
    }

    setIsImporting(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <h3 className="text-lg font-bold mb-4">
          Import {pageType === 'balance-sheet' ? 'Balance Sheet' : 'Profit & Loss'} Data
        </h3>

        <div className="mb-4">
          <label className="block text-sm font-medium mb-1">Target Year</label>
          <input
            type="number"
            value={targetYear}
            onChange={(e) => setTargetYear(parseInt(e.target.value) || new Date().getFullYear())}
            className="w-full border rounded px-3 py-2"
            min="2000"
            max="2100"
          />
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium mb-1">Select File</label>
          <p className="text-xs text-gray-500 mb-2">
            Supports .xlsx, .xls, .csv, .tsv, .txt — your original columns and format are preserved.
          </p>
          <input
            type="file"
            accept=".xlsx,.xls,.csv,.tsv,.txt"
            onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
            className="w-full"
          />
        </div>

        {selectedFile && (
          <p className="text-sm text-green-600 mb-3">
            ✓ Selected: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
          </p>
        )}

        {result && (
          <div className={`mb-4 p-3 rounded ${result.success ? 'bg-green-50' : 'bg-red-50'}`}>
            <p className={`font-medium ${result.success ? 'text-green-700' : 'text-red-700'}`}>
              {result.success ? '✅ ' : '❌ '}{result.message}
            </p>
            {result.warnings?.length && (
              <ul className="text-xs text-amber-600 mt-1 list-disc list-inside">
                {result.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            )}
          </div>
        )}

        <div className="flex gap-3 justify-end">
          <button onClick={onClose} className="px-4 py-2 border rounded hover:bg-gray-50">
            Close
          </button>
          <button
            onClick={handleImport}
            disabled={!selectedFile || isImporting}
            className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
          >
            {isImporting ? 'Importing...' : 'Import Data'}
          </button>
        </div>
      </div>
    </div>
  );
};
