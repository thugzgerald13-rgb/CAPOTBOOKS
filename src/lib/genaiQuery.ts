// AI query helper (Run 027 / T027): wraps @google/genai (Gemini) when an API key is
// configured; otherwise falls back to rule-based responses so the UI always works.

export interface AiResponse { answer: string; sources?: string[]; confidence: 'high' | 'medium' | 'low'; }

const API_KEY_STORAGE = 'capot.geminiApiKey';
export function getGeminiApiKey(): string | null { try { return localStorage.getItem(API_KEY_STORAGE); } catch { return null; } }
export function setGeminiApiKey(key: string | null) { try { if (key) localStorage.setItem(API_KEY_STORAGE, key); else localStorage.removeItem(API_KEY_STORAGE); } catch { /* ignore */ } }

/** Rule-based fallback: answer common accounting questions from local data. */
function ruleBasedAnswer(prompt: string, context: { revenue?: number; expenses?: number; cash?: number; ar?: number; ap?: number; netIncome?: number }): AiResponse {
  const p = prompt.toLowerCase();
  if (/revenue|sales|income/.test(p) && context.revenue != null)
    return { answer: `Your total revenue is ₱${context.revenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}.`, confidence: 'high', sources: ['Profit & Loss'] };
  if (/expense/.test(p) && context.expenses != null)
    return { answer: `Total expenses are ₱${context.expenses.toLocaleString(undefined, { minimumFractionDigits: 2 })}.`, confidence: 'high', sources: ['Profit & Loss'] };
  if (/cash|balance/.test(p) && context.cash != null)
    return { answer: `Cash balance is ₱${context.cash.toLocaleString(undefined, { minimumFractionDigits: 2 })}.`, confidence: 'high', sources: ['General Ledger'] };
  if (/receivable|ar|customers? owe/.test(p) && context.ar != null)
    return { answer: `Accounts Receivable is ₱${context.ar.toLocaleString(undefined, { minimumFractionDigits: 2 })}.`, confidence: 'high', sources: ['Aging Report'] };
  if (/payable|ap|owe/.test(p) && context.ap != null)
    return { answer: `Accounts Payable is ₱${context.ap.toLocaleString(undefined, { minimumFractionDigits: 2 })}.`, confidence: 'high', sources: ['Aging Report'] };
  if (/net income|profit|loss/.test(p) && context.netIncome != null)
    return { answer: `Net income is ₱${context.netIncome.toLocaleString(undefined, { minimumFractionDigits: 2 })}.`, confidence: 'high', sources: ['Profit & Loss'] };
  if (/bir|tax|filing|deadline/.test(p))
    return { answer: 'Check the Compliance Tracker page for upcoming BIR filing deadlines and penalty estimates. Common forms: 2550Q (VAT quarterly), 1601-EQ (withholding), 1701Q (income tax).', confidence: 'medium', sources: ['Compliance Tracker'] };
  return { answer: "I can help with revenue, expenses, cash, AR/AP, net income, and BIR deadlines. Try asking 'what is my revenue?' or 'any upcoming BIR deadlines?'", confidence: 'low' };
}

/** Query Gemini (if key set) or fall back to rule-based. */
export async function queryAi(prompt: string, context: Record<string, any> = {}): Promise<AiResponse> {
  const key = getGeminiApiKey();
  if (key) {
    try {
      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey: key });
      const res = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: `You are a CAPOT Books accounting assistant. Context: ${JSON.stringify(context).slice(0, 2000)}. User question: ${prompt}. Answer concisely in PHP context.`,
      });
      return { answer: res.text || '(empty response)', confidence: 'medium' };
    } catch {
      return ruleBasedAnswer(prompt, context);
    }
  }
  return ruleBasedAnswer(prompt, context);
}

/** Auto-code a receipt/description to an account title (rule-based). */
export function autoCodeAccount(description: string): { accountTitle: string; confidence: 'high' | 'medium' | 'low' } {
  const d = description.toLowerCase();
  if (/meralco|electric|kuryente/.test(d)) return { accountTitle: 'Utilities Expense — Electricity', confidence: 'high' };
  if (/maynilad|water|tubig/.test(d)) return { accountTitle: 'Utilities Expense — Water', confidence: 'high' };
  if (/salary|sweldo|payroll|wage/.test(d)) return { accountTitle: 'Salaries Expense', confidence: 'high' };
  if (/rent|upa/.test(d)) return { accountTitle: 'Rent Expense', confidence: 'high' };
  if (/internet|pldt|converge|globe/.test(d)) return { accountTitle: 'Communication Expense', confidence: 'high' };
  if (/fuel|gas|petron|shell/.test(d)) return { accountTitle: 'Fuel & Transportation', confidence: 'medium' };
  if (/meal|food|restaurant|jollibee/.test(d)) return { accountTitle: 'Meals & Representation', confidence: 'medium' };
  if (/office supply|paper|pen/.test(d)) return { accountTitle: 'Office Supplies Expense', confidence: 'medium' };
  return { accountTitle: 'Miscellaneous Expense', confidence: 'low' };
}

/** Flag anomalies in a list of amounts (e.g., transactions > 2σ from mean). */
export function flagAnomalies(amounts: number[]): number[] {
  if (amounts.length < 3) return [];
  const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length;
  const sd = Math.sqrt(amounts.reduce((a, b) => a + (b - mean) ** 2, 0) / amounts.length);
  return amounts.map((a, i) => (sd > 0 && Math.abs(a - mean) > 2 * sd ? i : -1)).filter(i => i >= 0);
}
