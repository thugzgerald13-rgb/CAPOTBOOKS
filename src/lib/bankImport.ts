// Bank statement import (CSV & OFX/QBO) for Philippine banks & e-wallets:
// BDO, BPI, UnionBank, Metrobank, GCash, Maya, and standard OFX/QBO exports.
import Papa from 'papaparse';

export interface BankTxn {
  id: string;
  date: string; // ISO yyyy-mm-dd
  description: string;
  amount: number; // positive = money in (credit/deposit), negative = money out (debit/withdrawal)
  balance?: number;
  reference?: string;
  raw: Record<string, string>;
}

export interface ParsedBankStatement {
  transactions: BankTxn[];
  detectedBank: string;
  endingBalance?: number;
  statementEndDate?: string;
}

const toISO = (s: string): string => {
  const raw = String(s || '').trim();
  if (!raw) return '';
  // 1. Explicit YYYY-MM-DD or YYYY/MM/DD
  const isoMatch = raw.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${String(isoMatch[2]).padStart(2, '0')}-${String(isoMatch[3]).padStart(2, '0')}`;
  }
  // 2. DD/MM/YYYY or MM/DD/YYYY (optionally followed by time, e.g. GCash "11/28/2026 14:30")
  const m = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (m) {
    const first = parseInt(m[1], 10);
    const second = parseInt(m[2], 10);
    const yy = parseInt(m[3], 10);
    const year = yy < 100 ? 2000 + yy : yy;
    // Philippine bank CSVs (BDO/BPI/GCash) commonly use MM/DD/YYYY; if first > 12 it is DD/MM/YYYY.
    const isDayFirst = first > 12;
    const mm = isDayFirst ? second : first;
    const dd = isDayFirst ? first : second;
    return `${year}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
  }
  const d = new Date(raw);
  if (!isNaN(d.getTime())) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  return raw;
};

const num = (s: string): number => {
  const raw = String(s || '').trim();
  if (!raw || raw === '-' || raw === '—') return 0;
  const isParenNegative = /^\(.*\)$/.test(raw);
  const cleaned = raw.replace(/[,₱$PHPphp()\s]/g, '');
  const n = parseFloat(cleaned);
  if (!isFinite(n)) return 0;
  return isParenNegative ? -Math.abs(n) : n;
};

function detectBankLabel(filename: string, text: string): string {
  const hay = `${filename} ${text.slice(0, 600)}`.toLowerCase();
  if (hay.includes('gcash')) return 'GCash';
  if (hay.includes('maya') || hay.includes('paymaya')) return 'Maya';
  if (hay.includes('bdo')) return 'BDO';
  if (hay.includes('bpi') || hay.includes('bank of the philippine islands')) return 'BPI';
  if (hay.includes('unionbank')) return 'UnionBank';
  if (hay.includes('metrobank')) return 'Metrobank';
  if (hay.includes('<stmttrn>') || /\.ofx$|\.qbo$/i.test(filename)) return 'OFX / QBO Statement';
  return 'Bank CSV';
}

/** Skip bank-export metadata preamble lines (e.g. "Account Name: ...", blank rows)
 *  until the actual CSV column header row is found. */
function stripPreamble(text: string): string {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  const headerIdx = lines.findIndex((line) => {
    const low = line.toLowerCase();
    const hasDate = /\b(date|posting date|transaction date|value date|date & time|date and time)\b/.test(low);
    const hasMoney = /\b(debit|credit|amount|withdrawal|deposit|cash in|cash out|balance|money in|money out)\b/.test(low);
    return hasDate && hasMoney && line.includes(',');
  });
  return headerIdx > 0 ? lines.slice(headerIdx).join('\n') : text.replace(/^\uFEFF/, '');
}

/** Parse a bank CSV (BDO/BPI/UnionBank/Metrobank/GCash/Maya) into normalized transactions. */
export function parseBankCsv(text: string): BankTxn[] {
  const cleanedText = stripPreamble(text).trim();
  if (!cleanedText) return [];
  const res = Papa.parse(cleanedText, { header: true, skipEmptyLines: true });
  const rows = (res.data || []) as Record<string, string>[];
  if (!rows.length) return [];

  const keys = Object.keys(rows[0]).map(k => k.trim());
  const dateKey = keys.find(k => /^(posting|transaction|value)?\s*date/i.test(k)) || keys.find(k => /date/i.test(k)) || keys[0];
  const descKey = keys.find(k => /description|particular|transaction details|details|narration|remarks|merchant/i.test(k))
    || keys.find(k => /type|name|memo/i.test(k))
    || keys[1] || '';
  const refKey = keys.find(k => /ref(erence)?|check|cheque|trace|trans(action)?\s*(id|no)/i.test(k));
  const debitKey = keys.find(k => /debit|withdrawal|payment|money out|cash out|sent|amount debited|^dr$/i.test(k));
  const creditKey = keys.find(k => /credit|deposit|received|money in|cash in|amount credited|^cr$/i.test(k));
  const amtKey = keys.find(k => /^(net\s*)?amount$|^transaction\s*amount$/i.test(k));
  const balKey = keys.find(k => /running\s*balance|ending\s*balance|available\s*balance|^balance$/i.test(k))
    || keys.find(k => /balance/i.test(k));

  return rows.map((r, i) => {
    const raw: Record<string, string> = {};
    Object.entries(r).forEach(([k, v]) => { raw[String(k).trim()] = String(v ?? '').trim(); });
    const debit = debitKey ? Math.abs(num(raw[debitKey])) : 0;
    const credit = creditKey ? Math.abs(num(raw[creditKey])) : 0;
    const amount = amtKey && !debitKey && !creditKey ? num(raw[amtKey]) : (credit - debit || (amtKey ? num(raw[amtKey]) : 0));
    const date = toISO(raw[dateKey] || '');
    const description = raw[descKey] || (refKey ? raw[refKey] : '') || '';
    const reference = refKey ? raw[refKey] : undefined;
    const balance = balKey && raw[balKey] ? num(raw[balKey]) : undefined;
    return {
      id: `btxn-${i}-${date}-${Math.round(amount * 100)}`,
      date,
      description,
      amount: Math.round(amount * 100) / 100,
      balance,
      reference,
      raw,
    };
  }).filter(t => t.date && (t.description || t.amount !== 0));
}

