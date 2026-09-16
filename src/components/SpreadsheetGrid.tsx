import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// ===========================================================================
// SpreadsheetGrid — an Excel-style editable grid.
// Column letters (A, B, C…), row numbers (1, 2, 3…), cell selection range,
// inline editing, keyboard navigation, copy/paste (TSV), a formula bar, and
// a small formula engine (=A1+B2, =SUM(B5:B9), =ROUND(…,2), etc.).
// ===========================================================================

export interface CellData {
  /** raw value: number as string, text, or formula starting with "=" */
  v?: string;
  fmt?: 'currency' | 'number' | 'text' | 'percent';
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  doubleUnderline?: boolean;
  align?: 'left' | 'right' | 'center';
  indent?: number;
  bg?: string;
  color?: string;
  /** formula / computed cells are protected from direct editing by default */
  locked?: boolean;
  /** horizontal merge span (number of columns this cell covers) */
  merge?: number;
}

export type CellMap = Record<string, CellData>; // key = "c,r" (0-indexed)

export const cellKey = (c: number, r: number) => `${c},${r}`;

export function colToLetter(c: number): string {
  let s = '';
  let n = c + 1;
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
export function letterToCol(s: string): number {
  let c = 0;
  for (const ch of s.toUpperCase()) c = c * 26 + (ch.charCodeAt(0) - 64);
  return c - 1;
}
const CELL_REF_RE = /^([A-Z]+)([0-9]+)$/;
function parseCellRef(tok: string): { c: number; r: number } | null {
  const m = tok.match(CELL_REF_RE);
  if (!m) return null;
  return { c: letterToCol(m[1]), r: parseInt(m[2], 10) - 1 };
}

// ---------------------------------------------------------------------------
// Formula engine
// ---------------------------------------------------------------------------
type Tok = { t: 'num' | 'ident' | 'op' | 'lparen' | 'rparen' | 'comma' | 'colon'; v: string };
function tokenize(expr: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (/[0-9.]/.test(ch)) {
      let j = i;
      while (j < expr.length && /[0-9.]/.test(expr[j])) j++;
      toks.push({ t: 'num', v: expr.slice(i, j) }); i = j; continue;
    }
    if (/[A-Za-z]/.test(ch)) {
      let j = i;
      while (j < expr.length && /[A-Za-z0-9]/.test(expr[j])) j++;
      toks.push({ t: 'ident', v: expr.slice(i, j).toUpperCase() }); i = j; continue;
    }
    if (ch === ':') { toks.push({ t: 'colon', v: ':' }); i++; continue; }
    if (ch === '(') { toks.push({ t: 'lparen', v: '(' }); i++; continue; }
    if (ch === ')') { toks.push({ t: 'rparen', v: ')' }); i++; continue; }
    if (ch === ',') { toks.push({ t: 'comma', v: ',' }); i++; continue; }
    if ('+-*/'.includes(ch)) { toks.push({ t: 'op', v: ch }); i++; continue; }
    i++; // ignore unknown chars
  }
  return toks;
}

export interface EvalResult { num: number | null; str?: string; error?: string; }

class Parser {
  pos = 0;
  constructor(public toks: Tok[], public cells: CellMap, public stack: Set<string>) {}
  peek() { return this.toks[this.pos]; }
  next() { return this.toks[this.pos++]; }
  eof() { return this.pos >= this.toks.length; }

