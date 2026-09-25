// Bank statement import (Run 019 / T019): parse CSV (BPI/BPI/Metrobank-style) and OFX
// into a normalized transaction list for reconciliation. papaparse is already a dependency.
import Papa from 'papaparse';

export interface BankTxn {
  id: string;
  date: string; // ISO yyyy-mm-dd
  description: string;
  amount: number; // positive = money in (credit), negative = money out (debit)
  balance?: number;
  raw: Record<string, string>;
}

const toISO = (s: string): string => {
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  // try dd/mm/yyyy
  const m = s.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (m) {
    const dd = parseInt(m[1]), mm = parseInt(m[2]), yy = parseInt(m[3]);
    const year = yy < 100 ? 2000 + yy : yy;
    return `${year}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
  }
  return s;
};

const num = (s: string): number => {
  const n = parseFloat(String(s || '').replace(/[,₱\s]/g, ''));
  return isFinite(n) ? n : 0;
};

/** Parse a bank CSV into normalized transactions. Auto-detects date/description/amount columns. */
export function parseBankCsv(text: string): BankTxn[] {
  const res = Papa.parse(text.trim(), { header: true, skipEmptyLines: true });
  const rows = (res.data || []) as Record<string, string>[];
  if (!rows.length) return [];
  const keys = Object.keys(rows[0]).map(k => k.trim());
  const dateKey = keys.find(k => /date/i.test(k)) || keys[0];
  const descKey = keys.find(k => /description|particular|narration|ref|name/i.test(k)) || keys[1] || '';
  const debitKey = keys.find(k => /debit|withdrawal|payment|money out/i.test(k));
  const creditKey = keys.find(k => /credit|deposit|received|money in/i.test(k));
  const amtKey = keys.find(k => /^amount$/i.test(k));
  const balKey = keys.find(k => /balance/i.test(k));
  return rows.map((r, i) => {
    const raw: Record<string, string> = {};
    Object.entries(r).forEach(([k, v]) => { raw[String(k).trim()] = String(v || ''); });
    const debit = debitKey ? num(raw[debitKey]) : 0;
    const credit = creditKey ? num(raw[creditKey]) : 0;
    const amount = amtKey ? num(raw[amtKey]) : credit - debit;
    return {
      id: `btxn-${i}-${Date.now()}`,
      date: toISO(raw[dateKey] || ''),
      description: raw[descKey] || '',
      amount,
      balance: balKey ? num(raw[balKey]) : undefined,
      raw,
    };
  }).filter(t => t.description || t.amount !== 0);
}

/** Parse a basic OFX/QBO file (STMTTRN blocks) into normalized transactions. */
export function parseOfx(text: string): BankTxn[] {
  const txns: BankTxn[] = [];
  const blocks = text.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi) || [];
  blocks.forEach((b, i) => {
    const dt = (b.match(/<DTPOSTED>([^<]+)/) || [])[1] || '';
    const trnType = (b.match(/<TRNTYPE>([^<]+)/) || [])[1] || '';
    const amt = parseFloat((b.match(/<TRNAMT>([^<]+)/) || [])[1] || '0') || 0;
    const name = (b.match(/<NAME>([^<]+)/) || [])[1] || '';
    const memo = (b.match(/<MEMO>([^<]+)/) || [])[1] || '';
    const date = dt.length >= 8 ? `${dt.slice(0, 4)}-${dt.slice(4, 6)}-${dt.slice(6, 8)}` : '';
    const amount = /debit/i.test(trnType) ? -Math.abs(amt) : Math.abs(amt);
    txns.push({ id: `ofx-${i}-${Date.now()}`, date, description: `${name} ${memo}`.trim(), amount, raw: { trnType, name, memo } });
  });
  return txns;
}

/** Detect format by content and parse. */
export function parseBankStatement(filename: string, text: string): BankTxn[] {
  if (/\.ofx$|\.qbo$/i.test(filename) || text.includes('<STMTTRN>')) return parseOfx(text);
  return parseBankCsv(text);
}
