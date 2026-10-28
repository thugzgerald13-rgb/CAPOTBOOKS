/**
 * Flexible DTR / biometrics import.
 *
 * Biometric systems export in many shapes (title rows above the header, one row
 * per punch, one row per day with In/Out columns, AM/PM in-out pairs, a single
 * "Date/Time" column, Excel or CSV...). Instead of requiring a fixed template this
 * module scans the sheet, finds the header row, works out which column is the
 * employee name / ID / date / punches by header text (and by cell content as a
 * fallback), then groups punches per employee per day.
 */

export type DtrRole =
  | 'name' | 'first' | 'last' | 'middle' | 'id' | 'date' | 'time' | 'in' | 'out'
  | 'break' | 'ot' | 'nd' | 'holiday' | 'rest' | 'leave' | 'leaveHours' | 'remarks';

export interface DtrDayRecord {
  idRaw: string;
  nameRaw: string;
  date: string; // YYYY-MM-DD
  punches: string[]; // sorted unique HH:MM
  breakMin: number | null;
  ot: number;
  nd: number;
  holiday: string;
  rest: boolean;
  leave: string;
  leaveHours: number;
  remarks: string;
}

export interface DtrExtraction {
  sheetName: string;
  records: DtrDayRecord[];
  /** Human readable "Role -> column header" list, for showing the user what was detected. */
  detected: string[];
}

const norm = (v: unknown) => String(v ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

export function classifyDtrHeader(raw: string): DtrRole | null {
  const n = norm(raw);
  if (!n) return null;
  if (/^(firstname|givenname|fname)$/.test(n)) return 'first';
  if (/^(lastname|surname|familyname|lname)$/.test(n)) return 'last';
  if (/^(middlename|middleinitial|mname)$/.test(n)) return 'middle';
  if (/leave/.test(n) && /(hour|hrs|hr)/.test(n)) return 'leaveHours';
  if (/^leave(type)?$/.test(n)) return 'leave';
  if (/holiday/.test(n)) return 'holiday';
  if (/rest/.test(n)) return 'rest';
  if (/^(remarks?|notes?|comments?)$/.test(n)) return 'remarks';
  if (/^(break|breakmin|breakmins|breakminutes|lunch|lunchminutes|lunchbreak)$/.test(n)) return 'break';
  if (/^(ot|othours|othrs|overtime|overtimehours|overtimehrs)$/.test(n)) return 'ot';
  if (/^(nd|ndhours|nighthours|nightdiff|nightdifferential|nightdifferentialhours)$/.test(n)) return 'nd';
  if (/name/.test(n) && !/(shift|dept|department|company|branch|file|day|holiday|leave|position)/.test(n)) return 'name';
  if (/^(employee|staff|personnel|person|user|empl)$/.test(n)) return 'name';
  if (/^(employeeid|empid|id|no|number|userid|badge|badgeid|badgeno|badgenumber|acno|personid|employeeno|employeenumber|empno|empcode|employeecode|code|cardno|cardnumber|pin|staffid|userno|enrollno|enrollnumber|idnumber|idno)$/.test(n)) return 'id';
  if (/^(date|workdate|attendancedate|attdate|logdate|dateofwork|punchdate|checkdate|transactiondate|day)$/.test(n)) return 'date';
  if (/^(time|datetime|dateandtime|timestamp|checktime|punchtime|logtime|clocktime|transactiontime|verifytime|attendancetime|punch|punches|clocking|inout|timeinout|logs?)$/.test(n)) return 'time';
  if (/^(time|clock|check|punch|am|pm|first|morning|afternoon|log|day|work|start|shift)?(in|arrival|timein)\d*$/.test(n)) return 'in';
  if (/^(time|clock|check|punch|am|pm|last|morning|afternoon|log|day|work|end|shift)?(out|departure|timeout)\d*$/.test(n)) return 'out';
  return null;
}

// ---------- date / time parsing ----------

function pad(n: number | string, w = 2) { return String(n).padStart(w, '0'); }

/** Excel serial -> {date, time} using plain UTC arithmetic (no timezone drift). */
function fromSerial(serial: number): { date: string; time: string } {
  const ms = Math.round(serial * 86400000);
  const d = new Date(Date.UTC(1899, 11, 30) + ms);
  const date = serial >= 1 ? `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` : '';
  const time = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  return { date, time };
}

/** Every HH:MM(:SS) [AM/PM] token in a cell, normalised to 24-hour HH:MM. */
export function extractTimes(value: string): string[] {
  const out: string[] = [];
  const re = /(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap])?\.?\s*(m)?\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(value)) !== null) {
    let h = Number(m[1]);
    const min = Number(m[2]);
    if (min > 59 || h > 24) continue;
    if (m[3] && m[4]) {
      h = h % 12;
      if (m[3].toLowerCase() === 'p') h += 12;
    }
    if (h === 24) h = 0;
    out.push(`${pad(h)}:${pad(min)}`);
  }
  return out;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** Parses the date portion of a cell. `dayFirst` resolves 01/02/2025 style ambiguity. */
