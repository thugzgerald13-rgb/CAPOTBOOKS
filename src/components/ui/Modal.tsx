import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft } from 'lucide-react';
import { ReactNode } from 'react';
import { cn } from '../../lib/utils';
import { useAccounting } from '../../context/AccountingContext';

interface ModalProps {
  id: string;
  title: ReactNode;
  children: ReactNode;
  icon?: ReactNode;
  maxWidth?: string;
  badge?: ReactNode;
}

// Despite the name (kept for compatibility with every existing call site),
// this now renders as a full page within the main content area rather than
// an overlay/backdrop modal - all sidebar (and other) navigation opens a
// page, not a popup.
export function Modal({ id, title, children, icon, badge }: ModalProps) {
  const { activeModal, openModal } = useAccounting();
  const isActive = activeModal === id || (id === 'bir-forms' && activeModal?.startsWith('bir-'));

  const handleBack = () => openModal(null);

  return (
    <AnimatePresence>
      {isActive && (
        <motion.div
          className="w-full bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm mt-8 flex flex-col overflow-hidden"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          transition={{ duration: 0.2 }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 z-10 shrink-0">
            <div className="flex items-center gap-3">
              <button
                onClick={handleBack}
                className="p-2 -ml-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors shrink-0"
                aria-label="Back to Dashboard"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              {icon && <span className="text-xl">{icon}</span>}
              <h3 className="text-base md:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                {title}
                {badge}
              </h3>
            </div>
          </div>

          {/* Body */}
          <div className={cn("p-4 md:p-6 flex-1")}>
            {children}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
