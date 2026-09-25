import React, { useState } from 'react';
import { PageHeader } from './ui/PageHeader';
import { useAccounting } from '../context/AccountingContext';
import { Plug, KeyRound, Webhook, CreditCard, Plus, Trash2, Copy, Check, Eye, EyeOff } from 'lucide-react';
import { generateApiKey, listApiKeys, revokeApiKey, listWebhooks, saveWebhook, deleteWebhook, generateWebhookSecret, listGateways, saveGateway, WEBHOOK_EVENTS, type ApiKey, type WebhookConfig, type PaymentGateway } from '../lib/apiKeys';

type Tab = 'keys' | 'webhooks' | 'payments';

export function Integrations() {
  const { showToast } = useAccounting();
  const [tab, setTab] = useState<Tab>('keys');
  const [keys, setKeys] = useState<ApiKey[]>(() => listApiKeys());
  const [webhooks, setWebhooks] = useState<WebhookConfig[]>(() => listWebhooks());
  const [gateways, setGateways] = useState<PaymentGateway[]>(() => listGateways());
  const [newKeyLabel, setNewKeyLabel] = useState('');
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [newWebhookUrl, setNewWebhookUrl] = useState('');
  const [newWebhookEvents, setNewWebhookEvents] = useState<string[]>(['invoice.paid']);
  const [copied, setCopied] = useState<string | null>(null);

  const copy = (text: string, id: string) => {
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopied(id); setTimeout(() => setCopied(null), 1500);
    showToast('Copied to clipboard');
  };

  const handleGenerateKey = () => {
    if (!newKeyLabel.trim()) return;
    const k = generateApiKey(newKeyLabel.trim());
    setKeys(listApiKeys());
    setRevealedKey(k.key);
    setNewKeyLabel('');
    showToast('API key generated — copy it now, it will not be shown again');
  };

  const handleRevoke = (id: string) => { revokeApiKey(id); setKeys(listApiKeys()); showToast('API key revoked'); };

  const handleAddWebhook = () => {
    if (!newWebhookUrl.trim()) return;
    const w: WebhookConfig = { id: crypto.randomUUID(), url: newWebhookUrl.trim(), events: newWebhookEvents, active: true, secret: generateWebhookSecret(), createdAt: new Date().toISOString() };
    saveWebhook(w); setWebhooks(listWebhooks()); setNewWebhookUrl('');
    showToast('Webhook endpoint added');
  };

  const toggleGateway = (g: PaymentGateway) => {
    const next = { ...g, enabled: !g.enabled };
    saveGateway(next); setGateways(listGateways());
    showToast(`${g.name} ${next.enabled ? 'enabled' : 'disabled'}`);
  };

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'keys', label: 'API Keys', icon: <KeyRound className="w-3.5 h-3.5" /> },
    { id: 'webhooks', label: 'Webhooks', icon: <Webhook className="w-3.5 h-3.5" /> },
    { id: 'payments', label: 'Payment Gateways', icon: <CreditCard className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="w-full flex flex-col">
      <PageHeader title="Integrations & API" icon={<Plug className="text-violet-500" />} centered />
      <div className="px-4 md:px-6 flex-1 max-w-4xl mx-auto w-full">
        <div className="inline-flex rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden mb-4 text-xs font-bold">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`px-4 py-2 inline-flex items-center gap-1.5 ${tab === t.id ? 'bg-violet-600 text-white' : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300'}`}>
              {t.icon}{t.label}
            </button>
          ))}
        </div>

        {tab === 'keys' && (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Generate New API Key</div>
              <div className="flex gap-2">
                <input value={newKeyLabel} onChange={e => setNewKeyLabel(e.target.value)} placeholder="e.g. Zapier integration" className="flex-1 text-sm border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 bg-transparent outline-none" />
                <button onClick={handleGenerateKey} className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg bg-violet-600 hover:bg-violet-700 text-white"><Plus className="w-3.5 h-3.5" /> Generate</button>
              </div>
              {revealedKey && (
                <div className="mt-3 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 p-3 flex items-center gap-2">
                  <code className="flex-1 text-xs font-mono text-emerald-700 dark:text-emerald-300 break-all">{revealedKey}</code>
                  <button onClick={() => copy(revealedKey, 'newkey')} className="p-1.5 text-emerald-600 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 rounded">{copied === 'newkey' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}</button>
                  <button onClick={() => setRevealedKey(null)} className="p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded"><EyeOff className="w-4 h-4" /></button>
                </div>
              )}
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-400 uppercase text-[10px]"><tr><th className="text-left px-3 py-2">Label</th><th className="text-left px-3 py-2">Key</th><th className="text-left px-3 py-2">Created</th><th className="text-left px-3 py-2">Status</th><th></th></tr></thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {keys.length === 0 && <tr><td colSpan={5} className="text-center py-8 text-slate-400">No API keys yet.</td></tr>}
                  {keys.map(k => (
                    <tr key={k.id} className={k.revoked ? 'opacity-40' : ''}>
                      <td className="px-3 py-2 font-semibold text-slate-700 dark:text-slate-200">{k.label}</td>
                      <td className="px-3 py-2 font-mono text-slate-500">{k.prefix}</td>
                      <td className="px-3 py-2 text-slate-400">{new Date(k.createdAt).toLocaleDateString()}</td>
                      <td className="px-3 py-2">{k.revoked ? <span className="text-rose-500 font-bold">Revoked</span> : <span className="text-emerald-500 font-bold">Active</span>}</td>
                      <td className="px-3 py-2 text-right">{!k.revoked && <button onClick={() => handleRevoke(k.id)} className="p-1 text-slate-300 hover:text-rose-500"><Trash2 className="w-3.5 h-3.5" /></button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'webhooks' && (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Add Webhook Endpoint</div>
              <input value={newWebhookUrl} onChange={e => setNewWebhookUrl(e.target.value)} placeholder="https://your-server.com/capot/webhook" className="w-full text-sm border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 bg-transparent outline-none mb-3" />
              <div className="flex flex-wrap gap-2 mb-3">
                {WEBHOOK_EVENTS.map(ev => (
                  <label key={ev} className="text-[11px] inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer">
                    <input type="checkbox" checked={newWebhookEvents.includes(ev)} onChange={() => setNewWebhookEvents(prev => prev.includes(ev) ? prev.filter(e => e !== ev) : [...prev, ev])} className="accent-violet-600" /> {ev}
                  </label>
                ))}
              </div>
              <button onClick={handleAddWebhook} className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg bg-violet-600 hover:bg-violet-700 text-white"><Plus className="w-3.5 h-3.5" /> Add Endpoint</button>
            </div>
            <div className="space-y-2">
              {webhooks.length === 0 && <div className="text-center py-8 text-slate-400 text-sm">No webhook endpoints configured.</div>}
              {webhooks.map(w => (
                <div key={w.id} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate">{w.url}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">{w.events.join(', ')} · secret: <code className="font-mono">{w.secret.slice(0, 12)}••••</code></div>
                  </div>
                  <button onClick={() => copy(w.secret, w.id)} className="p-1.5 text-slate-400 hover:text-violet-600" title="Copy secret">{copied === w.id ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}</button>
                  <button onClick={() => { deleteWebhook(w.id); setWebhooks(listWebhooks()); showToast('Webhook deleted'); }} className="p-1.5 text-slate-300 hover:text-rose-500"><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'payments' && (
          <div className="grid sm:grid-cols-2 gap-3">
            {gateways.map(g => (
              <div key={g.id} className={`rounded-xl border p-4 ${g.enabled ? 'border-violet-300 dark:border-violet-700 bg-violet-50 dark:bg-violet-950/20' : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'}`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="text-sm font-black text-slate-800 dark:text-slate-100">{g.name}</div>
                  <button onClick={() => toggleGateway(g)} className={`relative w-10 h-5 rounded-full transition-colors ${g.enabled ? 'bg-violet-500' : 'bg-slate-300 dark:bg-slate-600'}`}>
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${g.enabled ? 'left-[22px]' : 'left-0.5'}`} />
                  </button>
                </div>
                {g.enabled && (
                  <div className="space-y-2">
                    <input value={g.publicKey} onChange={e => { const n = { ...g, publicKey: e.target.value }; saveGateway(n); setGateways(listGateways()); }} placeholder="Public key" className="w-full text-xs border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 bg-transparent outline-none" />
                    <input value={g.secretKey} onChange={e => { const n = { ...g, secretKey: e.target.value }; saveGateway(n); setGateways(listGateways()); }} placeholder="Secret key" type="password" className="w-full text-xs border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 bg-transparent outline-none" />
                    <div className="text-[10px] text-slate-400">Webhook URL: <code className="font-mono">https://api.capotbooks.com/webhooks/{g.id}</code></div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