export function parseDtrDate(value: string, dayFirst: boolean): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (/^\d{5}(\.\d+)?$/.test(raw) && Number(raw) > 30000 && Number(raw) < 80000) return fromSerial(Number(raw)).date;
  let m = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  m = raw.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (m) {
    let a = Number(m[1]);
    let b = Number(m[2]);
    let y = Number(m[3]);
    if (y < 100) y += 2000;
    let month = dayFirst ? b : a;
    let day = dayFirst ? a : b;
    if (month > 12 && day <= 12) [month, day] = [day, month];
    if (month < 1 || month > 12 || day < 1 || day > 31) return '';
    return `${y}-${pad(month)}-${pad(day)}`;
  }
  // 01-Oct-2025, Oct 1, 2025, 1 October 2025 (optionally preceded by weekday)
  const text = raw.toLowerCase().replace(/^(mon|tue|wed|thu|fri|sat|sun)[a-z]*[,.\s]+/, '');
  m = text.match(/^(\d{1,2})[\s\-/.,]*([a-z]{3})[a-z]*[\s\-/.,]*(\d{2,4})/);
  if (m && MONTHS.includes(m[2])) {
    const y = Number(m[3]) < 100 ? Number(m[3]) + 2000 : Number(m[3]);
    return `${y}-${pad(MONTHS.indexOf(m[2]) + 1)}-${pad(m[1])}`;
  }
  m = text.match(/^([a-z]{3})[a-z]*[\s\-/.,]*(\d{1,2})[\s\-/.,]+(\d{2,4})/);
  if (m && MONTHS.includes(m[1])) {
    const y = Number(m[3]) < 100 ? Number(m[3]) + 2000 : Number(m[3]);
    return `${y}-${pad(MONTHS.indexOf(m[1]) + 1)}-${pad(m[2])}`;
  }
  return '';
}

/** Decides d/m/y vs m/d/y for the whole file by looking for a value that can only be one of them. */
function detectDayFirst(samples: string[]): boolean {
  let firstOver12 = false;
  let secondOver12 = false;
  for (const s of samples) {
    const m = String(s).trim().match(/^(\d{1,2})[-/.](\d{1,2})[-/.]\d{2,4}/);
    if (!m) continue;
    if (Number(m[1]) > 12) firstOver12 = true;
    if (Number(m[2]) > 12) secondOver12 = true;
  }
  return firstOver12 && !secondOver12;
}

// ---------- reading files into string grids ----------

/** Splits CSV/TSV/semicolon text into a grid of strings (quotes supported). */
export function parseDelimitedText(input: string): string[][] {
  const firstLine = input.split(/\r?\n/).find((l) => l.trim()) || '';
  const counts = { '\t': (firstLine.match(/\t/g) || []).length, ';': (firstLine.match(/;/g) || []).length, ',': (firstLine.match(/,/g) || []).length };
  const delimiter = (Object.entries(counts).sort((a, b) => b[1] - a[1])[0][1] > 0
    ? Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]
    : ',');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (ch === '"' && quoted && input[i + 1] === '"') { cell += '"'; i += 1; }
    else if (ch === '"') quoted = !quoted;
    else if (ch === delimiter && !quoted) { row.push(cell.trim()); cell = ''; }
    else if ((ch === '\n' || ch === '\r') && !quoted) {
      if (ch === '\r' && input[i + 1] === '\n') i += 1;
      row.push(cell.trim());
      if (row.some((v) => v)) rows.push(row);
      row = []; cell = '';
    } else cell += ch;
  }
  row.push(cell.trim());
  if (row.some((v) => v)) rows.push(row);
  return rows;
}