  parseExpr(): number {
    let left = this.parseTerm();
    while (!this.eof() && this.peek().t === 'op' && (this.peek().v === '+' || this.peek().v === '-')) {
      const op = this.next().v;
      const right = this.parseTerm();
      left = op === '+' ? left + right : left - right;
    }
    return left;
  }
  parseTerm(): number {
    let left = this.parseFactor();
    while (!this.eof() && this.peek().t === 'op' && (this.peek().v === '*' || this.peek().v === '/')) {
      const op = this.next().v;
      const right = this.parseFactor();
      if (op === '/') {
        if (right === 0) throw '#DIV/0!';
        left = left / right;
      } else left = left * right;
    }
    return left;
  }
  parseFactor(): number {
    if (this.eof()) throw '#VALUE!';
    const tok = this.peek();
    if (tok.t === 'op' && tok.v === '-') { this.next(); return -this.parseFactor(); }
    if (tok.t === 'op' && tok.v === '+') { this.next(); return this.parseFactor(); }
    if (tok.t === 'lparen') {
      this.next();
      const v = this.parseExpr();
      if (!this.eof() && this.peek().t === 'rparen') this.next();
      return v;
    }
    if (tok.t === 'num') { this.next(); const n = parseFloat(tok.v); return Number.isFinite(n) ? n : 0; }
    if (tok.t === 'ident') {
      // function call?
      if (this.pos + 1 < this.toks.length && this.toks[this.pos + 1].t === 'lparen') {
        return this.parseFunction();
      }
      // cell ref
      this.next();
      const ref = parseCellRef(tok.v);
      if (!ref) throw '#NAME?';
      return evalCellNumeric(ref.c, ref.r, this.cells, this.stack);
    }
    throw '#VALUE!';
  }
  parseFunction(): number {
    const name = this.next().v;
    this.next(); // consume '('
    const args: number[] = [];
    while (!this.eof() && this.peek().t !== 'rparen') {
      // range? ident : ident
      if (this.peek().t === 'ident' && this.pos + 1 < this.toks.length && this.toks[this.pos + 1].t === 'colon' && this.pos + 2 < this.toks.length && this.toks[this.pos + 2].t === 'ident') {
        const a = parseCellRef(this.next().v)!;
        this.next(); // colon
        const b = parseCellRef(this.next().v)!;
        const c1 = Math.min(a.c, b.c), c2 = Math.max(a.c, b.c);
        const r1 = Math.min(a.r, b.r), r2 = Math.max(a.r, b.r);
        for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) {
          args.push(evalCellNumeric(c, r, this.cells, this.stack));
        }
      } else {
        args.push(this.parseExpr());
      }
      if (!this.eof() && this.peek().t === 'comma') this.next();
    }
    if (!this.eof() && this.peek().t === 'rparen') this.next();
    switch (name) {
      case 'SUM': return args.reduce((s, x) => s + x, 0);
      case 'AVERAGE': case 'AVG': return args.length ? args.reduce((s, x) => s + x, 0) / args.length : 0;
      case 'MAX': return args.length ? Math.max(...args) : 0;
      case 'MIN': return args.length ? Math.min(...args) : 0;
      case 'COUNT': return args.length;
      case 'ROUND': return args.length ? Math.round(args[0] * Math.pow(10, args[1] || 0)) / Math.pow(10, args[1] || 0) : 0;
      case 'ABS': return args.length ? Math.abs(args[0]) : 0;
      default: throw '#NAME?';
    }
  }
}

function evalCellNumeric(c: number, r: number, cells: CellMap, stack: Set<string>): number {
  const res = evalCell(c, r, cells, stack);
  if (res.error) throw res.error;
  if (res.num !== null) return res.num;
  return 0;
}

export function evalCell(c: number, r: number, cells: CellMap, stack?: Set<string>): EvalResult {
  const key = cellKey(c, r);
  const st = stack || new Set<string>();
  if (st.has(key)) return { num: null, error: '#CIRC!' };
  const cell = cells[key];
  if (!cell || cell.v === undefined || cell.v === '') return { num: 0 };
  const v = String(cell.v).trim();
  if (!v.startsWith('=')) {
    const n = parseFloat(v.replace(/,/g, ''));
    if (Number.isFinite(n) && /^-?[\d,]*\.?\d*$/.test(v.replace(/,/g, ''))) return { num: n };
    return { num: null, str: v };
  }
  st.add(key);
  try {
    const p = new Parser(tokenize(v.slice(1)), cells, st);
    const n = p.parseExpr();
    st.delete(key);
    if (!Number.isFinite(n)) return { num: null, error: '#VALUE!' };
    return { num: n };
  } catch (e: any) {
    st.delete(key);
    return { num: null, error: typeof e === 'string' ? e : '#ERROR!' };
  }
}

export function formatCellValue(cell: CellData | undefined, ev: EvalResult): string {
  if (ev.error) return ev.error;
  if (ev.num !== null) {
    const n = ev.num;
    if (cell?.fmt === 'percent') return `${(n * 100).toFixed(2)}%`;
    if (cell?.fmt === 'number') {
      const abs = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      return n < 0 ? `(${abs})` : abs;
    }
    if (cell?.fmt === 'currency' || cell?.fmt === undefined) {
      const abs = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      return n < 0 ? `(${abs})` : abs;
    }
    return String(n);
  }
  return ev.str ?? '';
}

