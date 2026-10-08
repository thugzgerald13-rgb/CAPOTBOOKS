import { useRef, useState } from 'react';
import { Upload, CheckCircle2, Loader2, QrCode, Wallet } from 'lucide-react';
import { Modal } from './ui/Modal';
import { toast } from './ui/Toast';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import type { SubscriptionPlan } from '../lib/subscription';

// Your GCash QR — only this image is shown to the payer. No account number,
// name, or any other detail is ever displayed. Drop the file at:
//   public/images/gcash-qr.png
const GCASH_QR_URL = '/images/gcash-qr.png';

export const PLAN_AMOUNTS: Record<Exclude<SubscriptionPlan, 'free'>, number> = {
  starter: 499,
  pro: 1499,
  enterprise: 3999,
};
export const PLAN_NAMES: Record<Exclude<SubscriptionPlan, 'free'>, string> = {
  starter: 'Starter Plan',
  pro: 'Pro Plan',
  enterprise: 'Enterprise Plan',
};

interface PaymentInstructionsProps {
  /** Plan being paid for, or null to close the modal. */
  plan: SubscriptionPlan | null;
  onClose: () => void;
  /** Called after a receipt is successfully submitted (parent can refresh). */
  onSubmitted?: () => void;
}

export function PaymentInstructions({ plan, onClose, onSubmitted }: PaymentInstructionsProps) {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const open = plan !== null && plan !== 'free';
  const amount = open ? PLAN_AMOUNTS[plan as Exclude<SubscriptionPlan, 'free'>] : 0;
  const planName = open ? PLAN_NAMES[plan as Exclude<SubscriptionPlan, 'free'>] : '';

  const reset = () => {
    setReceiptFile(null);
    setReceiptPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClose = () => {
    if (submitting) return;
    reset();
    onClose();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null;
    setReceiptFile(f);
    if (receiptPreview) URL.revokeObjectURL(receiptPreview);
    setReceiptPreview(f ? URL.createObjectURL(f) : null);
  };

  const handleSubmit = async () => {
    if (!user) {
      toast.error('Please sign in to submit a payment.');
      return;
    }
    if (!plan || plan === 'free') return;
    if (!receiptFile) {
      toast.warning('Please upload your GCash payment receipt / screenshot first.');
      return;
    }

    setSubmitting(true);
    const loadingId = toast.loading('Submitting your receipt…');
    try {
      // Compress large screenshots before upload (browser-image-compression
      // ships with the project). Fall back to the original file on any error.
      let toUpload: File = receiptFile;
      try {
        const imageCompression = (await import('browser-image-compression')).default;
        if (receiptFile.size > 1.5 * 1024 * 1024) {
          toUpload = await imageCompression(receiptFile, {
            maxSizeMB: 1,
            maxWidthOrHeight: 1600,
            useWebWorker: true,
          });
        }
      } catch { /* keep original */ }

      const ext = (receiptFile.name.split('.').pop() || 'png').toLowerCase();
      const filePath = `${user.id}/${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('receipts')
        .upload(filePath, toUpload, { cacheControl: '3600', upsert: false });
      if (uploadError) throw uploadError;

      const { error: insertError } = await supabase.from('payment_requests').insert({
        user_id: user.id,
        user_email: user.email || null,
        user_name: (user.user_metadata?.full_name as string) || (user.user_metadata?.name as string) || null,
        plan,
        amount,
        receipt_url: filePath, // storage path; admin generates a signed URL to view
        status: 'pending',
      });
      if (insertError) throw insertError;

      toast.dismiss(loadingId);
      toast.success('Receipt submitted!', {
        description: 'We will verify your GCash payment and activate your plan within 24 hours.',
        duration: 6000,
      });
      reset();
      onSubmitted?.();
      onClose();
    } catch (err) {
      toast.dismiss(loadingId);
      const msg = err instanceof Error ? err.message : 'Unknown error';
      toast.error('Submission failed', { description: msg, duration: 6000 });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      size="md"
      title={`Subscribe — ${planName}`}
      description="Pay by scanning the GCash QR below, then upload your receipt screenshot."
      footer={
        <>
          <button
            type="button"
            onClick={handleClose}
            disabled={submitting}
            className="px-4 py-2 text-sm font-bold rounded-xl border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !receiptFile}
            className="inline-flex items-center gap-2 px-5 py-2 text-sm font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            {submitting ? 'Submitting…' : 'Submit Receipt'}
          </button>
        </>
      }
    >
      <div className="flex flex-col items-center gap-4">
        <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900">
          <Wallet className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          <span className="text-sm font-black text-emerald-700 dark:text-emerald-300">
            Amount to pay: ₱{amount.toLocaleString()}
          </span>
        </div>

        {/* ONLY the QR is shown — no numbers, no account name, no details. */}
        <div className="border-[3px] border-emerald-500 rounded-2xl p-3 bg-white">
          <img
            src={GCASH_QR_URL}
            alt="GCash QR — scan to pay"
            className="w-56 h-56 object-contain rounded-lg"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          />
        </div>
        <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
          <QrCode className="w-3.5 h-3.5" />
          Open your GCash app → Scan QR → scan the code above → send ₱{amount.toLocaleString()}.
        </div>

        <div className="w-full pt-2 border-t border-slate-200 dark:border-slate-700">
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
            Upload payment receipt / screenshot
          </label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="block w-full text-xs text-slate-500 dark:text-slate-400 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-cyan-600 file:text-white hover:file:bg-cyan-700 file:cursor-pointer cursor-pointer"
          />
          {receiptPreview && (
            <div className="mt-3 flex items-center gap-3 p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
              <img src={receiptPreview} alt="Receipt preview" className="w-14 h-14 object-cover rounded-lg" />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">{receiptFile?.name}</div>
                <div className="text-[11px] text-slate-400">{((receiptFile?.size || 0) / 1024).toFixed(0)} KB — ready to submit</div>
              </div>
              <Upload className="w-4 h-4 text-emerald-500 shrink-0" />
            </div>
          )}
          <p className="text-[11px] text-slate-400 mt-2">
            After you submit, an admin verifies the payment in GCash and activates your plan. You can close this window — your request is saved.
          </p>
        </div>
      </div>
    </Modal>
  );
}
