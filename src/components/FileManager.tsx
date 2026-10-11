import React, { useState, useRef, useEffect, useCallback } from 'react';
import { PageHeader } from './ui/PageHeader';
import { useAccounting } from '../context/AccountingContext';
import { usePermission } from '../lib/teamPermissions';
import { AppFolder, AppFile } from '../types';
import { parsePdf } from '../lib/pdfParser';
import { parseBankStatement, type BankTxn } from '../lib/bankImport';
import { loadReconcileRules, saveReconcileRules, matchTransaction, DEFAULT_RECONCILE_RULES, type ReconcileRule } from '../lib/reconcileRules';
import { supabase } from '../lib/supabase';
import { downloadWithCache, evictCachedFile } from '../db/storageCache';
import imageCompression from 'browser-image-compression';
import { 
  Folder, FolderOpen, Upload, Trash2, Edit2, 
  Check, X, FileText, Download, Plus, File, AlertTriangle, Eye, Camera 
} from 'lucide-react';
import { AttachmentViewer } from './AttachmentViewer';

export interface StagedFile {
  id: string;
  name: string;
  originalName: string;
  type: string;
  size: number;
  content: string; // base64 representation
  description: string;
}

export function FileManager() {
  const canDelete = usePermission('delete_transactions');

  const { currentClient, saveFolder, deleteFolder, saveFile, deleteFile, showToast } = useAccounting();
  const [selectedFolderId, setSelectedFolderId] = useState<string>('folder_revenue');
  const [newFolderName, setNewFolderName] = useState('');
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [viewingFile, setViewingFile] = useState<AppFile | null>(null);
  // ---- Camera capture (header Take Photo button) ----
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraBusy, setCameraBusy] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopCameraStream = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }, []);

  // Attach the live stream to the <video> element once the modal mounts.
  useEffect(() => {
    if (cameraOpen && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
    return () => {
      if (!cameraOpen) stopCameraStream();
    };
  }, [cameraOpen, stopCameraStream]);

  // Clean up the camera stream when the component unmounts.
  useEffect(() => () => stopCameraStream(), [stopCameraStream]);

  // Auto-upload a single captured photo directly into the active folder,
  // bypassing the staging queue (used by both the in-app camera and the
  // native capture="environment" fallback).
  const autoUploadPhoto = useCallback(async (file: File) => {
    let compressed = file;
    if (file.type.startsWith('image/') && file.type !== 'image/svg+xml') {
      try {
        compressed = await imageCompression(file, {
          maxSizeMB: 0.75, maxWidthOrHeight: 2400, useWebWorker: true, initialQuality: 0.85,
        });
      } catch { compressed = file; }
    }
    if (compressed.size > 800 * 1024) {
      showToast('Photo too large (max 800KB after compression)');
      return;
    }
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => resolve(e.target?.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(compressed);
    });
    const id = 'file_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    const stamp = new Date().toLocaleString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).replace(/[\/:]/g, '-');
    const name = `Photo_${stamp}.jpg`;
    const safeName = name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `${currentClient.id}/${id}/${Date.now().toString(36)}-${safeName}`;
    const comma = base64.indexOf(',');
    const b64 = comma >= 0 ? base64.slice(comma + 1) : base64;
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: 'image/jpeg' });
    const { error: uploadError } = await supabase.storage.from('client-files').upload(storagePath, blob, {
      contentType: 'image/jpeg', cacheControl: 'public, max-age=31536000, immutable', upsert: false,
    });
    if (uploadError) {
      console.error(uploadError);
      showToast('Camera photo upload failed');
      return;
    }
    await saveFile({
      id, name, type: 'image/jpeg', size: compressed.size, uploadedAt: new Date().toISOString(),
      folderId: activeFolderId, storagePath, description: 'Captured with camera',
    });
    showToast('Photo captured & uploaded automatically');
  }, [currentClient, activeFolderId, saveFile, showToast]);

  // Open the in-app camera (live preview). Falls back to the native
  // capture="environment" file input when getUserMedia is unavailable
  // (non-HTTPS, permission denied, or no camera).
  const openCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      cameraInputRef.current?.click();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }, audio: false,
      });
      streamRef.current = stream;
      setCameraOpen(true);
    } catch {
      cameraInputRef.current?.click();
    }
  }, []);

  const closeCamera = useCallback(() => {
    stopCameraStream();
    setCameraOpen(false);
  }, [stopCameraStream]);

  // Snap the current video frame, close the camera, and auto-upload.
  const captureAndUpload = useCallback(async () => {
    const video = videoRef.current;
    if (!video || cameraBusy) return;
    setCameraBusy(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92));
      closeCamera();
      if (blob) {
        const file = new File([blob], `camera_${Date.now()}.jpg`, { type: 'image/jpeg' });
        await autoUploadPhoto(file);
      }
    } finally {
      setCameraBusy(false);
    }
  }, [cameraBusy, closeCamera, autoUploadPhoto]);

  // Native camera-input fallback (mobile) — auto-upload, no staging.
  const handleCameraFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) autoUploadPhoto(file);
  };

  if (!currentClient) return null;

  // Gracefully handle undefined folders/files
  const folders = currentClient.folders || [
    { id: 'folder_revenue', name: 'Revenue', isDefault: true, type: 'revenue' },
    { id: 'folder_expense', name: 'Expense', isDefault: true, type: 'expense' }
  ];
  const files = currentClient.files || [];

  // Active folder selection fallback
  const activeFolder = folders.find(f => f.id === selectedFolderId) || folders[0];
  const activeFolderId = activeFolder?.id || 'folder_revenue';

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;

    const newFolder: AppFolder = {
      id: 'folder_' + Date.now(),
      name: newFolderName.trim(),
      isDefault: false,
      type: 'custom'
    };

    await saveFolder(newFolder);
    setNewFolderName('');
    setSelectedFolderId(newFolder.id);
    showToast(`Created folder "${newFolder.name}"`);
  };

  const handleStartRename = (folder: AppFolder) => {
    setEditingFolderId(folder.id);
    setEditingFolderName(folder.name);
  };

  const handleCancelRename = () => {
    setEditingFolderId(null);
    setEditingFolderName('');
  };

  const handleSaveRename = async (folderId: string) => {
    if (!editingFolderName.trim()) return;

    const folder = folders.find(f => f.id === folderId);
    if (!folder) return;
    await saveFolder({ ...folder, name: editingFolderName.trim() });
    setEditingFolderId(null);
    setEditingFolderName('');
    showToast('Folder renamed successfully');
  };

  const handleDeleteFolder = async (folder: AppFolder) => {
    if (folder.isDefault) {
      showToast('Default folders cannot be deleted');
      return;
    }

    // Delete normalized folder metadata. app_files.folder_id uses ON DELETE SET NULL;
    // remove the associated files explicitly below so the UI semantics stay unchanged.
    const filesInFolder = files.filter(f => f.folderId === folder.id);
    for (const file of filesInFolder) {
      if (file.storagePath) {
        const { error } = await supabase.storage.from('client-files').remove([file.storagePath]);
        evictCachedFile(file.storagePath).catch(() => {});
        if (error) console.warn('Storage file deletion failed:', error);
      }
      await deleteFile(file.id);
    }
    await deleteFolder(folder.id);
    
    // Fall back to a default folder if the deleted folder was active
    if (selectedFolderId === folder.id) {
      setSelectedFolderId('folder_revenue');
    }
    showToast(`Deleted folder "${folder.name}" and any files inside`);
  };

  // File processing supporting image compression, Base64 conversion and staging
  const processFiles = async (fileList: FileList) => {
    const validFiles: File[] = [];
    let sizeError = false;

    for (const originalFile of Array.from(fileList)) {
      let file = originalFile;

      // Compress browser-supported images before storing them. This keeps
      // uploads small enough for efficient Postgres JSONB storage/sync.
      if (originalFile.type.startsWith('image/') && originalFile.type !== 'image/svg+xml') {
        try {
          file = await imageCompression(originalFile, {
            maxSizeMB: 0.75,
            maxWidthOrHeight: 2400,
            useWebWorker: true,
            initialQuality: 0.85,
          });
        } catch {
          // Fall back to the original image if compression is unavailable.
          file = originalFile;
        }
      }

      // Guide to keep files under 800KB for efficient Postgres JSONB storage.
      if (file.size > 800 * 1024) {
        sizeError = true;
      } else {
        validFiles.push(file);
      }
    }

    if (sizeError) {
      showToast('Some files skipped (Max limit 800KB per file for database sync)');
    }

    if (validFiles.length === 0) return;

    let readCount = 0;
    const newlyStaged: StagedFile[] = [];

    validFiles.forEach(file => {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64Content = event.target?.result as string;
        let description = '';

        if (file.type === 'application/pdf') {
          try {
            const parsed = await parsePdf(file);
            description = parsed.text
              ? `PDF: ${parsed.pageCount} page(s). Extracted text: ${parsed.text.slice(0, 500)}`
              : `PDF: ${parsed.pageCount} page(s). No selectable text found.`;
          } catch {
            description = 'PDF uploaded; text extraction was not available for this document.';
          }
        }

        newlyStaged.push({
          id: 'stage_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
          name: file.name,
          originalName: file.name,
          type: file.type || 'application/octet-stream',
          size: file.size,
          content: base64Content,
          description
        });

        readCount++;
        if (readCount === validFiles.length) {
          setStagedFiles(prev => [...prev, ...newlyStaged]);
          showToast(`Staged ${validFiles.length} file(s) for review`);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const handleConfirmUpload = async () => {
    if (stagedFiles.length === 0) return;

    const newFiles: AppFile[] = [];
    for (const sf of stagedFiles) {
      const id = 'file_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
      const name = sf.name.trim() || sf.originalName;
      const safeName = name.replace(/[^a-zA-Z0-9._-]/g, '_');
      // Immutable versioned path + long-lived CDN cache headers.
      // Never reuse a path (would force a short TTL); timestamp makes each
      // upload cacheable at the edge for a full year.
      const storagePath = `${currentClient.id}/${id}/${Date.now().toString(36)}-${safeName}`;
      const comma = sf.content.indexOf(',');
      const base64 = comma >= 0 ? sf.content.slice(comma + 1) : sf.content;
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: sf.type || 'application/octet-stream' });
      const { error: uploadError } = await supabase.storage.from('client-files').upload(storagePath, blob, {
        contentType: sf.type || 'application/octet-stream',
        cacheControl: 'public, max-age=31536000, immutable',
        upsert: false,
      });
      if (uploadError) throw uploadError;
      newFiles.push({
        id, name, type: sf.type, size: sf.size, uploadedAt: new Date().toISOString(),
        folderId: activeFolderId, storagePath, description: sf.description.trim() || undefined
      });
    }

    for (const file of newFiles) {
      await saveFile(file);
    }
    setStagedFiles([]);
    showToast(`Successfully uploaded ${newFiles.length} file(s)`);
  };

  const handleCancelStaging = () => {
    setStagedFiles([]);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files);
    }
  };

  // Drag and Drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  };

  const handleDownloadFile = async (file: AppFile) => {
    try {
      if (file.storagePath) {
        // Dexie blob cache first; signed-URL fetch only on miss (signed URLs
        // rotate per request, so CDN caching is near-useless for them — local
        // cache makes repeat downloads free).
        const blob = await downloadWithCache(file.storagePath, 60);
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url; link.download = file.name; document.body.appendChild(link); link.click();
        document.body.removeChild(link); URL.revokeObjectURL(url);
        return;
      }
      if (file.content) {
        const link = document.createElement('a'); link.href = file.content; link.download = file.name;
        document.body.appendChild(link); link.click(); document.body.removeChild(link);
      }
    } catch (e) {
      console.error(e); showToast('Error downloading file');
    }
  };

  const handleDeleteFile = async (fileId: string) => {
    const fileToDelete = files.find(f => f.id === fileId);
    if (fileToDelete?.storagePath) {
      const { error } = await supabase.storage.from('client-files').remove([fileToDelete.storagePath]);
      evictCachedFile(fileToDelete.storagePath).catch(() => {});
      if (error) console.warn('Storage file deletion failed:', error);
    }
    await deleteFile(fileId);
    showToast('File removed successfully');
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const activeFolderFiles = files.filter(f => f.folderId === activeFolderId);

  // ---- T019: bank statement import + auto-match reconciliation ----
  const [bankTxns, setBankTxns] = useState<BankTxn[]>([]);
  const bankFileRef = useRef<HTMLInputElement>(null);
  const reconcileRules: ReconcileRule[] = DEFAULT_RECONCILE_RULES;
  const handleBankFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      const txns = parseBankStatement(file.name, text);
      setBankTxns(txns);
      showToast(`Imported ${txns.length} bank transactions`);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="w-full flex flex-col">
      <PageHeader
        title="Document & Receipt Vault"
        icon={<FolderOpen className="text-blue-500" />}
        actions={
          <button
            type="button"
            onClick={openCamera}
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl text-xs font-bold shadow-sm shadow-emerald-500/20 transition-all"
            title="Open camera to capture a receipt/document and upload automatically"
          >
            <Camera className="w-4 h-4" />
            <span className="hidden sm:inline">Take Photo</span>
          </button>
        }
      />
      <div className="p-4 md:p-6 flex-1">
      {/* T019: Bank import + auto-match inbox */}
      <div className="mb-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Bank Statement Import</div>
            <div className="text-[11px] text-slate-400">Upload CSV / OFX — transactions auto-matched to account titles by keyword rules.</div>
          </div>
          <button type="button" onClick={() => bankFileRef.current?.click()} className="inline-flex items-center gap-2 px-3 py-2 text-xs font-bold rounded-lg bg-blue-600 hover:bg-blue-700 text-white">
            <Upload className="w-3.5 h-3.5" /> Import Bank Statement
          </button>
          <input ref={bankFileRef} type="file" accept=".csv,.ofx,.qbo,.txt" className="hidden" onChange={handleBankFile} />
        </div>
        {bankTxns.length > 0 && (
          <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700">
            <table className="w-full text-[11px]">
              <thead className="bg-slate-100 dark:bg-slate-800 text-slate-500 uppercase sticky top-0">
                <tr><th className="text-left px-3 py-2">Date</th><th className="text-left px-3 py-2">Description</th><th className="text-right px-3 py-2">Amount</th><th className="text-left px-3 py-2">Suggested Account</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {bankTxns.slice(0, 50).map(t => {
                  const match = matchTransaction(t.description, reconcileRules);
                  return (
                    <tr key={t.id} className="hover:bg-white dark:hover:bg-slate-800/50">
                      <td className="px-3 py-1.5 font-mono text-slate-500">{t.date}</td>
                      <td className="px-3 py-1.5 text-slate-700 dark:text-slate-200 max-w-[240px] truncate">{t.description}</td>
                      <td className={`px-3 py-1.5 text-right font-mono font-bold ${t.amount >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{t.amount >= 0 ? '+' : ''}₱{Math.abs(t.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                      <td className="px-3 py-1.5">{match ? <span className="inline-block px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 text-[10px] font-bold">{match.accountTitle}</span> : <span className="text-slate-300 text-[10px]">— uncategorized —</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="flex flex-col md:flex-row gap-6 min-h-[500px]">
        {/* Left Side: Folder Management */}
        <div className="w-full md:w-80 shrink-0 border-r border-slate-100 dark:border-slate-800 pr-0 md:pr-6 flex flex-col gap-6">
          <div>
            <h4 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3">
              Folders
            </h4>
            
            <div className="flex flex-col gap-1.5 max-h-[300px] overflow-y-auto custom-scrollbar">
              {folders.map(folder => {
                const isSelected = folder.id === activeFolderId;
                const isEditing = editingFolderId === folder.id;
                const folderFileCount = files.filter(f => f.folderId === folder.id).length;

                return (
                  <div
                    key={folder.id}
                    className={`group flex items-center justify-between p-3 rounded-xl transition-all ${
                      isSelected 
                        ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400' 
                        : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {isEditing ? (
                      <div className="flex items-center gap-1.5 w-full">
                        <input
                          type="text"
                          value={editingFolderName}
                          onChange={(e) => setEditingFolderName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveRename(folder.id);
                            if (e.key === 'Escape') handleCancelRename();
                          }}
                          className="flex-1 text-xs px-2 py-1 border border-blue-400 dark:border-blue-600 rounded bg-white dark:bg-slate-800 focus:outline-none"
                          autoFocus
                        />
                        <button 
                          onClick={() => handleSaveRename(folder.id)}
                          className="p-1 hover:bg-blue-100 dark:hover:bg-blue-900 rounded text-emerald-600"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button 
                          onClick={handleCancelRename}
                          className="p-1 hover:bg-red-100 dark:hover:bg-red-950/30 rounded text-red-500"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={() => setSelectedFolderId(folder.id)}
                          className="flex items-center gap-2.5 flex-1 min-w-0"
                        >
                          {isSelected ? (
                            <FolderOpen className="w-4 h-4 shrink-0 text-blue-500" />
                          ) : (
                            <Folder className="w-4 h-4 shrink-0 text-slate-400 dark:text-slate-500 group-hover:text-slate-500" />
                          )}
                          <span className="text-sm font-semibold truncate text-left">
                            {folder.name}
                          </span>
                          <span className="text-[10px] bg-slate-200 dark:bg-slate-800 dark:text-slate-400 text-slate-500 px-1.5 py-0.5 rounded-full shrink-0">
                            {folderFileCount}
                          </span>
                        </button>

                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity ml-2">
                          <button
                            onClick={() => handleStartRename(folder)}
                            className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-slate-500 dark:text-slate-400"
                            title="Rename folder"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          {!folder.isDefault && (
                            <button
                              onClick={() => handleDeleteFolder(folder)}
                              disabled={!canDelete}
                              className="p-1 hover:bg-red-50 dark:hover:bg-red-950/20 rounded text-red-500 disabled:opacity-40 disabled:grayscale disabled:cursor-not-allowed"
                              title={canDelete ? 'Delete folder and files' : 'Delete Transactions permission not granted'}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <form onSubmit={handleCreateFolder} className="mt-auto pt-4 border-t border-slate-100 dark:border-slate-800">
            <h5 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">
              New Folder
            </h5>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Folder name"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                className="form-input flex-1 py-2 text-xs"
              />
              <button
                type="submit"
                disabled={!newFolderName.trim()}
                className="p-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl disabled:opacity-50 transition-all flex items-center justify-center shrink-0"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </form>
        </div>

        {/* Right Side: Active Folder Contents & Upload Engine */}
        <div className="flex-1 flex flex-col gap-6">
          <div>
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <span>{activeFolder?.name} Folder</span>
              {activeFolder?.isDefault && (
                <span className="text-[10px] bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                  Default
                </span>
              )}
            </h3>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
              Store internal documents, payment vouchers, scanned invoices, or audit files under this folder.
            </p>
          </div>

          {/* Interactive Drag & Drop Box OR Staging Editor */}
          {stagedFiles.length > 0 ? (
            <div className="bg-slate-50 dark:bg-slate-800/40 border border-blue-100 dark:border-blue-900/40 p-5 rounded-3xl flex flex-col gap-4">
              <div className="flex items-center justify-between border-b border-slate-200/60 dark:border-slate-800 pb-2.5">
                <div>
                  <h4 className="font-bold text-sm text-slate-800 dark:text-slate-100 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
                    Configure File Uploads ({stagedFiles.length})
                  </h4>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                    Rename your files and provide optional metadata before saving to this folder.
                  </p>
                </div>
                <button
                  onClick={handleCancelStaging}
                  className="text-xs text-slate-400 dark:text-slate-500 hover:text-red-500 font-bold transition-all"
                >
                  Clear Queue
                </button>
              </div>

              <div className="flex flex-col gap-3.5 max-h-[300px] overflow-y-auto custom-scrollbar pr-1">
                {stagedFiles.map((sf, index) => (
                  <div key={sf.id} className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/80 p-4 rounded-2xl flex flex-col gap-3 relative">
                    <div className="absolute top-3 right-3">
                      <button
                        type="button"
                        onClick={() => setStagedFiles(stagedFiles.filter(item => item.id !== sf.id))}
                        className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-400 hover:text-red-500 transition-all font-semibold"
                        title="Remove from queue"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-blue-50 dark:bg-blue-950/40 text-blue-600 rounded-xl shrink-0">
                        <FileText className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 pr-6">
                        <span className="font-semibold text-xs text-slate-400 block pb-0.5">Original filename</span>
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300 truncate block max-w-xs">{sf.originalName}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">
                          Rename File
                        </label>
                        <input
                          type="text"
                          value={sf.name}
                          onChange={(e) => {
                            const updated = [...stagedFiles];
                            updated[index].name = e.target.value;
                            setStagedFiles(updated);
                          }}
                          className="form-input w-full py-1.5 px-3 text-xs"
                          placeholder="Filename"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">
                          File Description / Memo
                        </label>
                        <input
                          type="text"
                          value={sf.description}
                          onChange={(e) => {
                            const updated = [...stagedFiles];
                            updated[index].description = e.target.value;
                            setStagedFiles(updated);
                          }}
                          className="form-input w-full py-1.5 px-3 text-xs"
                          placeholder="What is this document for?"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Action row */}
              <div className="flex items-center justify-end gap-3 border-t border-slate-200/60 dark:border-slate-800/80 pt-3">
                <button
                  type="button"
                  onClick={handleCancelStaging}
                  className="px-4 py-2 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold transition-all"
                >
                  Discard All
                </button>
                <button
                  type="button"
                  onClick={handleConfirmUpload}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm shadow-blue-500/20"
                >
                  <Check className="w-4 h-4" />
                  <span>Upload & Save Documents</span>
                </button>
              </div>
            </div>
          ) : (
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-3xl p-8 py-10 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-3 ${
                isDragging 
                  ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-900/10' 
                  : 'border-slate-200 dark:border-slate-700 hover:border-blue-400 hover:bg-slate-50/50 dark:hover:bg-slate-800/20'
              }`}
            >
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                multiple 
                className="hidden" 
              />
              {/* Fallback: on supported mobile browsers, capture="environment"
                  opens the rear camera directly. Used only when getUserMedia
                  is unavailable; auto-uploads (no staging) via handleCameraFileChange. */}
              <input 
                type="file" 
                ref={cameraInputRef} 
                onChange={handleCameraFileChange} 
                accept="image/*" 
                capture="environment" 
                className="hidden" 
              />
              <div className="p-4 bg-blue-50/80 dark:bg-blue-950/40 text-blue-600 rounded-2xl shrink-0">
                <Upload className="w-6 h-6" />
              </div>
              <div>
                <span className="font-bold text-slate-700 dark:text-slate-300 block text-sm">
                  Drag & drop files here, or <span className="text-blue-600 dark:text-blue-400 hover:underline">browse</span>
                </span>
                <span className="text-[11px] text-slate-400 dark:text-slate-500 block mt-1">
                  Upload image, PDF, or text files up to 800KB for real-time document synchronization.
                </span>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <span className="text-[10px] text-slate-400 dark:text-slate-500">
                  Tip: use the <span className="font-bold text-emerald-600 dark:text-emerald-400">Take Photo</span> button in the header to capture receipts with your camera — they upload automatically.
                </span>
              </div>
            </div>
          )}

          {/* Uploaded File List */}
          <div className="flex-1 flex flex-col">
            <h4 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3">
              Assets & Documents ({activeFolderFiles.length})
            </h4>

            {activeFolderFiles.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center py-10 bg-slate-50/50 dark:bg-slate-800/10 rounded-2xl border border-slate-100 dark:border-slate-800/80 text-center">
                <FileText className="w-10 h-10 text-slate-300 dark:text-slate-700 mb-2" />
                <span className="font-semibold text-slate-500 dark:text-slate-400 text-sm">No files uploaded yet</span>
                <span className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 max-w-xs">
                  Upload file attachments directly into the folder to organize document entries.
                </span>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-100 dark:border-slate-800 rounded-2xl overflow-hidden bg-white dark:bg-slate-800/40">
                {activeFolderFiles.map(file => (
                  <div 
                    key={file.id} 
                    className="flex items-center justify-between p-4 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
                  >
                    <div className="flex items-center gap-3.5 min-w-0 flex-1">
                      <div className="p-2.5 bg-blue-50 dark:bg-slate-800 rounded-xl text-blue-600 dark:text-blue-400 shrink-0">
                        {file.type.startsWith('image/') ? (
                          <File className="w-4 h-4" />
                        ) : (
                          <FileText className="w-4 h-4" />
                        )}
                      </div>
                      <div className="min-w-0 pr-4">
                        <span className="font-bold text-sm text-slate-700 dark:text-slate-200 block truncate" title={file.name}>
                          {file.name}
                        </span>
                        {file.description && (
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 italic break-words block max-w-md">
                            "{file.description}"
                          </p>
                        )}
                        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[10px] text-slate-400 dark:text-slate-500 mt-1 font-medium">
                          <span>{formatBytes(file.size)}</span>
                          <span className="text-slate-300 dark:text-slate-700">•</span>
                          <span>{new Date(file.uploadedAt).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric'
                          })}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => setViewingFile(file)}
                        className="p-2 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 rounded-xl text-emerald-600 dark:text-emerald-400 transition-colors"
                        title="View document"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDownloadFile(file)}
                        className="p-2 hover:bg-blue-50 dark:hover:bg-blue-950/20 rounded-xl text-blue-600 dark:text-blue-400 transition-colors"
                        title="Download document"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteFile(file.id)}
                        disabled={!canDelete}
                        className="p-2 hover:bg-red-50 dark:hover:bg-red-950/25 rounded-xl text-red-500 hover:text-red-600 transition-colors disabled:opacity-40 disabled:grayscale disabled:cursor-not-allowed"
                        title={canDelete ? 'Remove document' : 'Delete Transactions permission not granted'}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      </div>
      {/* Live camera capture modal — opens automatically when the header
          Take Photo button is clicked (getUserMedia). Auto-uploads on capture. */}
      {cameraOpen && (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4" onClick={closeCamera}>
          <div className="w-full max-w-2xl flex flex-col items-center gap-4" onClick={e => e.stopPropagation()}>
            <div className="w-full text-center">
              <div className="text-white font-bold text-sm">Capture Document / Receipt</div>
              <div className="text-white/50 text-[11px] mt-0.5">Point at the document, then tap capture — it uploads automatically.</div>
            </div>
            <div className="relative w-full rounded-2xl overflow-hidden bg-black border border-white/10">
              <video ref={videoRef} playsInline muted className="w-full max-h-[65vh] object-contain bg-black" />
              {/* viewfinder corner brackets */}
              <div className="pointer-events-none absolute inset-4 border-2 border-white/30 rounded-lg" />
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={closeCamera}
                className="px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={captureAndUpload}
                disabled={cameraBusy}
                className="relative w-16 h-16 rounded-full bg-white hover:bg-emerald-400 transition-all flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
                title="Capture & upload"
              >
                <span className="w-12 h-12 rounded-full border-4 border-black/80 bg-white" />
              </button>
              <button
                type="button"
                onClick={() => { closeCamera(); cameraInputRef.current?.click(); }}
                className="px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition-all"
                title="Use native camera/file picker instead"
              >
                Browse
              </button>
            </div>
          </div>
        </div>
      )}
      {viewingFile && <AttachmentViewer file={viewingFile} onClose={() => setViewingFile(null)} />}
    </div>
  );
}