// ---------------------------------------------------------------------------
// Grid component
// ---------------------------------------------------------------------------
export interface SpreadsheetGridProps {
  cells: CellMap;
  colCount: number;
  rowCount: number;
  colWidths: number[];
  rowHeight?: number;
  protected?: boolean; // when true, locked cells cannot be edited
  onCellsChange: (cells: CellMap) => void;
  onSelectionChange?: (sel: { c1: number; r1: number; c2: number; r2: number } | null, active: { c: number; r: number } | null) => void;
  onActiveCellChange?: (active: { c: number; r: number } | null, rawValue: string) => void;
  className?: string;
}

interface Pos { c: number; r: number; }
interface Range { c1: number; r1: number; c2: number; r2: number; }

export function SpreadsheetGrid({
  cells, colCount, rowCount, colWidths, rowHeight = 26,
  protected: protectedMode = true,
  onCellsChange, onSelectionChange, onActiveCellChange, className = '',
}: SpreadsheetGridProps) {
  const [active, setActive] = useState<Pos | null>(null);
  const [sel, setSel] = useState<Range | null>(null);
  const [editing, setEditing] = useState<(Pos & { val: string }) | null>(null);
  const [dragging, setDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  const normSel = useMemo<Range | null>(() => {
    if (!sel) return null;
    return { c1: Math.min(sel.c1, sel.c2), r1: Math.min(sel.r1, sel.r2), c2: Math.max(sel.c1, sel.c2), r2: Math.max(sel.r1, sel.r2) };
  }, [sel]);

  const activeCellRaw = active ? (cells[cellKey(active.c, active.r)]?.v ?? '') : '';

  useEffect(() => {
    if (onSelectionChange) onSelectionChange(normSel, active);
  }, [normSel, active]); // eslint-disable-line
  useEffect(() => {
    if (onActiveCellChange) onActiveCellChange(active, activeCellRaw);
  }, [active, activeCellRaw]); // eslint-disable-line
  useEffect(() => {
    if (editing && editInputRef.current) { editInputRef.current.focus(); editInputRef.current.select(); }
  }, [editing]);

  const inSelection = useCallback((c: number, r: number) => {
    if (!normSel) return false;
    return c >= normSel.c1 && c <= normSel.c2 && r >= normSel.r1 && r <= normSel.r2;
  }, [normSel]);

  const setCell = useCallback((c: number, r: number, patch: Partial<CellData> | null) => {
    const key = cellKey(c, r);
    const next = { ...cells };
    const existing = next[key] ? { ...next[key] } : {};
    if (patch === null) { delete next[key]; }
    else {
      const merged = { ...existing, ...patch };
      // remove cell entirely if empty and no styling
      if ((merged.v === undefined || merged.v === '') && !merged.bold && !merged.italic && !merged.underline && !merged.doubleUnderline && !merged.align && !merged.indent && !merged.bg && !merged.color && !merged.locked && !merged.merge && !merged.fmt) {
        delete next[key];
      } else next[key] = merged;
    }
    onCellsChange(next);
  }, [cells, onCellsChange]);

  const setActiveAndSel = useCallback((c: number, r: number) => {
    const p = { c, r };
    setActive(p);
    setSel({ c1: c, r1: r, c2: c, r2: r });
  }, []);

  const commitEdit = useCallback((move?: 'down' | 'right' | null) => {
    if (!editing) return;
    const { c, r, val } = editing;
    setCell(c, r, { ...(cells[cellKey(c, r)] || {}), v: val });
    setEditing(null);
    if (move === 'down') setActiveAndSel(c, Math.min(r + 1, rowCount - 1));
    if (move === 'right') setActiveAndSel(Math.min(c + 1, colCount - 1), r);
  }, [editing, setCell, cells, rowCount, colCount, setActiveAndSel]);

  const startEdit = useCallback((c: number, r: number, initial?: string) => {
    const cell = cells[cellKey(c, r)];
    if (protectedMode && cell?.locked) return;
    setEditing({ c, r, val: initial !== undefined ? initial : (cell?.v ?? '') });
  }, [cells, protectedMode]);

  const clearSelection = useCallback(() => {
    if (!normSel) return;
    const next = { ...cells };
    for (let r = normSel.r1; r <= normSel.r2; r++) {
      for (let c = normSel.c1; c <= normSel.c2; c++) {
        const key = cellKey(c, r);
        const cell = next[key];
        if (protectedMode && cell?.locked) continue;
        if (cell) {
          const { v: _v, ...rest } = cell;
          if (Object.keys(rest).length) next[key] = rest; else delete next[key];
        }
      }
    }
    onCellsChange(next);
  }, [normSel, cells, onCellsChange, protectedMode]);

  const copySelection = useCallback(async (cut: boolean) => {
    if (!normSel) return;
    const lines: string[] = [];
    for (let r = normSel.r1; r <= normSel.r2; r++) {
      const rowCells: string[] = [];
      for (let c = normSel.c1; c <= normSel.c2; c++) {
        rowCells.push(cells[cellKey(c, r)]?.v ?? '');
      }
      lines.push(rowCells.join('\t'));
    }
    const text = lines.join('\n');
    try { await navigator.clipboard.writeText(text); } catch { /* ignore */ }
    if (cut) clearSelection();
  }, [normSel, cells, clearSelection]);

  const pasteFromClipboard = useCallback(async () => {
    if (!active) return;
    let text = '';
    try { text = await navigator.clipboard.readText(); } catch { return; }
    if (!text) return;
    const rows = text.replace(/\r\n?/g, '\n').split('\n').map(l => l.split('\t'));
    const next = { ...cells };
    rows.forEach((rowCells, ri) => {
      rowCells.forEach((val, ci) => {
        const c = active.c + ci, r = active.r + ri;
        if (c >= colCount || r >= rowCount) return;
        const key = cellKey(c, r);
        const existing = next[key] || {};
        if (protectedMode && existing.locked) return;
        next[key] = { ...existing, v: val };
      });
    });
    onCellsChange(next);
  }, [active, cells, colCount, rowCount, onCellsChange, protectedMode]);

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (editing) {
      if (e.key === 'Enter') { e.preventDefault(); commitEdit(e.shiftKey ? null : 'down'); }
      else if (e.key === 'Tab') { e.preventDefault(); commitEdit(e.shiftKey ? null : 'right'); }
      else if (e.key === 'Escape') { e.preventDefault(); setEditing(null); }
      return;
    }
    if (!active) { if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Tab'].includes(e.key)) { setActiveAndSel(0, 0); e.preventDefault(); } return; }
    const { c, r } = active;
    const move = (nc: number, nr: number, extend = false) => {
      const cc = Math.max(0, Math.min(colCount - 1, nc));
      const rr = Math.max(0, Math.min(rowCount - 1, nr));
      setActive({ c: cc, r: rr });
      if (extend && sel) setSel({ ...sel, c2: cc, r2: rr });
      else setSel({ c1: cc, r1: rr, c2: cc, r2: rr });
    };
    switch (e.key) {
      case 'ArrowUp': e.preventDefault(); move(c, r - 1, e.shiftKey); break;
      case 'ArrowDown': e.preventDefault(); move(c, r + 1, e.shiftKey); break;
      case 'ArrowLeft': e.preventDefault(); move(c - 1, r, e.shiftKey); break;
      case 'ArrowRight': e.preventDefault(); move(c + 1, r, e.shiftKey); break;
      case 'Tab': e.preventDefault(); move(e.shiftKey ? c - 1 : c + 1, r); break;
      case 'Enter': e.preventDefault(); startEdit(c, r); break;
      case 'F2': e.preventDefault(); startEdit(c, r); break;
      case 'Delete': case 'Backspace': e.preventDefault(); clearSelection(); break;
      case 'Home': if (e.ctrlKey || e.metaKey) { e.preventDefault(); move(0, 0); } break;
      case 'c': case 'C': if (e.ctrlKey || e.metaKey) { e.preventDefault(); copySelection(false); } break;
      case 'x': case 'X': if (e.ctrlKey || e.metaKey) { e.preventDefault(); copySelection(true); } break;
      case 'v': case 'V': if (e.ctrlKey || e.metaKey) { e.preventDefault(); pasteFromClipboard(); } break;
      case 'a': case 'A': if (e.ctrlKey || e.metaKey) { e.preventDefault(); setSel({ c1: 0, r1: 0, c2: colCount - 1, r2: rowCount - 1 }); setActive({ c: 0, r: 0 }); } break;
      default:
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          startEdit(c, r, e.key);
        }
    }
  }, [editing, active, sel, colCount, rowCount, commitEdit, startEdit, clearSelection, copySelection, pasteFromClipboard, setActiveAndSel]);

  const onCellMouseDown = (c: number, r: number, e: React.MouseEvent) => {
    e.preventDefault();
    if (editing) commitEdit(null);
    containerRef.current?.focus();
    if (e.shiftKey && active) {
      setSel({ c1: active.c, r1: active.r, c2: c, r2: r });
      return;
    }
    setActive({ c, r });
    setSel({ c1: c, r1: r, c2: c, r2: r });
    setDragging(true);
  };
  const onCellMouseEnter = (c: number, r: number) => {
    if (dragging) setSel(prev => prev ? { ...prev, c2: c, r2: r } : prev);
  };
  useEffect(() => {
    const up = () => setDragging(false);
    window.addEventListener('mouseup', up);
    return () => window.removeEventListener('mouseup', up);
  }, []);

  // compute merged-cell coverage per row
  const rowCoverage = useMemo(() => {
    const cov: Record<number, Set<number>> = {};
    Object.entries(cells).forEach(([key, cell]) => {
      if (!cell.merge || cell.merge < 2) return;
      const [c, r] = key.split(',').map(Number);
      if (!cov[r]) cov[r] = new Set();
      for (let i = 1; i < cell.merge; i++) cov[r].add(c + i);
    });
    return cov;
  }, [cells]);

  const totalWidth = colWidths.reduce((s, w) => s + w, 0) + 40;

  const activeAddr = active ? `${colToLetter(active.c)}${active.r + 1}` : '';

  return (
    <div className={`flex flex-col ${className}`}>
      {/* Formula bar */}
      <div className="flex items-center gap-2 px-2 py-1.5 border-b border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-xs">
        <div className="w-16 shrink-0 font-mono font-semibold text-center px-2 py-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded text-slate-700 dark:text-slate-200">
          {activeAddr || '—'}
        </div>
        <span className="text-slate-400 font-serif italic">fx</span>
        <input
          className="flex-1 min-w-0 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1 font-mono text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          value={editing ? editing.val : activeCellRaw}
          placeholder={active ? 'Enter value or =formula' : 'Select a cell'}
          onChange={e => {
            if (active) {
              const cell = cells[cellKey(active.c, active.r)];
              if (protectedMode && cell?.locked) return;
              if (editing) setEditing({ ...editing, val: e.target.value });
              else setEditing({ c: active.c, r: active.r, val: e.target.value });
            }
          }}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); commitEdit('down'); }
            else if (e.key === 'Escape') { setEditing(null); containerRef.current?.focus(); }
          }}
          onBlur={() => { if (editing) commitEdit(null); }}
        />
      </div>

      {/* Grid */}
      <div
        ref={containerRef}
        tabIndex={0}
        onKeyDown={onKeyDown}
        className="overflow-auto outline-none bg-white dark:bg-slate-900"
        style={{ maxHeight: 'calc(100vh - 220px)' }}
        onMouseDown={() => containerRef.current?.focus()}
      >
        <table className="border-collapse select-none" style={{ minWidth: totalWidth }}>
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="sticky left-0 z-20 w-10 min-w-10 h-6 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400 text-[10px] font-medium cursor-pointer"
                onMouseDown={e => { e.preventDefault(); setSel({ c1: 0, r1: 0, c2: colCount - 1, r2: rowCount - 1 }); setActive({ c: 0, r: 0 }); containerRef.current?.focus(); }}>
              </th>
              {Array.from({ length: colCount }).map((_, c) => (
                <th key={c}
                  style={{ width: colWidths[c] || 100, minWidth: colWidths[c] || 100 }}
                  className={`h-6 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-[11px] font-semibold text-slate-600 dark:text-slate-300 cursor-pointer ${normSel && active && normSel.c1 <= c && c <= normSel.c2 && (normSel.r1 === 0 && normSel.r2 === rowCount - 1 || (active.c === c)) ? 'bg-emerald-100 dark:bg-emerald-900/40' : ''}`}
                  onMouseDown={e => { e.preventDefault(); setSel({ c1: c, r1: 0, c2: c, r2: rowCount - 1 }); setActive({ c, r: 0 }); containerRef.current?.focus(); }}>
                  {colToLetter(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rowCount }).map((_, r) => {
              const covered = rowCoverage[r] || new Set<number>();
              const rowSelected = normSel && normSel.c1 === 0 && normSel.c2 === colCount - 1 && normSel.r1 <= r && r <= normSel.r2;
              return (
                <tr key={r} style={{ height: rowHeight }}>
                  <th className={`sticky left-0 z-10 w-10 min-w-10 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-[10px] font-medium text-slate-500 dark:text-slate-400 cursor-pointer ${rowSelected ? 'bg-emerald-100 dark:bg-emerald-900/40' : ''}`}
                    onMouseDown={e => { e.preventDefault(); setSel({ c1: 0, r1: r, c2: colCount - 1, r2: r }); setActive({ c: 0, r }); containerRef.current?.focus(); }}>
                    {r + 1}
                  </th>
                  {Array.from({ length: colCount }).map((_, c) => {
                    if (covered.has(c)) return null;
                    const key = cellKey(c, r);
                    const cell = cells[key];
                    const isActive = active && active.c === c && active.r === r;
                    const isSel = inSelection(c, r) && !isActive;
                    const isEditing = editing && editing.c === c && editing.r === r;
                    const hasValue = !!(cell && cell.v !== undefined && cell.v !== '');
                    const ev = evalCell(c, r, cells);
                    const display = hasValue ? formatCellValue(cell, ev) : '';
                    const align = cell?.align || (hasValue && ev.num !== null && !cell?.align ? 'right' : 'left');
                    const indent = cell?.indent ? cell.indent * 20 : 0;
                    const colSpan = cell?.merge && cell.merge > 1 ? cell.merge : undefined;
                    return (
                      <td key={c}
                        colSpan={colSpan}
                        onMouseDown={e => onCellMouseDown(c, r, e)}
                        onMouseEnter={() => onCellMouseEnter(c, r)}
                        onDoubleClick={() => startEdit(c, r)}
                        className={`relative border border-slate-200 dark:border-slate-700/70 px-1.5 align-middle whitespace-nowrap overflow-hidden text-[12px] ${cell?.bold ? 'font-bold' : ''} ${cell?.italic ? 'italic' : ''} ${cell?.underline ? 'underline' : ''} ${cell?.doubleUnderline ? 'border-b-2 border-b-slate-800 dark:border-b-slate-100' : ''} ${ev.error ? 'text-red-600 dark:text-red-400' : ''} ${isSel ? 'bg-emerald-50 dark:bg-emerald-900/25' : ''} ${cell?.bg || ''} ${cell?.color || ''}`}
                        style={{
                          textAlign: align as any,
                          paddingLeft: 6 + indent,
                        }}
                      >
                        {isActive && (
                          <div className="absolute inset-0 pointer-events-none ring-2 ring-emerald-500 z-10" />
                        )}
                        {isEditing ? (
                          <input
                            ref={editInputRef}
                            value={editing!.val}
                            onChange={e => setEditing({ ...editing!, val: e.target.value })}
                            onKeyDown={e => {
                              if (e.key === 'Enter') { e.preventDefault(); commitEdit('down'); }
                              else if (e.key === 'Tab') { e.preventDefault(); commitEdit('right'); }
                              else if (e.key === 'Escape') { e.preventDefault(); setEditing(null); }
                            }}
                            onBlur={() => commitEdit(null)}
                            className="absolute inset-0 w-full h-full px-1.5 bg-white dark:bg-slate-900 border-2 border-emerald-500 outline-none text-[12px] text-slate-900 dark:text-slate-100 font-mono"
                            style={{ textAlign: align as any }}
                          />
                        ) : (
                          <span className={`block truncate ${cell?.color || 'text-slate-800 dark:text-slate-100'}`}>{display}</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="px-3 py-1.5 text-[10px] text-slate-400 dark:text-slate-500 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 flex justify-between">
        <span>Double-click or press Enter to edit · Formulas start with = (SUM, AVERAGE, ROUND supported) · Ctrl+C / Ctrl+V to copy/paste</span>
        <span>{colCount} columns × {rowCount} rows{protectedMode ? ' · formulas locked' : ' · formulas unlocked'}</span>
      </div>
    </div>
  );
}

export default SpreadsheetGrid;
