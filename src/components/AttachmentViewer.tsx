import { useEffect, useState, useCallback } from 'react';
import { X, Download, FileText, Loader2, ExternalLink } from 'lucide-react';
import { getAttachmentViewUrl, type ViewableAttachment } from '../lib/supabaseUtils';

interface AttachmentViewerProps {
  file: ViewableAttachment | null;
  onClose: () => void;
}

// In-app preview modal for uploaded files (images, PDFs, with a download
// fallback for everything else). Resolves a signed / restored view URL from
// either a Supabase storage path or legacy base64 content.
export function AttachmentViewer({ file, onClose }: AttachmentViewerProps) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [resolved, setResolved] = useState<{ url: string; isObjectUrl: boolean; mimeType: string } | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    let objectUrl: string | null = null;
    setStatus('loading');
    setErrorMsg('');
    setResolved(null);
    getAttachmentViewUrl(file)
      .then(r => {
        if (cancelled) {
          if (r.isObjectUrl) URL.revokeObjectURL(r.url);
          return;
        }
        objectUrl = r.isObjectUrl ? r.url : null;
        setResolved(r);
        setStatus('ready');
      })
      .catch(err => {
        if (cancelled) return;
        setErrorMsg(err instanceof Error ? err.message : 'Unable to load preview.');
        setStatus('error');
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file]);

  useEffect(() => {
    if (!file) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [file, onClose]);

  const handleDownload = useCallback(async () => {
    if (!resolved) return;
    try {
      const response = await fetch(resolved.url);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = file?.name || 'attachment';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch { /* ignore download errors */ }
  }, [resolved, file?.name]);

  if (!file) return null;

  const mime = resolved?.mimeType || file.originalType || file.type || '';
  const isImage = mime.startsWith('image/');
  const isPdf = mime === 'application/pdf';
  const canPreview = status === 'ready' && (isImage || isPdf);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden border border-slate-200 dark:border-slate-700">
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="w-4 h-4 text-slate-400 shrink-0" />
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{file.name || 'Attachment'}</span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {resolved && (
              <a href={resolved.url} target="_blank" rel="noreferrer" className="p-2 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" title="Open in new tab">
                <ExternalLink className="w-4 h-4" />
              </a>
            )}
            <button onClick={handleDownload} disabled={!resolved} className="p-2 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors disabled:opacity-40" title="Download file">
              <Download className="w-4 h-4" />
            </button>
            <button onClick={onClose} className="p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors" title="Close (Esc)">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto bg-slate-100 dark:bg-slate-950/60 flex items-center justify-center p-4">
          {status === 'loading' && (
            <div className="flex flex-col items-center gap-3 text-slate-500 dark:text-slate-400 py-16">
              <Loader2 className="w-8 h-8 animate-spin" />
              <p className="text-sm">Loading preview…</p>
            </div>
          )}
          {status === 'error' && (
            <div className="flex flex-col items-center gap-3 text-center py-16 px-6">
              <FileText className="w-10 h-10 text-slate-300 dark:text-slate-600" />
              <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Preview not available</p>
              <p className="text-xs text-slate-400 max-w-sm">{errorMsg || 'This file could not be loaded for preview.'}</p>
            </div>
          )}
          {canPreview && isImage && (
            <img src={resolved!.url} alt={file.name || 'attachment'} className="max-w-full max-h-[78vh] object-contain rounded-lg shadow-lg" />
          )}
          {canPreview && isPdf && (
            <iframe src={resolved!.url} title={file.name || 'attachment'} className="w-full h-[78vh] bg-white rounded-lg border-0" />
          )}
          {status === 'ready' && !canPreview && (
            <div className="flex flex-col items-center gap-3 text-center py-16 px-6">
              <FileText className="w-10 h-10 text-slate-300 dark:text-slate-600" />
              <p className="text-sm font-medium text-slate-600 dark:text-slate-300">No inline preview for this file type</p>
              <p className="text-xs text-slate-400">{mime || 'Unknown type'}</p>
              <div className="flex items-center gap-2 mt-2 flex-wrap justify-center">
                <a href={resolved!.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-600 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                  <ExternalLink className="w-4 h-4" /> Open in new tab
                </a>
                <button onClick={handleDownload} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-colors">
                  <Download className="w-4 h-4" /> Download
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
