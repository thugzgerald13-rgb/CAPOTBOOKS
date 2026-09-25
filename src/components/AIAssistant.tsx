import React, { useState, useRef, useEffect } from 'react';
import { Bot, Send, X, Sparkles, KeyRound } from 'lucide-react';
import { queryAi, autoCodeAccount, getGeminiApiKey, setGeminiApiKey, type AiResponse } from '../lib/genaiQuery';
import { useAccounting } from '../context/AccountingContext';

interface Msg { id: string; role: 'user' | 'ai'; text: string; confidence?: string; }

export function AIAssistant() {
  const { currentClient, showToast } = useAccounting();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([{ id: 'welcome', role: 'ai', text: "Hi! I'm your CAPOT AI assistant. Ask about revenue, expenses, cash, AR/AP, or BIR deadlines. You can also paste a receipt description to auto-code it." }]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, open]);

  const context = (() => {
    try {
      const c = currentClient as any;
      return {
        revenue: c?.plData?.revenueTotal, expenses: c?.plData?.expenseTotal,
        netIncome: c?.plData?.netIncome, cash: c?.cashBalance, ar: c?.arTotal, ap: c?.apTotal,
      };
    } catch { return {}; }
  })();

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    setMessages(m => [...m, { id: crypto.randomUUID(), role: 'user', text }]);
    setLoading(true);
    try {
      let res: AiResponse;
      // If it looks like a receipt description, auto-code it
      if (text.length < 80 && !/what|how|why|when|is|are|my|\?/.test(text.toLowerCase())) {
        const coding = autoCodeAccount(text);
        res = { answer: `Suggested account: **${coding.accountTitle}** (confidence: ${coding.confidence}). Accept this coding?`, confidence: coding.confidence };
      } else {
        res = await queryAi(text, context);
      }
      setMessages(m => [...m, { id: crypto.randomUUID(), role: 'ai', text: res.answer, confidence: res.confidence }]);
    } catch {
      setMessages(m => [...m, { id: crypto.randomUUID(), role: 'ai', text: 'Sorry, I could not process that. Try rephrasing.' }]);
    } finally { setLoading(false); }
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="fixed bottom-5 right-5 z-50 w-12 h-12 rounded-full bg-gradient-to-br from-violet-500 to-cyan-500 text-white shadow-lg shadow-violet-500/30 flex items-center justify-center hover:scale-105 transition-transform" title="AI Assistant">
        <Bot className="w-6 h-6" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-5 right-5 z-50 w-[360px] max-w-[calc(100vw-2.5rem)] rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl flex flex-col overflow-hidden" style={{ height: 480 }}>
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-violet-600 to-cyan-600 text-white">
        <div className="flex items-center gap-2"><Sparkles className="w-4 h-4" /><span className="text-sm font-bold">CAPOT AI Assistant</span></div>
        <div className="flex items-center gap-1">
          <button onClick={() => setShowKey(v => !v)} className="p-1 hover:bg-white/20 rounded" title="Set Gemini API key"><KeyRound className="w-4 h-4" /></button>
          <button onClick={() => setOpen(false)} className="p-1 hover:bg-white/20 rounded"><X className="w-4 h-4" /></button>
        </div>
      </div>
      {showKey && (
        <div className="px-3 py-2 bg-violet-50 dark:bg-violet-950/30 border-b border-violet-200 dark:border-violet-800 flex gap-2">
          <input value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="Gemini API key (optional)" type="password" className="flex-1 text-xs border border-violet-200 dark:border-violet-800 rounded px-2 py-1 bg-transparent outline-none" />
          <button onClick={() => { setGeminiApiKey(apiKey || null); setShowKey(false); showToast(apiKey ? 'API key saved' : 'API key cleared'); }} className="text-xs font-bold px-2 py-1 bg-violet-600 text-white rounded">Save</button>
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {messages.map(m => (
          <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-xl px-3 py-2 text-xs ${m.role === 'user' ? 'bg-violet-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200'}`}>
              {m.text}
              {m.confidence && <div className="text-[9px] opacity-60 mt-1">confidence: {m.confidence}</div>}
            </div>
          </div>
        ))}
        {loading && <div className="text-xs text-slate-400 px-2">Thinking…</div>}
        <div ref={endRef} />
      </div>
      <div className="p-2 border-t border-slate-200 dark:border-slate-700 flex gap-2">
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} placeholder={getGeminiApiKey() ? 'Ask anything…' : 'Ask about revenue/expenses/cash…'} className="flex-1 text-xs border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 bg-transparent outline-none focus:border-violet-500" />
        <button onClick={send} disabled={loading || !input.trim()} className="p-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-40"><Send className="w-4 h-4" /></button>
      </div>
    </div>
  );
}
