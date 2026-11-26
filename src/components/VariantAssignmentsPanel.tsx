import React, { useEffect, useMemo, useState } from 'react';
import {
  SWAPPABLE_SLOTS,
  listVariantsForSlot,
  loadDeveloperVariantAssignments,
  saveDeveloperVariantAssignment,
  type VariantAssignment,
  type VariantScope,
} from '../lib/uiVariants';

interface PanelUser { uid: string; email: string; subscriptionPlan?: string }
interface PanelProps {
  users: PanelUser[];
  planOptions: { value: string; label: string }[];
}

/**
 * Developer System Config -> UI Variants.
 * Pick a plan or a user, then swap any universal page/button for a registered
 * customized variant (src/custom/registry.ts). "Universal (default)" removes the swap.
 */
export function VariantAssignmentsPanel({ users, planOptions }: PanelProps) {
  const [scope, setScope] = useState<VariantScope>('user');
  const [plan, setPlan] = useState(planOptions[0]?.value ?? 'free');
  const [userId, setUserId] = useState('');
  const [rows, setRows] = useState<VariantAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showAllSlots, setShowAllSlots] = useState(false);

  useEffect(() => {
    let active = true;
    loadDeveloperVariantAssignments()
      .then((data) => { if (active) { setRows(data); setError(''); } })
      .catch((e) => { if (active) setError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const target = scope === 'plan' ? plan : userId;
  const selectedUser = users.find((u) => u.uid === userId);
  const find = (s: VariantScope, key: string, slotId: string) =>
    rows.find((r) => r.scope_type === s && r.scope_key === key && r.slot_id === slotId);

  const slotsWithVariants = useMemo(
    () => SWAPPABLE_SLOTS.filter((slot) => listVariantsForSlot(slot.id).length > 0),
    [],
  );
  const visibleSlots = showAllSlots ? SWAPPABLE_SLOTS : slotsWithVariants;
  const groups = [...new Set(visibleSlots.map((slot) => slot.group))];

  const change = async (slotId: string, value: string) => {
    if (!target) return;
    const variantId = value === '' ? null : value;
    setSaving(true);
    setError('');
    try {
      await saveDeveloperVariantAssignment(scope, target, slotId, variantId);
      setRows((current) => [
        ...current.filter((r) => !(r.scope_type === scope && r.scope_key === target && r.slot_id === slotId)),
        ...(variantId ? [{ scope_type: scope, scope_key: target, slot_id: slotId, variant_id: variantId }] : []),
      ]);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      alert(`Could not save UI variant: ${message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-xl border border-fuchsia-200 dark:border-fuchsia-900 bg-white dark:bg-slate-900 p-4 mb-6">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div>
          <div className="text-xs font-black uppercase tracking-wider text-fuchsia-700 dark:text-fuchsia-300">UI Variants (Custom Pages &amp; Buttons)</div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            Swap a universal page or button for a customized one, for one user or a whole plan. Resolution: user → account owner → plan → universal. Team members inherit their owner&apos;s swaps. Access rules above still apply to swapped pages.
          </p>
        </div>
        <span className="text-[10px] text-slate-400">{saving ? 'Saving…' : loading ? 'Loading…' : 'Saved to Supabase'}</span>
      </div>

      <div className="grid sm:grid-cols-3 gap-3 mb-3">
        <label className="block text-xs font-bold text-slate-600 dark:text-slate-300">
          Apply to
          <select className="form-input w-full mt-1" value={scope} onChange={(e) => setScope(e.target.value as VariantScope)} disabled={saving}>
            <option value="user">A specific user</option>
            <option value="plan">A subscription plan</option>
          </select>
        </label>
        {scope === 'plan' ? (
          <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 sm:col-span-2">
            Subscription plan
            <select className="form-input w-full mt-1" value={plan} onChange={(e) => setPlan(e.target.value)} disabled={saving}>
              {planOptions.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </label>
        ) : (
          <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 sm:col-span-2">
            User account
            <select className="form-input w-full mt-1" value={userId} onChange={(e) => setUserId(e.target.value)} disabled={saving || !users.length}>
              <option value="">Select a registered user</option>
              {users.map((u) => <option key={u.uid} value={u.uid}>{u.email} · {u.subscriptionPlan || 'free'}</option>)}
            </select>
          </label>
        )}
      </div>

      {error && (
        <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-300 text-[11px] p-3 mb-3">
          {error}. If this is the first time, run <code>scripts/ui_variant_assignments.sql</code> in the Supabase SQL Editor, then refresh.
        </div>
      )}

      {slotsWithVariants.length === 0 && !showAllSlots && (
        <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-700 p-4 text-[11px] text-slate-500 dark:text-slate-400 mb-3">
          No custom variants are registered in this build yet. Add one in <code>src/custom/registry.ts</code> (see CUSTOM_VARIANTS.md), deploy, and it will appear here.
        </div>
      )}

      <label className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 mb-3 cursor-pointer">
        <input type="checkbox" className="accent-fuchsia-600" checked={showAllSlots} onChange={(e) => setShowAllSlots(e.target.checked)} />
        Show every swappable slot ({SWAPPABLE_SLOTS.length}), including ones with no custom variant yet
      </label>

      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {groups.map((group) => (
          <div key={group} className="rounded-lg border border-slate-100 dark:border-slate-800 p-3">
            <div className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-2">{group}</div>
            <div className="space-y-2">
              {visibleSlots.filter((slot) => slot.group === group).map((slot) => {
                const variants = listVariantsForSlot(slot.id);
                const direct = target ? find(scope, target, slot.id) : undefined;
                const planKey = scope === 'user' ? (selectedUser?.subscriptionPlan || 'free').toLowerCase() : plan;
                const inherited = scope === 'user' && !direct ? find('plan', planKey, slot.id) : undefined;
                const current = direct?.variant_id ?? '';
                const orphaned = !!direct && !variants.some((v) => v.id === direct.variant_id);
                const source = direct ? (scope === 'user' ? 'User assignment' : 'Plan assignment') : inherited ? `Plan rule: ${inherited.variant_id}` : 'Universal';
                return (
                  <div key={slot.id} className="rounded-md border border-slate-100 dark:border-slate-800 px-2 py-2">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">{slot.label}</span>
                      <span className={`text-[9px] font-bold ${direct || inherited ? 'text-fuchsia-600 dark:text-fuchsia-400' : 'text-slate-400'}`}>{direct || inherited ? 'CUSTOM' : 'UNIVERSAL'}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[9px] text-slate-400">{source}</span>
                      <select
                        aria-label={`${slot.label} UI variant`}
                        className="form-input !py-1 !px-2 !text-[10px] max-w-[170px]"
                        value={current}
                        onChange={(e) => void change(slot.id, e.target.value)}
                        disabled={loading || saving || !target || (variants.length === 0 && !direct)}
                      >
                        <option value="">Universal (default)</option>
                        {orphaned && <option value={direct!.variant_id}>⚠ {direct!.variant_id} (not in this build)</option>}
                        {variants.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
                      </select>
                    </div>
                    {orphaned && <p className="text-[9px] text-amber-600 dark:text-amber-400 mt-1">This variant is not registered in the deployed build; users see the universal UI.</p>}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