/**
 * Converts every sheet of an XLSX/XLS workbook to string grids. Date/time cells are
 * rebuilt from their serial number so results do not depend on the browser timezone
 * or on Excel's display format.
 */
export function gridsFromWorkbook(XLSX: any, workbook: any): { sheetName: string; grid: string[][] }[] {
  return (workbook.SheetNames as string[]).map((sheetName) => {
    const ws = workbook.Sheets[sheetName];
    const grid: string[][] = [];
    if (!ws || !ws['!ref']) return { sheetName, grid };
    const range = XLSX.utils.decode_range(ws['!ref']);
    for (let r = range.s.r; r <= range.e.r; r += 1) {
      const row: string[] = [];
      for (let c = range.s.c; c <= range.e.c; c += 1) {
        const cell = ws[XLSX.utils.encode_cell({ r, c })];
        if (!cell) { row.push(''); continue; }
        if (cell.t === 'n' && cell.z && XLSX.SSF.is_date(cell.z)) {
          const { date, time } = fromSerial(cell.v);
          const hasTime = time !== '00:00';
          row.push(!date ? time : hasTime ? `${date} ${time}` : date);
        } else if (cell.t === 'd' && cell.v instanceof Date) {
          const d = cell.v as Date;
          row.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}${d.getHours() || d.getMinutes() ? ` ${pad(d.getHours())}:${pad(d.getMinutes())}` : ''}`);
        } else {
          row.push(String(cell.w ?? cell.v ?? '').trim());
        }
      }
      grid.push(row);
    }
    return { sheetName, grid };
  });
}

// ---------- column detection + extraction ----------

const DATETIME_RE = /\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}[ T]+\d{1,2}:\d{2}/;
const NAME_LIKE_RE = /^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ.\-' ,]{3,}$/;

export function extractDtrFromGrid(sheetName: string, grid: string[][]): DtrExtraction | null {
  const rows = grid.map((r) => r.map((c) => String(c ?? '').trim()));
  if (rows.length < 2) return null;

  // 1) find the header row: the first rows that classify into the most distinct roles
  let headerIdx = -1;
  let bestScore = 0;
  for (let i = 0; i < Math.min(rows.length - 1, 40); i += 1) {
    const roles = new Set(rows[i].map(classifyDtrHeader).filter(Boolean) as DtrRole[]);
    const hasWhen = roles.has('date') || roles.has('time') || roles.has('in');
    const hasWho = roles.has('name') || roles.has('id') || roles.has('first') || roles.has('last');
    const score = roles.size + (hasWhen && hasWho ? 10 : 0);
    if (hasWhen && score > bestScore) { bestScore = score; headerIdx = i; }
  }

  const colRoles: (DtrRole | null)[] = [];
  const headerLabels: string[] = [];
  let dataStart: number;
  const width = Math.max(...rows.map((r) => r.length));

  if (headerIdx >= 0) {
    for (let c = 0; c < width; c += 1) {
      colRoles.push(classifyDtrHeader(rows[headerIdx][c] || ''));
      headerLabels.push(rows[headerIdx][c] || `Column ${c + 1}`);
    }
    dataStart = headerIdx + 1;
  } else {
    // headerless raw biometric log, e.g.  "12  2025-10-01 08:03:11  1  0"
    const sample = rows.slice(0, 8);
    let dtCol = -1;
    for (let c = 0; c < width; c += 1) {
      if (sample.filter((r) => DATETIME_RE.test(r[c] || '')).length >= Math.min(3, sample.length)) { dtCol = c; break; }
    }
    if (dtCol < 0) return null;
    for (let c = 0; c < width; c += 1) { colRoles.push(null); headerLabels.push(`Column ${c + 1}`); }
    colRoles[dtCol] = 'time';
    const idCol = [...Array(width).keys()].find((c) => c !== dtCol && sample.every((r) => /^[\w-]+$/.test(r[c] || '')));
    if (idCol !== undefined) colRoles[idCol] = 'id';
    dataStart = 0;
  }

  // 2) content-based fallback for the name column
  if (!colRoles.some((r) => r === 'name' || r === 'first' || r === 'last')) {
    const body = rows.slice(dataStart, dataStart + 60);
    let bestCol = -1;
    let bestRatio = 0;
    for (let c = 0; c < width; c += 1) {
      if (colRoles[c]) continue;
      const vals = body.map((r) => r[c] || '').filter(Boolean);
      if (vals.length < 2) continue;
      const ratio = vals.filter((v) => NAME_LIKE_RE.test(v)).length / vals.length;
      if (ratio > bestRatio) { bestRatio = ratio; bestCol = c; }
    }
    if (bestCol >= 0 && bestRatio >= 0.7) {
      colRoles[bestCol] = 'name';
      headerLabels[bestCol] = `${headerLabels[bestCol]} (auto-detected)`;
    }
  }

  // 3) content-based fallback for the date column (date + time may share a column)
  if (!colRoles.some((r) => r === 'date' || r === 'time')) {
    const body = rows.slice(dataStart, dataStart + 60);
    for (let c = 0; c < width; c += 1) {
      if (colRoles[c]) continue;
      const vals = body.map((r) => r[c] || '').filter(Boolean);
      if (vals.length >= 2 && vals.filter((v) => parseDtrDate(v, false)).length / vals.length >= 0.7) {
        colRoles[c] = 'date';
        headerLabels[c] = `${headerLabels[c]} (auto-detected)`;
        break;
      }
    }
  }

  const cols = (role: DtrRole) => colRoles.map((r, i) => (r === role ? i : -1)).filter((i) => i >= 0);
  const dateCols = cols('date');
  const timeCols = cols('time');
  const inCols = cols('in');
  const outCols = cols('out');
  if (!dateCols.length && !timeCols.length) return null;
  if (!timeCols.length && !inCols.length && !outCols.length && !cols('leave').length) return null;

  // 4) date format (d/m/y vs m/d/y) for the entire sheet
  const dateSamples: string[] = [];
  rows.slice(dataStart).forEach((r) => [...dateCols, ...timeCols].forEach((c) => r[c] && dateSamples.push(r[c])));
  const dayFirst = detectDayFirst(dateSamples);

  const first = (r: string[], role: DtrRole) => { const c = cols(role)[0]; return c !== undefined ? (r[c] || '') : ''; };
  const num = (v: string) => {
    const n = Number(String(v).replace(/[^0-9.\-]/g, ''));
    return v && Number.isFinite(n) ? n : 0;
  };

  // 5) read rows, carrying name/ID forward for block-style reports where they are only on the first row
  const grouped = new Map<string, DtrDayRecord>();
  let lastId = '';
  let lastName = '';
  for (let i = dataStart; i < rows.length; i += 1) {
    const r = rows[i];
    let idRaw = first(r, 'id');
    let nameRaw = first(r, 'name');
    if (!nameRaw && (first(r, 'last') || first(r, 'first'))) {
      nameRaw = `${first(r, 'last')}, ${first(r, 'first')} ${first(r, 'middle')}`.replace(/^,\s*/, '').trim();
    }
    if (!idRaw && !nameRaw) { idRaw = lastId; nameRaw = lastName; } else { lastId = idRaw || lastId; lastName = nameRaw || lastName; }

    let date = '';
    for (const c of [...dateCols, ...timeCols]) {
      date = parseDtrDate(r[c] || '', dayFirst);
      if (date) break;
    }
    const punches: string[] = [];
    [...inCols, ...outCols, ...timeCols].sort((a, b) => a - b).forEach((c) => {
      extractTimes(r[c] || '').forEach((t) => punches.push(t));
    });
    // numeric Excel time fractions (e.g. 0.3541) in explicit In/Out columns
    [...inCols, ...outCols].forEach((c) => {
      const v = r[c] || '';
      if (/^0\.\d+$/.test(v)) punches.push(fromSerial(Number(v)).time);
    });
    const leaveRaw = first(r, 'leave');
    const leave = ['none', 'n/a', 'na', '-', '0', 'no'].includes(leaveRaw.toLowerCase()) ? '' : leaveRaw;
    if (!date || (!punches.length && !leave)) continue;

    const key = `${(idRaw || norm(nameRaw)).toLowerCase()}|${date}`;
    const rec = grouped.get(key) || {
      idRaw, nameRaw, date, punches: [], breakMin: null, ot: 0, nd: 0, holiday: '', rest: false, leave: '', leaveHours: 0, remarks: ''
    };
    rec.punches.push(...punches);
    const brk = first(r, 'break');
    if (brk && rec.breakMin === null) rec.breakMin = num(brk);
    rec.ot = Math.max(rec.ot, num(first(r, 'ot')));
    rec.nd = Math.max(rec.nd, num(first(r, 'nd')));
    rec.holiday = rec.holiday || first(r, 'holiday');
    rec.rest = rec.rest || ['1', 'true', 'yes', 'y', 'rest'].includes(first(r, 'rest').toLowerCase());
    rec.leave = rec.leave || leave;
    rec.leaveHours = Math.max(rec.leaveHours, num(first(r, 'leaveHours')));
    rec.remarks = rec.remarks || first(r, 'remarks');
    grouped.set(key, rec);
  }

  const records = Array.from(grouped.values()).map((rec) => ({
    ...rec,
    punches: Array.from(new Set(rec.punches)).sort()
  }));
  if (!records.length) return null;

  const roleLabel: Record<string, string> = {
    name: 'Employee name', first: 'First name', last: 'Last name', middle: 'Middle name', id: 'Employee ID', date: 'Date',
    time: 'Date/Time punches', in: 'Time in', out: 'Time out', break: 'Break', ot: 'OT', nd: 'Night diff',
    holiday: 'Holiday', rest: 'Rest day', leave: 'Leave', leaveHours: 'Leave hours', remarks: 'Remarks'
  };
  const detected = colRoles
    .map((role, i) => (role ? `${roleLabel[role]} → "${headerLabels[i]}"` : ''))
    .filter(Boolean);
  if (headerIdx < 0) detected.unshift('No header row found - read as a raw biometric log');
  return { sheetName, records, detected };
}

// ---------- employee matching ----------

const nameTokens = (s: string) =>
  String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z]+/).filter((t) => t.length > 1);
const tokenKey = (s: string) => Array.from(new Set(nameTokens(s))).sort().join(' ');
const idKey = (s: string) => {
  const v = String(s || '').trim().toLowerCase();
  return /^\d+$/.test(v) ? v.replace(/^0+/, '') || '0' : v;
};

interface MatchableEmployee {
  employeeId: string;
  employeeNumber: string;
  firstName: string;
  middleName: string;
  lastName: string;
  fullName: string;
}

/** Matches biometric ID or name (any order, with/without middle name or initials) to an employee. */
export function buildEmployeeMatcher<T extends MatchableEmployee>(employees: T[]) {
  const byId = new Map<string, T>();
  const byFull = new Map<string, T>();
  const tokenSets = employees.map((e) => ({ e, tokens: new Set(nameTokens(`${e.firstName} ${e.middleName} ${e.lastName}`)) }));
  employees.forEach((e) => {
    [e.employeeId, e.employeeNumber].filter(Boolean).forEach((v) => byId.set(idKey(v), e));
    [`${e.firstName} ${e.middleName} ${e.lastName}`, `${e.firstName} ${e.lastName}`, e.fullName].forEach((v) => {
      const k = tokenKey(v);
      if (k && !byFull.has(k)) byFull.set(k, e);
    });
  });
  return (idRaw: string, nameRaw: string): T | undefined => {
    if (idRaw && byId.has(idKey(idRaw))) return byId.get(idKey(idRaw));
    const k = tokenKey(nameRaw);
    if (!k) return undefined;
    if (byFull.has(k)) return byFull.get(k);
    const wanted = k.split(' ');
    if (wanted.length < 2) return undefined;
    const candidates = tokenSets.filter(({ tokens }) => wanted.every((t) => tokens.has(t)));
    return candidates.length === 1 ? candidates[0].e : undefined;
  };
}
