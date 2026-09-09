import { supabase } from './supabase';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface SupabaseErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
  };
}

export async function handleSupabaseError(error: unknown, operationType: OperationType, path: string | null) {
  const { data } = await supabase.auth.getUser();
  const errInfo: SupabaseErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: data.user?.id ?? null,
      email: data.user?.email ?? null,
    },
    operationType,
    path,
  };
  const errorMsg = JSON.stringify(errInfo);
  console.error('Supabase Error: ', errorMsg);
  throw new Error(errorMsg);
}

// Resolve an attachment (purchase attachment or app file) to a URL that can be
// viewed inline (image / PDF). Returns the URL plus a flag indicating whether
// it is a blob: URL that the caller must revoke when finished with it.
export interface ViewableAttachment {
  name?: string;
  type?: string;
  originalType?: string;
  compression?: 'none' | 'gzip' | string;
  content?: string;
  storagePath?: string;
}
export interface ResolvedViewUrl {
  url: string;
  isObjectUrl: boolean;
  mimeType: string;
}
export async function getAttachmentViewUrl(file?: ViewableAttachment | null): Promise<ResolvedViewUrl> {
  if (!file) throw new Error('No attachment.');
  const mimeType = file.originalType || file.type || '';
  let sourceUrl = file.content || '';

  if (file.storagePath) {
    const { data, error } = await supabase.storage.from('client-files').createSignedUrl(file.storagePath, 600);
    if (error || !data?.signedUrl) throw error || new Error('Unable to access the stored file.');
    sourceUrl = data.signedUrl;
  }
  if (!sourceUrl) throw new Error('Attachment has no content or storage path.');

  const needsRestore =
    file.compression === 'gzip' ||
    (!!file.originalType && file.originalType.startsWith('image/') && !!file.type && file.type !== file.originalType);

  if (!needsRestore) {
    return { url: sourceUrl, isObjectUrl: false, mimeType: mimeType || 'application/octet-stream' };
  }

  // Stored file is gzip-compressed or re-encoded; fetch and restore the original bytes.
  const response = await fetch(sourceUrl);
  if (!response.ok) throw new Error('Failed to fetch attachment.');
  let blob = await response.blob();

  if (file.compression === 'gzip') {
    if (!('DecompressionStream' in window)) throw new Error('Gzip decompression is not supported in this browser.');
    const restored = await new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).blob();
    blob = new Blob([restored], { type: file.originalType || blob.type });
  } else if (file.originalType && file.originalType.startsWith('image/') && file.type !== file.originalType) {
    const tempUrl = URL.createObjectURL(blob);
    try {
      const image = new Image();
      image.src = tempUrl;
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error('Unable to decode stored image.'));
      });
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas unavailable.');
      ctx.drawImage(image, 0, 0);
      const restored = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, file.originalType!, 0.92));
      if (!restored) throw new Error('Unable to restore image format.');
      blob = restored;
    } finally {
      URL.revokeObjectURL(tempUrl);
    }
  }

  return { url: URL.createObjectURL(blob), isObjectUrl: true, mimeType: file.originalType || blob.type };
}
