import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, CheckSquare, Square, ShieldCheck } from 'lucide-react';
import type { MemberRole } from '../types';
import { MEMBER_ROLE_PERMISSIONS } from '../lib/teamPermissions';
import {
  GRANULAR_PERMISSION_MODULES,
  actionPermissionKey,
  dropdownPermissionKey,
  modulePermissionKey,
  type UiPermissionModule,
} from '../lib/granularPermissions';

type Props = {
  value: Record<string, boolean>;
  onChange: (value: Record<string, boolean>) => void;
  memberRole: MemberRole | string;
  basePermissions: Record<string, boolean>;
  disabled?: boolean;
};

const MODULE_PARENT: Record<string, string> = { purchases_invoiced: 'purchases', purchases_other_payments: 'purchases', purchases_ap: 'purchases' };

const asMemberRole = (role: string): MemberRole =>
  (['accountant', 'bookkeeper', 'staff', 'viewer'].includes(role) ? role : 'staff') as MemberRole;

export function GranularPermissionEditor({ value, onChange, memberRole, basePermissions, disabled = false }: Props) {
  const [expanded, setExpanded] = useState<string>('purchases');
  const roleAllowed = MEMBER_ROLE_PERMISSIONS[asMemberRole(memberRole)] || [];
  const modules = GRANULAR_PERMISSION_MODULES;

  const keyAllowed = (requiredPermission: string | null): boolean => {
    if (!requiredPermission) return true;
    return roleAllowed.includes(requiredPermission as never) && basePermissions[requiredPermission] !== false;
  };

  const moduleAllowedByParent = (module: UiPermissionModule, state: Record<string, boolean> = value): boolean => {
    const parentId = MODULE_PARENT[module.id];
    return !parentId || Boolean(state[modulePermissionKey(parentId)]);
  };

  const moduleKeys = (module: UiPermissionModule): Array<{ key: string; required: string | null }> => {
    const keys: Array<{ key: string; required: string | null }> = [
      { key: modulePermissionKey(module.id), required: module.requiredPermission },
      ...module.actions.map((action) => ({
        key: actionPermissionKey(module.id, action.id),
        required: action.requiredPermission,
      })),
      ...module.dropdowns.flatMap((group) => group.options.map((option) => ({
        key: dropdownPermissionKey(module.id, group.id, option.id),
        required: option.requiredPermission,
      }))),
    ];
    return keys;
  };

  const overall = useMemo(() => {
    const all = modules.flatMap((module) => moduleKeys(module));
    const allowed = all.filter((item) => keyAllowed(item.required));
    const checked = allowed.filter((item) => Boolean(value[item.key]));
    return { allowed: allowed.length, checked: checked.length };
    // keyAllowed only depends on these role/base maps, which are replaced on each editor update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modules, value, memberRole, basePermissions]);

  const updateModule = (module: UiPermissionModule, enabled: boolean) => {
    const effectiveEnabled = enabled && keyAllowed(module.requiredPermission) && moduleAllowedByParent(module);
    const next = { ...value, [modulePermissionKey(module.id)]: effectiveEnabled };
    const children = moduleKeys(module).filter((item) => item.key !== modulePermissionKey(module.id));
    children.forEach((item) => {
      next[item.key] = effectiveEnabled && keyAllowed(item.required);
    });
    if (module.id === 'purchases' && !effectiveEnabled) {
      modules.filter((candidate) => MODULE_PARENT[candidate.id] === 'purchases').forEach((candidate) => {
        moduleKeys(candidate).forEach((item) => { next[item.key] = false; });
      });
    }
    onChange(next);
  };

  const toggleKey = (key: string, required: string | null) => {
    if (!keyAllowed(required)) return;
    onChange({ ...value, [key]: !Boolean(value[key]) });
  };

  const selectAll = () => {
    const next = { ...value };
    modules.forEach((module) => {
      const parentAllowed = moduleAllowedByParent(module, next);
      const moduleAllowed = keyAllowed(module.requiredPermission) && parentAllowed;
      next[modulePermissionKey(module.id)] = moduleAllowed;
      moduleKeys(module).filter((item) => item.key !== modulePermissionKey(module.id)).forEach((item) => {
        next[item.key] = moduleAllowed && keyAllowed(item.required);
      });
    });
    onChange(next);
  };

  const clearAll = () => {
    const next = { ...value };
    modules.forEach((module) => moduleKeys(module).forEach((item) => { next[item.key] = false; }));
    onChange(next);
  };

  const countModule = (module: UiPermissionModule) => {
    const keys = moduleKeys(module);
    return keys.filter((item) => keyAllowed(item.required) && Boolean(value[item.key])).length;
  };

  const CheckRow = ({ label, detail, keyName, requiredPermission, moduleEnabled }: { label: string; detail?: string; keyName: string; requiredPermission: string | null; moduleEnabled: boolean }) => {
    const allowed = keyAllowed(requiredPermission) && moduleEnabled;
    return (
      <label className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 ${allowed ? 'border-slate-200 dark:border-slate-700 hover:border-cyan-300 dark:hover:border-cyan-700 cursor-pointer' : 'border-slate-100 dark:border-slate-800 opacity-50 cursor-not-allowed'} ${value[keyName] && allowed ? 'bg-cyan-50/60 dark:bg-cyan-900/10' : ''}`}>
        <input type="checkbox" checked={allowed && Boolean(value[keyName])} disabled={disabled || !allowed} onChange={() => toggleKey(keyName, requiredPermission)} className="mt-0.5 h-4 w-4 accent-cyan-600" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-slate-700 dark:text-slate-200">{label}</span>
          {detail && <span className="block text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{detail}</span>}
          {!moduleEnabled && <span className="block text-[10px] text-slate-400 mt-0.5">Enable sidebar access for this module first.</span>}
          {moduleEnabled && !allowed && requiredPermission && <span className="block text-[10px] text-slate-400 mt-0.5">Requires {requiredPermission.replace(/_/g, ' ')}</span>}
        </span>
      </label>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-cyan-200 dark:border-cyan-900 bg-cyan-50/60 dark:bg-cyan-950/20 p-4">
        <div className="flex items-start gap-2.5">
          <ShieldCheck className="w-5 h-5 text-cyan-700 dark:text-cyan-300 mt-0.5" />
          <div>
            <p className="font-bold text-slate-800 dark:text-slate-100">Sidebar, buttons &amp; dropdown permissions</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{overall.checked} of {overall.allowed} available selections enabled. Role and base permissions remain the maximum allowed.</p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs font-bold">
          <button type="button" disabled={disabled} onClick={selectAll} className="inline-flex items-center gap-1 text-cyan-700 dark:text-cyan-300 hover:underline disabled:opacity-40"><CheckSquare className="w-3.5 h-3.5" /> Select all</button>
          <button type="button" disabled={disabled} onClick={clearAll} className="inline-flex items-center gap-1 text-slate-500 hover:underline disabled:opacity-40"><Square className="w-3.5 h-3.5" /> Clear all</button>
        </div>
      </div>

      <div className="space-y-2">
        {modules.map((module) => {
          const open = expanded === module.id;
          const moduleKey = modulePermissionKey(module.id);
          const parentAllowed = moduleAllowedByParent(module, value);
          const moduleAllowed = keyAllowed(module.requiredPermission) && parentAllowed;
          const selectedCount = countModule(module);
          const childCount = moduleKeys(module).filter((item) => item.key !== moduleKey && keyAllowed(item.required)).length;
          return (
            <div key={module.id} className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
              <div className="flex items-center gap-2 p-3 bg-slate-50 dark:bg-slate-900/40">
                <button type="button" onClick={() => setExpanded(open ? '' : module.id)} className="flex items-center gap-2 min-w-0 flex-1 text-left">
                  {open ? <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />}
                  <span className="font-bold text-sm text-slate-800 dark:text-slate-100">{module.label}</span>
                  <span className="text-[10px] rounded-full px-2 py-0.5 bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300">{selectedCount}/{childCount + 1}</span>
                </button>
                <label className={`inline-flex items-center gap-2 text-xs font-semibold ${moduleAllowed ? 'text-slate-700 dark:text-slate-200 cursor-pointer' : 'text-slate-400 cursor-not-allowed'}`} title={moduleAllowed ? 'Show this module in the sidebar and allow direct route access' : `Role requires ${module.requiredPermission || 'no extra capability'}`}>
                  <input type="checkbox" checked={moduleAllowed && Boolean(value[moduleKey])} disabled={disabled || !moduleAllowed} onChange={(e) => updateModule(module, e.target.checked)} className="h-4 w-4 accent-cyan-600" />
                  Sidebar access
                </label>
                <button type="button" disabled={disabled} onClick={() => updateModule(module, true)} className="hidden sm:inline text-[11px] font-bold text-cyan-700 dark:text-cyan-300 hover:underline disabled:opacity-40">Select module</button>
                <button type="button" disabled={disabled} onClick={() => updateModule(module, false)} className="hidden sm:inline text-[11px] font-bold text-slate-400 hover:underline disabled:opacity-40">Clear</button>
              </div>
              {open && (
                <div className="p-3 space-y-4">
                  {module.actions.length > 0 && (
                    <section>
                      <h4 className="text-[10px] uppercase tracking-widest font-black text-slate-400 mb-2">Main buttons &amp; actions</h4>
                      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {module.actions.map((action) => (
                          <CheckRow key={action.id} keyName={actionPermissionKey(module.id, action.id)} label={action.label} detail={`${module.label} · ${action.label}`} requiredPermission={action.requiredPermission} moduleEnabled={Boolean(value[moduleKey])} />
                        ))}
                      </div>
                    </section>
                  )}
                  {module.dropdowns.length > 0 && (
                    <section className="space-y-3">
                      <h4 className="text-[10px] uppercase tracking-widest font-black text-slate-400">Dropdown options</h4>
                      {module.dropdowns.map((group) => (
                        <div key={group.id} className="rounded-lg border border-slate-100 dark:border-slate-700/70 p-3">
                          <p className="text-xs font-bold text-slate-700 dark:text-slate-200 mb-2">{group.label}</p>
                          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                            {group.options.map((option) => (
                              <CheckRow key={option.id} keyName={dropdownPermissionKey(module.id, group.id, option.id)} label={option.label} requiredPermission={option.requiredPermission} moduleEnabled={Boolean(value[moduleKey])} />
                            ))}
                          </div>
                        </div>
                      ))}
                    </section>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
