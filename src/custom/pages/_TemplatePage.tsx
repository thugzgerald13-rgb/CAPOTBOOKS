/**
 * Template for a customized page/feature. Copy this file, rename it, then register
 * it in src/custom/registry.ts. It is NOT registered, so it is never shown to anyone.
 *
 * Every variant receives:
 *   - the same props the universal component gets (pages: none, except Payroll which
 *     gets `company` and `initialPage`)
 *   - `Universal`: the original component for this slot
 *
 * Pick a pattern:
 *   A) EXTEND  — render <Universal {...rest} /> and add things around it (below).
 *   B) REPLACE — ignore <Universal /> and build the page from scratch using the same
 *                hooks the universal pages use (useAccounting(), useAuth(), the shared
 *                ui kit in src/components/ui). Permissions, module locks and feature
 *                visibility for this route are still enforced by App.tsx.
 *   C) FORK    — copy the universal page's source into src/custom/pages and edit it
 *                (full control, but you now maintain a copy).
 */
import type { CustomComponentProps } from '../../lib/uiVariants';

export default function CustomPageTemplate({ Universal, ...rest }: CustomComponentProps) {
  return (
    <div className="space-y-4">
      <div className="card-surface p-4 text-sm text-slate-600 dark:text-slate-300">
        Customized view for this account. Replace this banner with your custom UI.
      </div>
      {/* Remove the next line for a full REPLACE. */}
      <Universal {...rest} />
    </div>
  );
}