/** Parse OFX/QBO files (supports both XML and SGML tag styles). */
export function parseOfx(text: string): BankTxn[] {
  const txns: BankTxn[] = [];
  // Match either <STMTTRN>...</STMTTRN> or SGML <STMTTRN> up to the next <STMTTRN> / </BANKTRANLIST>
  const blocks = text.match(/<STMTTRN>[\s\S]*?(?=<\/STMTTRN>|<STMTTRN>|<\/BANKTRANLIST>|$)/gi) || [];
  blocks.forEach((b, i) => {
    const readTag = (tag: string) => {
      const m = b.match(new RegExp(`<${tag}>([^<\\r\\n]+)`, 'i'));
      return m ? m[1].trim() : '';
    };
    const dt = readTag('DTPOSTED');
    const trnType = readTag('TRNTYPE');
    const rawAmt = parseFloat(readTag('TRNAMT').replace(/,/g, '') || '0') || 0;
    const name = readTag('NAME');
    const memo = readTag('MEMO');
    const fitid = readTag('FITID') || readTag('CHECKNUM');
    const date = dt.length >= 8 ? `${dt.slice(0, 4)}-${dt.slice(4, 6)}-${dt.slice(6, 8)}` : '';
    const amount = rawAmt < 0
      ? rawAmt
      : (/debit|check|fee|payment|pos|atm/i.test(trnType) ? -Math.abs(rawAmt) : Math.abs(rawAmt));
    txns.push({
      id: fitid ? `ofx-${fitid}` : `ofx-${i}-${date}-${Math.round(amount * 100)}`,
      date,
      description: [name, memo].filter(Boolean).join(' — ').trim(),
      amount: Math.round(amount * 100) / 100,
      reference: fitid || undefined,
      raw: { trnType, name, memo, fitid },
    });
  });
  return txns.filter(t => t.date && (t.description || t.amount !== 0));
}

/** Detect format by content and parse into normalized transactions. */
export function parseBankStatement(filename: string, text: string): BankTxn[] {
  if (/\.ofx$|\.qbo$/i.test(filename) || /<STMTTRN>/i.test(text)) return parseOfx(text);
  return parseBankCsv(text);
}

/** Parse statement plus detected bank label, ending balance, and statement end date. */
export function parseBankStatementDetailed(filename: string, text: string): ParsedBankStatement {
  const isOfx = /\.ofx$|\.qbo$/i.test(filename) || /<STMTTRN>/i.test(text);
  const transactions = isOfx ? parseOfx(text) : parseBankCsv(text);
  const detectedBank = detectBankLabel(filename, text);

  let endingBalance: number | undefined;
  let statementEndDate: string | undefined;

  if (isOfx) {
    const balMatch = text.match(/<LEDGERBAL>[\s\S]*?<BALAMT>([^<\r\n]+)/i);
    if (balMatch) endingBalance = num(balMatch[1]);
    const dtMatch = text.match(/<DTEND>(\d{8})/i) || text.match(/<DTASOF>(\d{8})/i);
    if (dtMatch) statementEndDate = `${dtMatch[1].slice(0, 4)}-${dtMatch[1].slice(4, 6)}-${dtMatch[1].slice(6, 8)}`;
  } else if (transactions.length > 0) {
    // Pick balance from the latest-dated row that carries a running balance
    const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date));
    statementEndDate = sorted[sorted.length - 1]?.date;
    for (let i = sorted.length - 1; i >= 0; i--) {
      if (typeof sorted[i].balance === 'number' && isFinite(sorted[i].balance!)) {
        endingBalance = sorted[i].balance;
        break;
      }
    }
  }

  return { transactions, detectedBank, endingBalance, statementEndDate };
}

export const SAMPLE_PH_BANK_CSV = [
  'Date,Reference,Description,Debit,Credit,Balance',
  '2026-11-28,INV-001,Deposit - Customer Collection,,11200.00,11200.00',
  '2026-11-28,PUR-001,Withdrawal - Supplier Payment,5600.00,,5600.00',
  '2026-11-28,BANK-CHG,Monthly Bank Service Charge,150.00,,5450.00',
].join('\n');
