import React, { useState, useEffect } from 'react';
import { useAccounting } from '../context/AccountingContext';
import { useAuth } from '../context/AuthContext';
import './PayrollHub.css';
import {
  Calculator,
  LayoutDashboard,
  Users,
  CreditCard,
  Gift,
  Landmark,
  FileSpreadsheet,
  BarChart3,
  User as UserIcon,
  Plus,
  Pencil,
  Trash2,
  Printer,
  Download,
  CheckCircle2,
  AlertCircle,
  Building2,
  ArrowRight,
  Layers,
  Sparkles,
  Search,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  Check,
  Eye,
  FileDown,
  Mail,
  Clock,
  LogOut,
  Loader2,
  Calendar,
  Lock,
  Stamp,
  Database,
  Scale,
  Code2,
  Zap
} from 'lucide-react';
import { FICTIONAL_EMPLOYEES, EmployeeRecord } from './data/employeeDatabase';
import {
  PAYROLL_PERIODS_2025,
  PayrollPeriodRecord
} from './data/payrollPeriodsData';
import {
  PayrollCalculationRecord,
  PayrollInputRecord,
  computePayrollRow
} from './data/payrollCalculationData';
import {
  EmployeePayslipData,
  buildEmployeePayslip,
  convertCalcToRegister,
  generateDepartmentSummaries
} from './data/payrollRegisterData';
import {
  STATUTORY_RULES_MASTER,
  TAX_TABLES_MASTER,
  COMPENSATION_CLASSIFICATIONS_MASTER,
  STATUTORY_VERIFICATION_AUDIT_MASTER,
  computeBirWithholdingTax
} from './data/statutoryRules';
import { PayslipPdfPreviewModal } from './components/PayslipPdfPreviewModal';
import {
  generatePayslipFromCurrentState,
  sendPayslipEmail,
  PayslipEmailPayload
} from './services/payslipPdfService';
import { loadPayrollSnapshot, payrollCloudAvailable, savePayrollSnapshot } from './services/payrollRepository';
import { YearDropdownDateInput } from '../components/ui/YearDropdownDateInput';


export interface PayrollCompany {
  name: string;
  tin?: string;
  address?: string;
  email?: string;
  planId?: string;
  watermarkEnabled?: boolean;
}

export interface EnterpriseHubProps {
  company: PayrollCompany;
  /** Settings are opened from CAPOTBOOKS' main Settings sidebar, not Payroll tabs. */
  initialPage?: 'dashboard' | 'employees' | 'attendance' | 'payroll' | 'payslip' | 'reports' | 'settings';
}

export interface AttendanceRow {
  id: string;
  employeeId: string;
  date: string;
  in: string;
  out: string;
  breakMin: number;
  ot: number;
  nd: number;
  holiday: string;
  rest: boolean;
  leave: string;
  leaveHours: number;
  approval: string;
  remarks: string;
}

export interface ProcessedPayrollPeriod {
  id: string;
  from: string;
  to: string;
  payDate: string;
  frequency: string;
  status: 'DRAFT' | 'CHECKED' | 'APPROVED' | 'LOCKED';
  rows: PayrollCalculationRecord[];
  created: string;
  locked: boolean;
}

export interface AuditEvent {
  time: string;
  action: string;
  user: string;
  ref: string;
  result: string;
}

export interface ValidationError {
  type: 'ERROR' | 'WARNING';
  message: string;
  when: string;
}

function countWeekdays(from: string, to: string): number {
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;
  let count = 0;
  const cursor = new Date(start);
  while (cursor <= end) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) count += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

function readPayrollStore<T>(key: string, fallback: T): T {
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem(key) : null;
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

// Used only to clean previously stored demo fixtures on upgrade. New payroll
// accounts always start with empty employee, attendance and payroll lists.
const DEMO_EMPLOYEE_IDS = new Set(FICTIONAL_EMPLOYEES.map((employee) => employee.employeeId));
const DEMO_EMPLOYEE_NUMBERS = new Set(FICTIONAL_EMPLOYEES.map((employee) => employee.employeeNumber));
const DEMO_PAYROLL_IDS = new Set(['PR-2025-10-P1', 'PR-2025-09-P2']);

function normalizeHeader(value: string): string {
  return String(value || '').trim().toLowerCase().replace(/[_\-]+/g, ' ').replace(/\s+/g, '').replace(/[^a-z0-9]/g, '');
}

function parseDtrCsv(input: string): string[][] {
  const delimiter = (input.split(/\r?\n/).find((line) => line.trim()) || '').includes('\t') ? '\t' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (char === '"' && quoted && input[i + 1] === '"') { cell += '"'; i += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === delimiter && !quoted) { row.push(cell.trim()); cell = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && input[i + 1] === '\n') i += 1;
      row.push(cell.trim());
      if (row.some((value) => value.trim())) rows.push(row);
      row = []; cell = '';
    } else cell += char;
  }
  row.push(cell.trim());
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

function normalizeDtrDate(value: string): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const iso = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  const us = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (us) return `${us[3]}-${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}`;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? '' : `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
}

function normalizeDtrTime(value: string): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const twentyFour = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (twentyFour) return `${twentyFour[1].padStart(2, '0')}:${twentyFour[2]}`;
  const twelve = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap]\.?m\.?)$/i);
  if (twelve) {
    let hour = Number(twelve[1]) % 12;
    if (twelve[4].toLowerCase().startsWith('p')) hour += 12;
    return `${String(hour).padStart(2, '0')}:${twelve[2]}`;
  }
  return raw;
}

// ---------- Employee ID format (employer-configurable, auto-generated) ----------
export interface EmployeeIdFormat {
  prefix: string;
  separator: '-' | '' | '/' | '.' | '_';
  yearStyle: 'NONE' | 'YYYY' | 'YY';
  digits: number;
  startNumber: number;
}

const DEFAULT_ID_FORMAT: EmployeeIdFormat = { prefix: 'EMP', separator: '-', yearStyle: 'YYYY', digits: 4, startNumber: 1 };

function resolveIdFormat(raw: Partial<EmployeeIdFormat> | undefined): EmployeeIdFormat {
  const f = { ...DEFAULT_ID_FORMAT, ...(raw || {}) };
  return {
    prefix: String(f.prefix ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10),
    separator: (['-', '', '/', '.', '_'].includes(f.separator) ? f.separator : '-') as EmployeeIdFormat['separator'],
    yearStyle: (['NONE', 'YYYY', 'YY'].includes(f.yearStyle) ? f.yearStyle : 'YYYY') as EmployeeIdFormat['yearStyle'],
    digits: Math.min(8, Math.max(1, Math.floor(Number(f.digits)) || 4)),
    startNumber: Math.max(1, Math.floor(Number(f.startNumber)) || 1),
  };
}

/** Everything in the ID that comes before the running number, e.g. "EMP-2026-". */
function idBase(format: EmployeeIdFormat, year: number): string {
  const parts: string[] = [];
  if (format.prefix) parts.push(format.prefix);
  if (format.yearStyle === 'YYYY') parts.push(String(year));
  else if (format.yearStyle === 'YY') parts.push(String(year).slice(-2));
  return parts.length ? parts.join(format.separator) + format.separator : '';
}

/** Next unused ID for the given format. `reserved` lets bulk imports avoid handing out the same ID twice. */
function generateEmployeeId(format: EmployeeIdFormat, existingIds: string[], year = new Date().getFullYear(), reserved: Set<string> = new Set()): string {
  const base = idBase(format, year);
  const taken = new Set([...existingIds, ...Array.from(reserved)].map((id) => id.toUpperCase()));
  let max = format.startNumber - 1;
  taken.forEach((id) => {
    if (id.startsWith(base.toUpperCase())) {
      const rest = id.slice(base.length);
      if (/^\d+$/.test(rest)) max = Math.max(max, Number(rest));
    }
  });
  let n = max + 1;
  let candidate = `${base}${String(n).padStart(format.digits, '0')}`;
  while (taken.has(candidate.toUpperCase())) {
    n += 1;
    candidate = `${base}${String(n).padStart(format.digits, '0')}`;
  }
  return candidate;
}

// ---------- Government ID helpers ----------
const onlyDigits = (v: string) => String(v || '').replace(/\D/g, '');
function formatTin(v: string): string {
  const d = onlyDigits(v).slice(0, 12);
  return [d.slice(0, 3), d.slice(3, 6), d.slice(6, 9), d.slice(9, 12)].filter(Boolean).join('-');
}
function formatSss(v: string): string {
  const d = onlyDigits(v).slice(0, 10);
  return [d.slice(0, 2), d.slice(2, 9), d.slice(9, 10)].filter(Boolean).join('-');
}
function formatPhilHealth(v: string): string {
  const d = onlyDigits(v).slice(0, 12);
  return [d.slice(0, 2), d.slice(2, 11), d.slice(11, 12)].filter(Boolean).join('-');
}
function formatHdmf(v: string): string {
  const d = onlyDigits(v).slice(0, 12);
  return [d.slice(0, 4), d.slice(4, 8), d.slice(8, 12)].filter(Boolean).join('-');
}

/** Returns an error message for the first malformed government number, or ''. Blank values are allowed. */
function validateGovIds(e: Partial<EmployeeRecord>): string {
  const len = (v?: string) => onlyDigits(v || '').length;
  if (e.tin && ![9, 12].includes(len(e.tin))) return 'TIN must be 9 or 12 digits.';
  if (e.sssNumber && len(e.sssNumber) !== 10) return 'SSS number must be 10 digits.';
  if (e.philHealthNumber && len(e.philHealthNumber) !== 12) return 'PhilHealth number must be 12 digits.';
  if (e.pagIbigNumber && len(e.pagIbigNumber) !== 12) return 'HDMF (Pag-IBIG) number must be 12 digits.';
  return '';
}

const CIVIL_STATUSES: EmployeeRecord['civilStatus'][] = ['Single', 'Married', 'Widowed', 'Legally Separated'];

const EMPLOYEE_UPLOAD_COLUMNS = [
  'Employee ID', 'Last Name', 'First Name', 'Middle Name', 'Suffix', 'Birthdate', 'Marital Status', 'Address',
  'TIN', 'SSS No', 'HDMF No', 'PhilHealth No', 'Email', 'Contact Number', 'Date Hired', 'Department', 'Position',
  'Pay Type', 'Payroll Frequency', 'Monthly Salary', 'Daily Rate'
];

function normalizeCivilStatus(v: string): EmployeeRecord['civilStatus'] | null {
  const k = String(v || '').trim().toLowerCase();
  if (!k) return 'Single';
  if (['single', 's'].includes(k)) return 'Single';
  if (['married', 'm'].includes(k)) return 'Married';
  if (['widowed', 'widow', 'widower', 'w'].includes(k)) return 'Widowed';
  if (['legally separated', 'separated', 'legallyseparated', 'ls'].includes(k)) return 'Legally Separated';
  return null;
}

interface EmployeeUploadRow {
  line: number;
  employee: EmployeeRecord | null;
  error: string;
  warning: string;
}

function peso(amount: number): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2
  }).format(amount || 0);
}

function dateFmt(d: string): string {
  if (!d) return '';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: '2-digit'
  });
}

function defaultPayrollSettings(company: PayrollCompany) {
  return {
    companyName: company.name,
    companyTIN: company.tin || '',
    companyAddress: company.address || '',
    payrollEmail: company.email || '',
    hoursPerDay: 8,
    daysMonth: 26,
    employeeIdFormat: { ...DEFAULT_ID_FORMAT },
    periodsMonthly: 1,
    periodsSemi: 2,
    periodsWeekly: 4,
    periodsBiweekly: 2.167,
    ndRate: 0.10,
    otRate: 1.25,
    sss: {
      ee: 0.05,
      er: 0.10,
      min: 5000,
      max: 35000,
      step: 500,
      ecLow: 10,
      ecHigh: 30,
      source: 'SSS Act of 2018 (RA 11199) / 2025 15% Contribution Schedule'
    },
    ph: {
      rate: 0.05,
      floor: 10000,
      ceiling: 100000,
      source: 'PhilHealth Universal Health Care Act (RA 11223) / Circular 2024-0031'
    },
    pi: {
      lowRate: 0.01,
      highRate: 0.02,
      erRate: 0.02,
      ceiling: 5000,
      source: 'HDMF Circular No. 274 / Pag-IBIG Fund Ceiling'
    }
  };
}

export const PayrollHub: React.FC<EnterpriseHubProps> = ({ company, initialPage = 'dashboard' }) => {
  const { currentClientId, currentClient } = useAccounting();
  const { user } = useAuth();
  const [cloudReady, setCloudReady] = useState(false);
  const [loadedCloudClientId, setLoadedCloudClientId] = useState<string | null>(null);
  const [cloudHasRecords, setCloudHasRecords] = useState<boolean | null>(null);
  const [legacyLocalAvailable, setLegacyLocalAvailable] = useState(false);
  const [cloudRetryCount, setCloudRetryCount] = useState(0);
  const [cloudStatus, setCloudStatus] = useState<'offline' | 'signin' | 'select-business' | 'loading' | 'synced' | 'error'>('offline');
  const [cloudError, setCloudError] = useState<string | null>(null);
  // Resolve company identity from CAPOTBOOKS' currently active profile. The
  // prop is retained as a fallback for standalone rendering, but when an active
  // Client Profile exists it is the source of truth for name, TIN, address and email.
  const currentCompany = currentClient ? {
    name: currentClient.registeredName || currentClient.tradeName || currentClient.name || 'CAPOTBOOKS Business',
    tin: currentClient.tin || '',
    address: [currentClient.substreet, currentClient.street, currentClient.barangay, currentClient.district, currentClient.city, currentClient.zipCode].filter(Boolean).join(', '),
    email: currentClient.email || '',
    planId: company.planId || 'enterprise',
    watermarkEnabled: Boolean(company.watermarkEnabled),
  } : {
    name: company.name || 'CAPOTBOOKS Business',
    tin: company.tin || '',
    address: company.address || '',
    email: company.email || '',
    planId: company.planId || 'enterprise',
    watermarkEnabled: Boolean(company.watermarkEnabled),
  };
  const legacyStorageKey = `capotbooks-payroll-v1:${(currentCompany.tin || currentCompany.name).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  // New local caches are tenant-scoped by CAPOTBOOKS' active client id. The
  // previous company-name cache is kept separate to prevent cross-business imports.
  const storageKey = currentClientId && payrollCloudAvailable() && user?.id
    ? `capotbooks-payroll-v2:${currentClientId}`
    : legacyStorageKey;
  // Payroll workspace tabs retained from Paykaya Enterprise Hub.
  const [currentPage, setCurrentPage] = useState<
    'dashboard' | 'employees' | 'attendance' | 'payroll' | 'payslip' | 'reports' | 'settings'
  >(initialPage as any);


  useEffect(() => {
    setCurrentPage(initialPage as any);
  }, [initialPage]);

  // Master State: never pre-populate employees. This also removes the known
  // fictional fixture records that may have been persisted by an earlier build.
  const [employees, setEmployees] = useState<EmployeeRecord[]>(() =>
    readPayrollStore<EmployeeRecord[]>(`${storageKey}:employees`, []).filter(
      (employee) => !DEMO_EMPLOYEE_IDS.has(employee.employeeId) && !DEMO_EMPLOYEE_NUMBERS.has(employee.employeeNumber)
    )
  );
  const [employeeSearch, setEmployeeSearch] = useState<string>('');
  const [employeeStatusFilter, setEmployeeStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [editingEmployee, setEditingEmployee] = useState<Partial<EmployeeRecord> | null>(null);
  const [showEmployeeModal, setShowEmployeeModal] = useState<boolean>(false);
  const [showIdFormatModal, setShowIdFormatModal] = useState<boolean>(false);
  const [idFormatDraft, setIdFormatDraft] = useState<EmployeeIdFormat>({ ...DEFAULT_ID_FORMAT });
  const [employeeUploadPreview, setEmployeeUploadPreview] = useState<{ fileName: string; rows: EmployeeUploadRow[] } | null>(null);

  // Attendance State
  const [attMonth, setAttMonth] = useState<string>(new Date().toISOString().slice(0, 7));
  const [attEmployeeFilter, setAttEmployeeFilter] = useState<string>('ALL');
  const [attendance, setAttendance] = useState<AttendanceRow[]>(() =>
    readPayrollStore<AttendanceRow[]>(`${storageKey}:attendance`, []).filter(
      (row) => !DEMO_EMPLOYEE_IDS.has(row.employeeId) && !['Loaded test record', 'Loaded overtime test'].includes(row.remarks)
    )
  );
  const [editingAttendance, setEditingAttendance] = useState<Partial<AttendanceRow> | null>(null);
  const [showAttendanceModal, setShowAttendanceModal] = useState<boolean>(false);

  // Payroll Processing State
  const [payrolls, setPayrolls] = useState<ProcessedPayrollPeriod[]>(() =>
    readPayrollStore<ProcessedPayrollPeriod[]>(`${storageKey}:payrolls`, [])
      .filter((period) => !DEMO_PAYROLL_IDS.has(period.id))
      .map((period) => ({
        ...period,
        rows: (period.rows || []).filter((row) => !DEMO_EMPLOYEE_IDS.has(row.employeeId))
      }))
  );
  const [selectedPayrollId, setSelectedPayrollId] = useState<string>('');

  useEffect(() => {
    if (payrolls.length > 0 && !payrolls.some((period) => period.id === selectedPayrollId)) {
      setSelectedPayrollId(payrolls[0].id);
    } else if (payrolls.length === 0 && selectedPayrollId) {
      setSelectedPayrollId('');
    }
  }, [payrolls, selectedPayrollId]);

  // Payslip State
  const [selectedPayslipEmpId, setSelectedPayslipEmpId] = useState<string>('');
  const [showPdfPreviewModal, setShowPdfPreviewModal] = useState<boolean>(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState<boolean>(false);
  const [pdfStatusMessage, setPdfStatusMessage] = useState<string | null>(null);

  // Audit and Error Checks State
  const [auditLog, setAuditLog] = useState<AuditEvent[]>(() => readPayrollStore(`${storageKey}:audit`, []));
  const [errorsList, setErrorsList] = useState<ValidationError[]>([]);

  // Settings State
  const [settings, setSettings] = useState(() => ({ ...readPayrollStore(`${storageKey}:settings`, defaultPayrollSettings(currentCompany)), companyName: currentCompany.name, companyTIN: currentCompany.tin || '', companyAddress: currentCompany.address || '' }));

  useEffect(() => {
    const legacyEmployees = readPayrollStore<EmployeeRecord[]>(`${legacyStorageKey}:employees`, []).filter(
      (employee) => !DEMO_EMPLOYEE_IDS.has(employee.employeeId) && !DEMO_EMPLOYEE_NUMBERS.has(employee.employeeNumber)
    );
    const legacyAttendance = readPayrollStore<AttendanceRow[]>(`${legacyStorageKey}:attendance`, []).filter(
      (row) => !DEMO_EMPLOYEE_IDS.has(row.employeeId) && !['Loaded test record', 'Loaded overtime test'].includes(row.remarks)
    );
    const legacyPayrolls = readPayrollStore<ProcessedPayrollPeriod[]>(`${legacyStorageKey}:payrolls`, []).filter(
      (period) => !DEMO_PAYROLL_IDS.has(period.id)
    );
    const hasLegacyRecords = legacyEmployees.length > 0 || legacyAttendance.length > 0 || legacyPayrolls.length > 0;
    setLegacyLocalAvailable(hasLegacyRecords);
  }, [legacyStorageKey]);

  // Keep payroll company identity synchronized when Business Profile / Client
  // Profiles is edited without changing the active profile ID. Calculation and
  // statutory settings remain payroll-specific and are not reset by profile edits.
  useEffect(() => {
    setSettings((previous: any) => ({
      ...previous,
      companyName: currentCompany.name,
      companyTIN: currentCompany.tin || '',
      companyAddress: currentCompany.address || '',
      payrollEmail: previous?.payrollEmail || currentCompany.email || '',
    }));
  }, [currentCompany.name, currentCompany.tin, currentCompany.address, currentCompany.email]);

  // Keep local records keyed by business as an offline cache. When cloud sync is
  // active, do not write into a tenant cache until that same tenant has loaded.
  useEffect(() => {
    const cloudTenant = payrollCloudAvailable() && Boolean(user?.id) && Boolean(currentClientId);
    if (cloudTenant && loadedCloudClientId !== currentClientId) return;
    try {
      window.localStorage.setItem(`${storageKey}:employees`, JSON.stringify(employees));
      window.localStorage.setItem(`${storageKey}:attendance`, JSON.stringify(attendance));
      window.localStorage.setItem(`${storageKey}:payrolls`, JSON.stringify(payrolls));
      window.localStorage.setItem(`${storageKey}:settings`, JSON.stringify(settings));
      window.localStorage.setItem(`${storageKey}:audit`, JSON.stringify(auditLog));
    } catch (error) {
      console.warn('Payroll local cache could not be saved. Export a backup before clearing browser data.', error);
    }
  }, [storageKey, currentClientId, user?.id, loadedCloudClientId, employees, attendance, payrolls, settings, auditLog]);

  // Hydrate the selected CAPOTBOOKS business from Supabase. Offline records are
  // kept in a client-id scoped cache. The old company-name cache is deliberately
  // not uploaded automatically because it cannot be reliably mapped to a tenant;
  // use Import Backup after confirming the target business when migrating legacy data.
  useEffect(() => {
    let cancelled = false;
    setCloudReady(false);
    setLoadedCloudClientId(null);
    setCloudHasRecords(null);
    setCloudError(null);

    // Warm the selected tenant's own local cache first, so a network problem
    // doesn't display another client's in-memory data while the request runs.
    setEmployees(readPayrollStore<EmployeeRecord[]>(`${storageKey}:employees`, []).filter(
      (employee) => !DEMO_EMPLOYEE_IDS.has(employee.employeeId) && !DEMO_EMPLOYEE_NUMBERS.has(employee.employeeNumber)
    ));
    setAttendance(readPayrollStore<AttendanceRow[]>(`${storageKey}:attendance`, []).filter(
      (row) => !DEMO_EMPLOYEE_IDS.has(row.employeeId) && !['Loaded test record', 'Loaded overtime test'].includes(row.remarks)
    ));
    setPayrolls(readPayrollStore<ProcessedPayrollPeriod[]>(`${storageKey}:payrolls`, [])
      .filter((period) => !DEMO_PAYROLL_IDS.has(period.id))
      .map((period) => ({ ...period, rows: (period.rows || []).filter((row) => !DEMO_EMPLOYEE_IDS.has(row.employeeId)) })));
    const cachedSettings = readPayrollStore<any>(`${storageKey}:settings`, defaultPayrollSettings(currentCompany));
    setSettings({ ...defaultPayrollSettings(currentCompany), ...cachedSettings, companyName: currentCompany.name, companyTIN: currentCompany.tin || '', companyAddress: currentCompany.address || '', payrollEmail: cachedSettings?.payrollEmail || currentCompany.email || '' });
    setAuditLog(readPayrollStore<AuditEvent[]>(`${storageKey}:audit`, []));

    if (!payrollCloudAvailable()) {
      setCloudStatus('offline');
      setLoadedCloudClientId(currentClientId);
      return () => { cancelled = true; };
    }
    if (!user?.id) {
      setCloudStatus('signin');
      return () => { cancelled = true; };
    }
    if (!currentClientId) {
      setCloudStatus('select-business');
      return () => { cancelled = true; };
    }

    setCloudStatus('loading');
    void loadPayrollSnapshot(currentClientId).then(({ hasRecords, hasPayrollData, snapshot }) => {
      if (cancelled) return;
      setCloudHasRecords(hasPayrollData);
      if (hasRecords) {
        setEmployees((snapshot.employees || []) as EmployeeRecord[]);
        setAttendance((snapshot.attendance || []) as AttendanceRow[]);
        setPayrolls((snapshot.payrolls || []) as ProcessedPayrollPeriod[]);
        if (snapshot.settings) {
          const savedSettings = snapshot.settings as any;
          setSettings({ ...defaultPayrollSettings(currentCompany), ...savedSettings, companyName: currentCompany.name, companyTIN: currentCompany.tin || '', companyAddress: currentCompany.address || '', payrollEmail: savedSettings.payrollEmail || currentCompany.email || '', sss: { ...defaultPayrollSettings(currentCompany).sss, ...(savedSettings.sss || {}) }, ph: { ...defaultPayrollSettings(currentCompany).ph, ...(savedSettings.ph || {}) }, pi: { ...defaultPayrollSettings(currentCompany).pi, ...(savedSettings.pi || {}) } });
        }
        setAuditLog((snapshot.auditLog || []) as AuditEvent[]);
      }
      setLoadedCloudClientId(currentClientId);
      setCloudReady(true);
      setCloudStatus('synced');
    }).catch((error: unknown) => {
      if (cancelled) return;
      const message = error instanceof Error ? error.message : String(error);
      setCloudError(message);
      setCloudStatus('error');
      // Save edits made during an outage to this tenant's cache only. No remote
      // writes are attempted until a successful reload enables cloudReady again.
      setLoadedCloudClientId(currentClientId);
      console.error('Payroll Supabase load failed:', error);
    });

    return () => { cancelled = true; };
  }, [currentClientId, user?.id, storageKey, cloudRetryCount]);

  // Shared persistence uses the established CAPOTBOOKS Supabase client and
  // active client id. SQL Row Level Security, not the UI, enforces tenant access.
  useEffect(() => {
    if (!cloudReady || !currentClientId || !user?.id || loadedCloudClientId !== currentClientId || !payrollCloudAvailable()) return;
    setCloudStatus('loading');
    setCloudError(null);
    void savePayrollSnapshot(currentClientId, {
      employees,
      attendance,
      payrolls,
      settings: settings as Record<string, unknown>,
      auditLog,
    }).then(() => {
      const hasPayrollData = employees.length > 0 || attendance.length > 0 || payrolls.length > 0;
      setCloudHasRecords(hasPayrollData);
      if (hasPayrollData) setLegacyLocalAvailable(false);
      setCloudStatus('synced');
    }).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      setCloudError(message);
      setCloudStatus('error');
      console.error('Payroll Supabase save failed:', error);
    });
  }, [cloudReady, currentClientId, loadedCloudClientId, user?.id, employees, attendance, payrolls, settings, auditLog]);

  const logAction = (action: string, ref: string, result = 'SUCCESS') => {
    setAuditLog((prev) => [
      {
        time: new Date().toISOString(),
        action,
        user: 'CAPOTBOOKS User',
        ref,
        result
      },
      ...prev.slice(0, 200)
    ]);
  };

  const handleMigrateLegacyLocalData = () => {
    if (!user?.id || !currentClientId || !cloudReady || cloudHasRecords !== false) {
      alert('Legacy migration is available only after the selected business has loaded successfully and has no payroll records in Supabase.');
      return;
    }
    const legacyEmployees = readPayrollStore<EmployeeRecord[]>(`${legacyStorageKey}:employees`, []).filter(
      (employee) => !DEMO_EMPLOYEE_IDS.has(employee.employeeId) && !DEMO_EMPLOYEE_NUMBERS.has(employee.employeeNumber)
    );
    const legacyAttendance = readPayrollStore<AttendanceRow[]>(`${legacyStorageKey}:attendance`, []).filter(
      (row) => !DEMO_EMPLOYEE_IDS.has(row.employeeId) && !['Loaded test record', 'Loaded overtime test'].includes(row.remarks)
    );
    const legacyPayrolls = readPayrollStore<ProcessedPayrollPeriod[]>(`${legacyStorageKey}:payrolls`, [])
      .filter((period) => !DEMO_PAYROLL_IDS.has(period.id))
      .map((period) => ({ ...period, rows: (period.rows || []).filter((row) => !DEMO_EMPLOYEE_IDS.has(row.employeeId)) }));
    if (!legacyEmployees.length && !legacyAttendance.length && !legacyPayrolls.length) {
      setLegacyLocalAvailable(false);
      alert('No employee, attendance, or payroll records were found in the legacy local cache.');
      return;
    }
    const confirmed = window.confirm(
      `Import ${legacyEmployees.length} employees, ${legacyAttendance.length} attendance rows, and ${legacyPayrolls.length} payroll periods from this browser's older local cache into the currently selected CAPOTBOOKS business? This is allowed only because that business has no payroll records in Supabase. Verify the business name before continuing.`
    );
    if (!confirmed) return;

    setEmployees(legacyEmployees);
    setAttendance(legacyAttendance);
    setPayrolls(legacyPayrolls);
    const legacySettings = readPayrollStore<any>(`${legacyStorageKey}:settings`, defaultPayrollSettings(currentCompany));
    setSettings({ ...defaultPayrollSettings(currentCompany), ...legacySettings, companyName: currentCompany.name, companyTIN: currentCompany.tin || '', companyAddress: currentCompany.address || '', payrollEmail: legacySettings?.payrollEmail || currentCompany.email || '', sss: { ...defaultPayrollSettings(currentCompany).sss, ...(legacySettings?.sss || {}) }, ph: { ...defaultPayrollSettings(currentCompany).ph, ...(legacySettings?.ph || {}) }, pi: { ...defaultPayrollSettings(currentCompany).pi, ...(legacySettings?.pi || {}) } });
    setAuditLog(readPayrollStore<AuditEvent[]>(`${legacyStorageKey}:audit`, []));
    setLegacyLocalAvailable(false);
    setCloudHasRecords(true);
    logAction('Migrate legacy local payroll data to Supabase', currentClientId);
  };

  const todayIso = new Date().toISOString().slice(0, 10);
  // A blank, unsaved period keeps the UI stable until the user creates a run.
  const currentPayroll: ProcessedPayrollPeriod = payrolls.find((p) => p.id === selectedPayrollId) || payrolls[0] || {
    id: '', from: todayIso, to: todayIso, payDate: todayIso, frequency: 'Semi-Monthly',
    status: 'DRAFT', rows: [], created: '', locked: false
  };
  const targetPeriod: PayrollPeriodRecord = PAYROLL_PERIODS_2025.find((p) => p.payrollId === currentPayroll.id) || (() => {
    const from = currentPayroll.from || todayIso;
    const to = currentPayroll.to || from;
    const isSecondHalf = Number(to.slice(8, 10)) >= 16;
    const days = Math.max(1, Math.round((new Date(`${to}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime()) / 86400000) + 1);
    return {
      payrollId: currentPayroll?.id || 'PR-CUSTOM',
      periodName: `${from} to ${to}`,
      periodType: currentPayroll?.frequency === 'Monthly' ? 'Monthly' : (isSecondHalf ? '2nd Half' : '1st Half'),
      cutoffStartDate: from,
      cutoffEndDate: to,
      payDate: currentPayroll?.payDate || to,
      statutoryVersionId: 'SSS-2025-V1',
      taxTableVersion: 'TAX-TRAIN-SM-T1',
      deductSss: isSecondHalf,
      deductPhilHealth: isSecondHalf,
      deductPagIbig: isSecondHalf,
      status: 'Draft',
      lockedTimestamp: '',
      lockedBy: '',
      totalWorkingDays: Math.max(1, Math.round(days * 5 / 7)),
      expectedWorkHours: Math.max(1, Math.round(days * 5 / 7)) * (Number(settings.hoursPerDay) || 8),
      remarks: 'CAPOTBOOKS custom payroll period'
    } as PayrollPeriodRecord;
  })();

  const calculatePayrollWithDtr = (period: PayrollPeriodRecord, emp: EmployeeRecord, input?: PayrollInputRecord): PayrollCalculationRecord => {
    const base = computePayrollRow(period, emp, input);
    const rows = attendance.filter((item) => item.employeeId === emp.employeeId && item.date >= period.cutoffStartDate && item.date <= period.cutoffEndDate);
    if (!rows.length) return base;

    const minutesFor = (value: string) => {
      const match = String(value || '').match(/^(\d{1,2}):(\d{2})$/);
      return match ? Number(match[1]) * 60 + Number(match[2]) : null;
    };
    const workedHoursByRow = rows.map((item) => {
      const start = minutesFor(item.in);
      let end = minutesFor(item.out);
      if (start === null || end === null) return 0;
      if (end < start) end += 24 * 60;
      return Math.max(0, (end - start - Math.max(0, Number(item.breakMin) || 0)) / 60);
    });
    const explicitOvertime = rows.reduce((sum, item) => sum + Math.max(0, Number(item.ot) || 0), 0);
    const inferredOvertime = workedHoursByRow.reduce((sum, hours) => sum + Math.max(0, hours - Math.max(1, Number(settings.hoursPerDay) || 8)), 0);
    const overtimeHours = explicitOvertime > 0 ? explicitOvertime : inferredOvertime;
    const nightDiffHours = rows.reduce((sum, item) => sum + Math.max(0, Number(item.nd) || 0), 0);
    const paidLeaveHours = rows.reduce((sum, item) => sum + Math.max(0, Number(item.leaveHours) || 0), 0);
    const daysWorked = new Set(rows.filter((item, index) => workedHoursByRow[index] > 0).map((item) => item.date)).size;
    const hourlyRate = Math.round((base.dailyRate / Math.max(1, Number(settings.hoursPerDay) || 8)) * 100) / 100;
    const overtimePay = Math.round(overtimeHours * hourlyRate * (Number(settings.otRate) || 1.25) * 100) / 100;
    const nightDiffPay = Math.round(nightDiffHours * hourlyRate * (Number(settings.ndRate) || 0.10) * 100) / 100;
    const paidLeavePay = Math.round((paidLeaveHours / Math.max(1, Number(settings.hoursPerDay) || 8)) * base.dailyRate * 100) / 100;
    const grossPay = Math.round((base.regularPay + overtimePay + nightDiffPay + base.restDayPay + base.holidayPay + paidLeavePay + base.taxableEarningsInput + base.nonTaxableEarningsInput) * 100) / 100;
    const taxableCompensation = Math.max(0, Math.round((grossPay - base.nonTaxableEarningsInput - base.totalStatutoryEe) * 100) / 100);
    const withholdingTax = computeBirWithholdingTax(taxableCompensation, 'Semi-Monthly', base.isMwe).computedTax;
    const totalDeductions = Math.round((base.totalStatutoryEe + withholdingTax + base.loanDeductions + base.cashAdvanceDeductions + base.otherDeductions) * 100) / 100;
    const netPay = Math.max(0, Math.round((grossPay - totalDeductions) * 100) / 100);
    const totalEmployerCost = Math.round((grossPay + base.sssEr + base.sssEc + base.philHealthEr + base.pagIbigEr) * 100) / 100;
    return {
      ...base,
      hourlyRate,
      daysWorked,
      overtimeHours,
      overtimePay,
      nightDiffHours,
      nightDiffPay,
      paidLeaveHours,
      paidLeavePay,
      grossPay,
      taxableCompensation,
      withholdingTax,
      totalDeductions,
      netPay,
      totalEmployerCost,
      crossFootingBalanced: Math.abs(netPay - (grossPay - totalDeductions)) < 0.01,
    };
  };

  // Dynamic metrics
  const activeEmployees = employees.filter((e) => e.activeStatus === 'ACTIVE');
  const totalGrossPayroll = (currentPayroll?.rows || []).reduce((s, r) => s + r.grossPay, 0);
  const totalNetPayroll = (currentPayroll?.rows || []).reduce((s, r) => s + r.netPay, 0);
  const totalEmployerCost = (currentPayroll?.rows || []).reduce((s, r) => s + r.totalEmployerCost, 0);

  // Departmental distribution
  const deptDist: Record<string, number> = {};
  (currentPayroll?.rows || []).forEach((r) => {
    deptDist[r.department] = (deptDist[r.department] || 0) + r.grossPay;
  });
  const maxDept = Math.max(1, ...Object.values(deptDist));

  // Government distribution
  const govContributions = {
    SSS: (currentPayroll?.rows || []).reduce((s, r) => s + r.sssEe + r.sssEr + r.sssEc, 0),
    PhilHealth: (currentPayroll?.rows || []).reduce((s, r) => s + r.philHealthEe + r.philHealthEr, 0),
    PagIBIG: (currentPayroll?.rows || []).reduce((s, r) => s + r.pagIbigEe + r.pagIbigEr, 0),
    BIR: (currentPayroll?.rows || []).reduce((s, r) => s + r.withholdingTax, 0)
  };
  const maxGov = Math.max(1, ...Object.values(govContributions));

  // Payslip Data preparation
  const targetPayslipEmp = employees.find((e) => e.employeeId === selectedPayslipEmpId) || employees[0];
  const targetCalc = targetPayslipEmp && currentPayroll.id
    ? ((currentPayroll.rows || []).find((r) => r.employeeId === targetPayslipEmp.employeeId)
      || calculatePayrollWithDtr(targetPeriod, targetPayslipEmp, undefined))
    : undefined;
  const rawPayslip = targetCalc ? buildEmployeePayslip(targetCalc, targetPeriod) : null;
  const payslipData: EmployeePayslipData = {
    ...(rawPayslip || {} as EmployeePayslipData),
    companyName: settings.companyName,
    companyAddress: settings.companyAddress,
    companyTin: settings.companyTIN
  };

  // Run validation checks
  const runChecks = () => {
    const issues: ValidationError[] = [];
    const ids = new Set<string>();

    employees.forEach((e) => {
      if (ids.has(e.employeeId)) {
        issues.push({
          type: 'ERROR',
          message: `Duplicate employee ID detected: ${e.employeeId}`,
          when: new Date().toISOString()
        });
      }
      ids.add(e.employeeId);
      if (!e.monthlySalary && !e.dailyRate && !e.hourlyRate) {
        issues.push({
          type: 'ERROR',
          message: `Employee ${e.employeeId} (${e.fullName}) has no defined compensation base.`,
          when: new Date().toISOString()
        });
      }
    });

    (currentPayroll?.rows || []).forEach((r) => {
      if (r.netPay < 0) {
        issues.push({
          type: 'ERROR',
          message: `Negative net take-home pay for ${r.employeeId}: ${peso(r.netPay)}`,
          when: new Date().toISOString()
        });
      }
      const expectedNet = r.grossPay - r.totalDeductions;
      if (Math.abs(expectedNet - r.netPay) > 0.05) {
        issues.push({
          type: 'ERROR',
          message: `Cross-footing mismatch for ${r.employeeId}: Gross - Deductions != Net Pay.`,
          when: new Date().toISOString()
        });
      }
    });

    setErrorsList(issues);
    logAction('Validation Audit Run', currentPayroll?.id || 'GLOBAL', issues.length ? 'ISSUES' : 'PASS');
  };

  // Download Handlers
  const handleDownloadCsv = (type: string) => {
    const rows = currentPayroll?.rows || [];
    if (!rows.length) {
      alert('No processed payroll rows to export.');
      return;
    }

    let headers: string[] = [];
    let lines: string[][] = [];

    if (type === 'SSS') {
      headers = ['Employee ID', 'Employee Name', 'SSS Number', 'Gross Pay', 'EE Share', 'ER Share', 'EC', 'Total SSS'];
      lines = rows.map((r) => [
        r.employeeId,
        r.employeeName,
        r.employeeId,
        r.grossPay.toFixed(2),
        r.sssEe.toFixed(2),
        r.sssEr.toFixed(2),
        r.sssEc.toFixed(2),
        (r.sssEe + r.sssEr + r.sssEc).toFixed(2)
      ]);
    } else if (type === 'PhilHealth') {
      headers = ['Employee ID', 'Employee Name', 'Gross Pay', 'EE Share', 'ER Share', 'Total PhilHealth'];
      lines = rows.map((r) => [
        r.employeeId,
        r.employeeName,
        r.grossPay.toFixed(2),
        r.philHealthEe.toFixed(2),
        r.philHealthEr.toFixed(2),
        (r.philHealthEe + r.philHealthEr).toFixed(2)
      ]);
    } else if (type === 'PagIBIG') {
      headers = ['Employee ID', 'Employee Name', 'Gross Pay', 'EE Share', 'ER Share', 'Total Pag-IBIG'];
      lines = rows.map((r) => [
        r.employeeId,
        r.employeeName,
        r.grossPay.toFixed(2),
        r.pagIbigEe.toFixed(2),
        r.pagIbigEr.toFixed(2),
        (r.pagIbigEe + r.pagIbigEr).toFixed(2)
      ]);
    } else if (type === 'BIR') {
      headers = ['Employee ID', 'Employee Name', 'Taxable Base', 'Withholding Tax'];
      lines = rows.map((r) => [
        r.employeeId,
        r.employeeName,
        r.taxableCompensation.toFixed(2),
        r.withholdingTax.toFixed(2)
      ]);
    } else {
      // General Payroll Register
      headers = [
        'Employee ID',
        'Employee Name',
        'Department',
        'Basic Pay',
        'Overtime',
        'Holiday',
        'Night Diff',
        'Gross Pay',
        'SSS EE',
        'PhilHealth EE',
        'Pag-IBIG EE',
        'Withholding Tax',
        'Total Deductions',
        'Net Pay',
        'Total Employer Cost'
      ];
      lines = rows.map((r) => [
        r.employeeId,
        r.employeeName,
        r.department,
        r.basicPay.toFixed(2),
        r.overtimePay.toFixed(2),
        r.holidayPay.toFixed(2),
        r.nightDiffPay.toFixed(2),
        r.grossPay.toFixed(2),
        r.sssEe.toFixed(2),
        r.philHealthEe.toFixed(2),
        r.pagIbigEe.toFixed(2),
        r.withholdingTax.toFixed(2),
        r.totalDeductions.toFixed(2),
        r.netPay.toFixed(2),
        r.totalEmployerCost.toFixed(2)
      ]);
    }

    const csvContent = [headers.join(','), ...lines.map((l) => l.map((v) => `"${v}"`).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${currentPayroll.id}_${type}_Export.csv`;
    link.click();
    URL.revokeObjectURL(url);
    logAction(`Export ${type} CSV`, currentPayroll.id);
  };

  // Export Complete Backup JSON
  const handleExportBackup = () => {
    const backupData = {
      version: '4.2',
      exportedAt: new Date().toISOString(),
      company: currentCompany,
      settings,
      employees,
      attendance,
      payrolls,
      auditLog
    };
    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `PH_Payroll_Enterprise_Backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    logAction('Export System Backup JSON', 'SYSTEM');
  };

  // Import Backup JSON
  const handleImportBackup = (file: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        if (data.employees) setEmployees(data.employees);
        if (data.attendance) setAttendance(data.attendance);
        if (data.payrolls) setPayrolls(data.payrolls);
        if (data.settings) setSettings(data.settings);
        logAction('Import System Backup JSON', file.name);
        alert('System backup imported successfully.');
      } catch (err: any) {
        alert('Failed to import backup: ' + err.message);
      }
    };
    reader.readAsText(file);
  };

  // ---------- Employee ID format + bulk employee upload ----------
  const employeeIdFormat = resolveIdFormat((settings as any)?.employeeIdFormat);
  const nextEmployeeId = generateEmployeeId(employeeIdFormat, employees.map((e) => e.employeeId));

  const downloadEmployeeTemplate = () => {
    const sample = [
      '', 'Dela Cruz', 'Juan', 'Santos', '', '1990-05-14', 'Married', '123 Rizal St., Brgy. Poblacion, Makati City',
      '123-456-789-000', '34-1234567-8', '1234-5678-9012', '12-345678901-2', 'juan@example.com', '09171234567',
      '2020-01-15', 'Operations', 'Supervisor', 'Monthly', 'Semi-Monthly', '25000', ''
    ];
    const esc = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
    const csv = '﻿' + [EMPLOYEE_UPLOAD_COLUMNS, sample].map((r) => r.map(esc).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'employee_upload_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleEmployeeUpload = async (file: File) => {
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      if (!sheet) throw new Error('The file has no sheets.');
      const grid = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, dateNF: 'yyyy-mm-dd', defval: '' });
      if (grid.length < 2) throw new Error('The file must contain a header row and at least one employee row.');

      const headers = grid[0].map((h) => normalizeHeader(String(h)));
      const get = (row: string[], aliases: string[]) => {
        const wanted = aliases.map(normalizeHeader);
        const idx = headers.findIndex((h) => wanted.includes(h));
        return idx >= 0 ? String(row[idx] ?? '').trim() : '';
      };
      if (!headers.some((h) => ['firstname', 'givenname'].includes(h)) || !headers.some((h) => ['lastname', 'surname', 'familyname'].includes(h))) {
        throw new Error('Could not find "First Name" and "Last Name" columns. Download the template to see the expected columns.');
      }

      const dataRows = grid.slice(1).map((r, i) => ({ r: r.map((c) => String(c ?? '')), line: i + 2 })).filter(({ r }) => r.some((c) => c.trim()));
      if (!dataRows.length) throw new Error('No employee rows were found in the file.');

      // IDs supplied in the file are reserved first so auto-generated IDs never collide with them.
      const reserved = new Set<string>();
      dataRows.forEach(({ r }) => {
        const id = get(r, ['employeeid', 'empid', 'id', 'employee no', 'employee number']).toUpperCase();
        if (id) reserved.add(id);
      });
      const existingIds = new Set(employees.map((e) => e.employeeId.toUpperCase()));
      const existingTins = new Set(employees.map((e) => onlyDigits(e.tin || '')).filter(Boolean));
      const seenIds = new Set<string>();
      const seenTins = new Set<string>();
      const num = (v: string) => {
        const n = Number(String(v).replace(/[^0-9.\-]/g, ''));
        return v && Number.isFinite(n) ? n : 0;
      };
      const daysMonth = Number((settings as any).daysMonth) || 26;
      const hoursPerDay = Number((settings as any).hoursPerDay) || 8;

      const rows: EmployeeUploadRow[] = dataRows.map(({ r, line }) => {
        const firstName = get(r, ['firstname', 'givenname']);
        const lastName = get(r, ['lastname', 'surname', 'familyname']);
        const warnings: string[] = [];
        const fail = (error: string): EmployeeUploadRow => ({ line, employee: null, error, warning: '' });
        if (!firstName || !lastName) return fail('First name and last name are required.');

        const birthRaw = get(r, ['birthdate', 'dateofbirth', 'birthday', 'dob']);
        const dateOfBirth = birthRaw ? normalizeDtrDate(birthRaw) : '';
        if (birthRaw && !dateOfBirth) warnings.push('Birthdate not recognised (use YYYY-MM-DD) and was left blank.');

        const civilStatus = normalizeCivilStatus(get(r, ['maritalstatus', 'civilstatus', 'status']));
        if (!civilStatus) return fail('Marital status must be Single, Married, Widowed or Legally Separated.');

        const gov: Partial<EmployeeRecord> = {
          tin: formatTin(get(r, ['tin', 'tinnumber', 'tinno'])),
          sssNumber: formatSss(get(r, ['sss', 'sssno', 'sssnumber'])),
          pagIbigNumber: formatHdmf(get(r, ['hdmf', 'hdmfno', 'pagibig', 'pagibigno', 'pagibigmid', 'hdmfnumber'])),
          philHealthNumber: formatPhilHealth(get(r, ['philhealth', 'philhealthno', 'philhealthnumber', 'phic'])),
        };
        const govError = validateGovIds(gov);
        if (govError) return fail(govError);
        const tinKey = onlyDigits(gov.tin || '');
        if (tinKey && (existingTins.has(tinKey) || seenTins.has(tinKey))) return fail('TIN already exists for another employee.');

        const dateHiredRaw = get(r, ['datehired', 'hiredate', 'datehire', 'dateofhire']);
        const dateHired = dateHiredRaw ? normalizeDtrDate(dateHiredRaw) : '';
        if (dateHiredRaw && !dateHired) warnings.push('Date hired not recognised and was left blank.');

        let employeeId = get(r, ['employeeid', 'empid', 'id', 'employee no', 'employee number']).toUpperCase();
        if (employeeId) {
          if (existingIds.has(employeeId) || seenIds.has(employeeId)) return fail(`Employee ID ${employeeId} already exists.`);
        } else {
          const year = dateHired ? Number(dateHired.slice(0, 4)) : new Date().getFullYear();
          employeeId = generateEmployeeId(employeeIdFormat, employees.map((e) => e.employeeId), year, reserved);
        }
        reserved.add(employeeId);
        seenIds.add(employeeId);
        if (tinKey) seenTins.add(tinKey);

        const payTypeRaw = get(r, ['paytype']).toLowerCase();
        const payType: EmployeeRecord['payType'] = payTypeRaw.startsWith('d') ? 'Daily' : payTypeRaw.startsWith('h') ? 'Hourly' : 'Monthly';
        const freqRaw = get(r, ['payrollfrequency', 'frequency']).toLowerCase();
        const payrollFrequency: EmployeeRecord['payrollFrequency'] = freqRaw === 'monthly' ? 'Monthly' : 'Semi-Monthly';
        let monthlySalary = num(get(r, ['monthlysalary', 'salary', 'monthlyrate', 'basicsalary']));
        const dailyGiven = num(get(r, ['dailyrate', 'daily']));
        if (!monthlySalary && dailyGiven) monthlySalary = dailyGiven * daysMonth;
        const dailyRate = dailyGiven || monthlySalary / daysMonth;
        const middleName = get(r, ['middlename', 'middleinitial']);

        const employee: EmployeeRecord = {
          employeeId,
          employeeNumber: employeeId,
          firstName,
          middleName,
          lastName,
          suffix: get(r, ['suffix']),
          fullName: `${firstName} ${lastName}`,
          preferredName: firstName,
          dateOfBirth,
          civilStatus,
          dependentsCount: 0,
          address: get(r, ['address', 'homeaddress']),
          contactNumber: get(r, ['contactnumber', 'mobile', 'phone', 'contactno']),
          workEmail: get(r, ['email', 'emailaddress', 'workemail']),
          tin: gov.tin,
          sssNumber: gov.sssNumber,
          pagIbigNumber: gov.pagIbigNumber,
          philHealthNumber: gov.philHealthNumber,
          dateHired,
          dateRegularized: '',
          dateSeparated: '',
          employmentStatus: 'Regular',
          employmentCategory: 'Rank & File',
          department: get(r, ['department', 'dept']),
          position: get(r, ['position', 'jobtitle', 'designation']),
          location: '',
          supervisorId: '',
          payType,
          payrollFrequency,
          monthlySalary,
          dailyRate,
          hourlyRate: dailyRate / hoursPerDay,
          activeStatus: 'ACTIVE',
          remarks: `Imported from ${file.name}`
        };
        return { line, employee, error: '', warning: warnings.join(' ') };
      });
      setEmployeeUploadPreview({ fileName: file.name, rows });
    } catch (error) {
      alert(`Could not read the employee file: ${error instanceof Error ? error.message : 'Invalid file.'}`);
    }
  };

  const confirmEmployeeUpload = () => {
    if (!employeeUploadPreview) return;
    const valid = employeeUploadPreview.rows.filter((r) => r.employee).map((r) => r.employee as EmployeeRecord);
    if (!valid.length) return;
    setEmployees((prev) => [...prev, ...valid]);
    logAction('Upload Employees', `${employeeUploadPreview.fileName} (${valid.length} added)`);
    setEmployeeUploadPreview(null);
  };

  // Import a DTR export from most timekeeping systems. Header aliases are normalized,
  // dates are retained in ISO format, and imported rows remain Pending for review.
  const handleDtrUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = String(event.target?.result || '').replace(/^\uFEFF/, '');
        const rows = parseDtrCsv(text);
        if (rows.length < 2) throw new Error('The file must contain a header row and at least one attendance row.');
        const headers = rows[0].map((header) => normalizeHeader(header));
        const findValue = (row: string[], aliases: string[]) => {
          const normalizedAliases = aliases.map((alias) => normalizeHeader(alias));
          const index = headers.findIndex((header) => normalizedAliases.includes(header));
          return index >= 0 ? String(row[index] ?? '').trim() : '';
        };
        const imported: AttendanceRow[] = [];
        let unmatched = 0;
        rows.slice(1).forEach((row, index) => {
          if (!row.some((cell) => String(cell || '').trim())) return;
          const suppliedId = findValue(row, ['employeeid','employee number','employeenumber','id','empid','badgeid']);
          const suppliedName = findValue(row, ['employeename','name','employee','fullname','staffname']);
          const normalizedName = suppliedName.toLowerCase().replace(/[^a-z0-9]/g, '');
          const matched = employees.find((employee) => {
            const keys = [employee.employeeId, employee.employeeNumber].filter(Boolean).map((v) => v.toLowerCase());
            if (suppliedId && keys.includes(suppliedId.toLowerCase())) return true;
            const candidateNames = [employee.fullName, `${employee.firstName} ${employee.lastName}`, `${employee.lastName} ${employee.firstName}`]
              .map((v) => v.toLowerCase().replace(/[^a-z0-9]/g, ''));
            return Boolean(suppliedName && candidateNames.includes(normalizedName));
          });
          if (!matched && !suppliedId && !suppliedName) return;
          if (!matched) unmatched += 1;
          const dateRaw = findValue(row, ['date','workdate','attendancedate','logdate','day']);
          const date = normalizeDtrDate(dateRaw);
          if (!date) return;
          const timeIn = normalizeDtrTime(findValue(row, ['timein','in','clockin','checkin','time in','punchin']));
          const timeOut = normalizeDtrTime(findValue(row, ['timeout','out','clockout','checkout','time out','punchout']));
          const num = (aliases: string[], fallback = 0) => {
            const raw = findValue(row, aliases).replace(/,/g, '');
            const value = Number(raw);
            return raw && Number.isFinite(value) ? value : fallback;
          };
          imported.push({
            id: `ATT-IMP-${Date.now()}-${index}`,
            employeeId: matched?.employeeId || suppliedId || suppliedName,
            date,
            in: timeIn,
            out: timeOut,
            breakMin: num(['breakmin','breakminutes','break','breakmins','lunchminutes'], 60),
            ot: num(['ot','othours','overtime','overtimehours','overtimehrs']),
            nd: num(['nd','ndhours','nightdiff','nightdifferential','nightdifferentialhours']),
            holiday: findValue(row, ['holiday','holidaytype']) || 'None',
            rest: ['1','true','yes','y','rest'].includes(findValue(row, ['rest','restday','isrestday']).toLowerCase()),
            leave: findValue(row, ['leave','leavetype']) || 'None',
            leaveHours: num(['leavehours','paidleavehours']),
            approval: 'Pending',
            remarks: findValue(row, ['remarks','remark','notes','comment']) || `Imported from ${file.name}`
          });
        });
        if (!imported.length) throw new Error('No valid attendance records were found. Check that each row has an employee and a valid date.');
        setAttendance((previous) => [...imported, ...previous]);
        setAttMonth(imported[0].date.slice(0, 7));
        logAction('Import DTR CSV', `${file.name} (${imported.length} rows)`);
        alert(`Imported ${imported.length} attendance row(s).${unmatched ? ` ${unmatched} row(s) had employee IDs/names that did not match the employee master and need review.` : ''} Imported rows are Pending until reviewed.`);
      } catch (error) {
        alert(`Could not import DTR: ${error instanceof Error ? error.message : 'Invalid CSV file.'}`);
      }
    };
    reader.onerror = () => alert('Could not read this DTR file.');
    reader.readAsText(file);
  };

  // Download Official PDF Payslip
  const handleDownloadOfficialPdf = async () => {
    if (!targetPayslipEmp || !currentPayroll.id || !targetCalc) {
      alert('Add an employee, create a payroll period, and process payroll before generating a payslip.');
      return;
    }
    try {
      setIsGeneratingPdf(true);
      const res = await generatePayslipFromCurrentState({
        employee: targetPayslipEmp,
        period: targetPeriod,
        company: {
          name: settings.companyName,
          address: settings.companyAddress,
          tin: settings.companyTIN,
          watermarkEnabled: currentCompany.watermarkEnabled
        },
        options: { autoDownload: true }
      });
      setPdfStatusMessage(
        `Official PDF Payslip (${(res.fileSizeBytes / 1024).toFixed(1)} KB) successfully generated and downloaded.`
      );
      setTimeout(() => setPdfStatusMessage(null), 6000);
      logAction('Download PDF Payslip', targetPayslipEmp.employeeId);
    } catch (err: any) {
      alert('Error generating PDF: ' + err.message);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  return (
    <div className="eh-app font-sans">
      {/* 1. SIDEBAR (MATCHING ATTACHED HTML DESIGN) */}
      <aside className="eh-sidebar select-none">
        <div className="eh-brand">
          PH Payroll Pro
          <small>Philippine Payroll Workspace · Integrated with CAPOTBOOKS</small>
        </div>

        <nav className="eh-nav">
          <button
            onClick={() => setCurrentPage('dashboard')}
            className={currentPage === 'dashboard' ? 'active' : ''}
          >
            <span>▦</span>
            <span>Dashboard</span>
          </button>

          <button
            onClick={() => setCurrentPage('employees')}
            className={currentPage === 'employees' ? 'active' : ''}
          >
            <span>♙</span>
            <span>Employees</span>
          </button>

          <button
            onClick={() => setCurrentPage('attendance')}
            className={currentPage === 'attendance' ? 'active' : ''}
          >
            <span>◷</span>
            <span>Attendance</span>
          </button>

          <button
            onClick={() => setCurrentPage('payroll')}
            className={currentPage === 'payroll' ? 'active' : ''}
          >
            <span>▤</span>
            <span>Payroll</span>
          </button>

          <button
            onClick={() => setCurrentPage('payslip')}
            className={currentPage === 'payslip' ? 'active' : ''}
          >
            <span>▤</span>
            <span>Payslip</span>
          </button>

          <button
            onClick={() => setCurrentPage('reports')}
            className={currentPage === 'reports' ? 'active' : ''}
          >
            <span>▥</span>
            <span>Reports</span>
          </button>

        </nav>
      </aside>

      {/* 2. MAIN WORKSPACE */}
      <main className="eh-main">
        {/* TOPBAR */}
        <header className="eh-topbar no-print">
          <div>
            <h1>
              {currentPage === 'dashboard' && 'Dashboard'}
              {currentPage === 'employees' && 'Employee Master'}
              {currentPage === 'attendance' && 'Attendance / Daily Time Record'}
              {currentPage === 'payroll' && 'Payroll Processing'}
              {currentPage === 'payslip' && 'Official Payslip Generator'}
              {currentPage === 'reports' && 'Reports & Remittance'}
              {currentPage === 'settings' && 'Payroll Settings & Compliance'}
            </h1>
            <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
              <span>{settings.companyName}</span>
              <span>&bull;</span>
              <span className="font-mono">{settings.companyTIN}</span>
              <span>&bull;</span>
              <span className="eh-tag ok">INTEGRATED PAYROLL</span>
              <span
                className={`eh-tag ${cloudStatus === 'synced' ? 'ok' : cloudStatus === 'error' ? 'err' : 'warn'}`}
                title={cloudError || 'Payroll cloud storage status'}
              >
                {cloudStatus === 'synced' && 'SUPABASE SYNCED'}
                {cloudStatus === 'loading' && 'SYNCING…'}
                {cloudStatus === 'offline' && 'LOCAL MODE'}
                {cloudStatus === 'signin' && 'SIGN IN TO SYNC'}
                {cloudStatus === 'select-business' && 'SELECT BUSINESS'}
                {cloudStatus === 'error' && 'CLOUD SYNC ERROR'}
              </span>
              {cloudStatus === 'error' && (
                <button className="eh-btn small" onClick={() => setCloudRetryCount((count) => count + 1)} title={cloudError || 'Retry Supabase connection'}>
                  <RefreshCw className="h-3.5 w-3.5" /> Retry Sync
                </button>
              )}
              {cloudStatus === 'synced' && cloudHasRecords === false && legacyLocalAvailable && (
                <button className="eh-btn small" onClick={handleMigrateLegacyLocalData} title="Import older browser-local payroll records into this empty business">
                  <Database className="h-3.5 w-3.5" /> Migrate Local Data
                </button>
              )}
            </div>
          </div>

          <div className="eh-actions">
            <button className="eh-btn small" onClick={handleExportBackup} title="Export full system state JSON">
              <Download className="h-3.5 w-3.5" />
              <span>Export Backup</span>
            </button>

            <label className="eh-btn small" htmlFor="restoreFile" title="Restore system state JSON">
              <UploadIcon className="h-3.5 w-3.5" />
              <span>Import Backup</span>
            </label>
            <input
              id="restoreFile"
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.[0]) handleImportBackup(e.target.files[0]);
              }}
            />

            {currentPage !== 'settings' && (
              <button
                className="eh-btn primary small"
                onClick={() => {
                  setEditingEmployee(null);
                  setShowEmployeeModal(true);
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                <span>+ Employee</span>
              </button>
            )}

          </div>
        </header>

        {currentPage !== 'settings' && <nav className="eh-payroll-tabs no-print" aria-label="Payroll sections">
          {([
            ['dashboard', 'Dashboard'],
            ['employees', 'Employees'],
            ['attendance', 'Attendance'],
            ['payroll', 'Payroll'],
            ['payslip', 'Payslip'],
            ['reports', 'Reports'],
          ] as const).map(([page, label]) => (
            <button key={page} type="button" onClick={() => setCurrentPage(page)} className={currentPage === page ? 'active' : ''}>
              {label}
            </button>
          ))}
        </nav>}

        {/* CONTENT CONTAINER */}
        <div className="eh-content">
          {/* ================= PAGE 1: DASHBOARD ================= */}
          {currentPage === 'dashboard' && (
            <div className="space-y-4">
              {/* 4 Metric Cards */}
              <div className="eh-grid eh-cards">
                <div className="eh-card eh-metric">
                  <div className="label">Active Employees</div>
                  <div className="value">{activeEmployees.length}</div>
                  <div className="sub">Current master records</div>
                </div>

                <div className="eh-card eh-metric">
                  <div className="label">Gross Payroll</div>
                  <div className="value">{peso(totalGrossPayroll)}</div>
                  <div className="sub">Period {currentPayroll.id}</div>
                </div>

                <div className="eh-card eh-metric">
                  <div className="label">Net Payroll</div>
                  <div className="value">{peso(totalNetPayroll)}</div>
                  <div className="sub">After employee deductions</div>
                </div>

                <div className="eh-card eh-metric">
                  <div className="label">Employer Cost</div>
                  <div className="value">{peso(totalEmployerCost)}</div>
                  <div className="sub">Gross + statutory counterparts</div>
                </div>
              </div>

              {/* Grid 2: Department and Government Bars */}
              <div className="eh-grid eh-two">
                <div className="eh-panel">
                  <div className="eh-section-title">
                    <h2>Payroll by Department</h2>
                    <span className="eh-muted">{currentPayroll.id}</span>
                  </div>
                  <div className="space-y-3">
                    {Object.entries(deptDist).map(([dept, amt]) => {
                      const pct = totalGrossPayroll > 0 ? (amt / totalGrossPayroll) * 100 : 0;
                      return (
                        <div key={dept} className="space-y-1">
                          <div className="eh-split text-xs">
                            <span className="font-semibold">{dept}</span>
                            <b>{peso(amt)} ({pct.toFixed(1)}%)</b>
                          </div>
                          <div className="eh-bar">
                            <i style={{ width: `${(amt / maxDept) * 100}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="eh-panel">
                  <div className="eh-section-title">
                    <h2>Government Contributions</h2>
                    <span className="eh-muted">Statutory Summary</span>
                  </div>
                  <div className="space-y-3">
                    {Object.entries(govContributions).map(([agency, val]) => (
                      <div key={agency} className="space-y-1">
                        <div className="eh-split text-xs">
                          <span className="font-semibold">{agency} Total (EE + ER)</span>
                          <b>{peso(val)}</b>
                        </div>
                        <div className="eh-bar">
                          <i style={{ width: `${(val / maxGov) * 100}%`, backgroundColor: '#0f766e' }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Grid 3: System Status, Recent Runs, Quick Actions */}
              <div className="eh-grid eh-three">
                <div className="eh-panel">
                  <div className="eh-section-title">
                    <h2>System Status</h2>
                  </div>
                  <div className={`eh-alert ${errorsList.length ? 'warn' : 'info'}`}>
                    {errorsList.length
                      ? `${errorsList.length} validation item(s) detected.`
                      : 'All cross-footing & formula checks passed.'}
                  </div>
                  <div className="text-xs space-y-1.5 pt-1">
                    <div>
                      Payroll Status: <b>{currentPayroll.status}</b>
                    </div>
                    <div>
                      Statutory Tables: <b>Active 2025/2026 Rules</b>
                    </div>
                    <div>
                      Storage Mode: <b>{cloudStatus === 'synced' ? 'Supabase Cloud + Local Backup' : cloudStatus === 'loading' ? 'Connecting to Supabase…' : cloudStatus === 'error' ? 'Cloud sync needs attention' : cloudStatus === 'signin' ? 'Local Cache — Sign In to Sync' : cloudStatus === 'select-business' ? 'Local Cache — Select Business' : 'Local Mode — Supabase Not Configured'}</b>
                    </div>
                    {cloudError && <div className="text-rose-600 break-words" role="status">Supabase: {cloudError}</div>}
                  </div>
                </div>

                <div className="eh-panel">
                  <div className="eh-section-title">
                    <h2>Recent Payroll Runs</h2>
                  </div>
                  <div className="space-y-2 text-xs">
                    {payrolls.length === 0 && <div className="eh-muted">No payroll runs yet. Create a period to begin.</div>}
                    {payrolls.map((p) => (
                      <div key={p.id} className="eh-split py-1.5 border-b border-slate-100">
                        <span className="font-mono font-semibold">{p.id}</span>
                        <span className={`eh-tag ${p.status === 'LOCKED' ? 'err' : p.status === 'APPROVED' ? 'ok' : 'warn'}`}>
                          {p.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="eh-panel">
                  <div className="eh-section-title">
                    <h2>Quick Actions</h2>
                  </div>
                  <div className="eh-toolbar">
                    <button className="eh-btn primary" onClick={() => setCurrentPage('payroll')}>
                      Open Payroll
                    </button>
                    <button className="eh-btn" onClick={() => setCurrentPage('attendance')}>
                      Enter Attendance
                    </button>
                    <button className="eh-btn" onClick={() => setCurrentPage('payslip')}>
                      View Payslip
                    </button>
                  </div>
                </div>
              </div>

              <div className="eh-footer-note">
                This is an offline-first enterprise payroll base. Statutory settings are version-controlled. Verify official rules before production use.
              </div>
            </div>
          )}

          {/* ================= PAGE 2: EMPLOYEES ================= */}
          {currentPage === 'employees' && (
            <div className="space-y-4">
              <div className="eh-section-title">
                <div>
                  <h2>Employee Master</h2>
                  <div className="eh-muted">Add, edit, search and manage your company's employee records.</div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    className="eh-btn"
                    onClick={() => {
                      setIdFormatDraft(employeeIdFormat);
                      setShowIdFormatModal(true);
                    }}
                  >
                    ID Format
                  </button>
                  <label className="eh-btn eh-upload-button" htmlFor="capotbooks-employee-upload" style={{ cursor: 'pointer' }}>
                    <UploadIcon className="h-3.5 w-3.5 inline-block mr-1" /> Upload Employees
                  </label>
                  <input
                    id="capotbooks-employee-upload"
                    type="file"
                    accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void handleEmployeeUpload(file);
                      event.currentTarget.value = '';
                    }}
                  />
                  <button
                    className="eh-btn primary"
                    onClick={() => {
                      setEditingEmployee(null);
                      setShowEmployeeModal(true);
                    }}
                  >
                    + Add Employee
                  </button>
                </div>
              </div>

              <div className="eh-panel space-y-3">
                <div className="eh-toolbar">
                  <input
                    type="text"
                    placeholder="Search name, ID, TIN, SSS, department..."
                    value={employeeSearch}
                    onChange={(e) => setEmployeeSearch(e.target.value)}
                    className="eh-field eh-search"
                    style={{ maxWidth: 280 }}
                  />
                  <select
                    value={employeeStatusFilter}
                    onChange={(e) => setEmployeeStatusFilter(e.target.value as any)}
                    className="eh-field"
                    style={{ maxWidth: 160 }}
                  >
                    <option value="ALL">All status</option>
                    <option value="ACTIVE">Active</option>
                    <option value="INACTIVE">Inactive</option>
                  </select>
                  <span className="eh-muted eh-dtr-help">
                    Upload existing employees from CSV or Excel (Last/First Name, Birthdate, Marital Status, Address, TIN, SSS, HDMF, PhilHealth, etc.).{' '}
                    <button type="button" className="text-blue-600 hover:underline cursor-pointer" onClick={downloadEmployeeTemplate}>Download template</button>
                  </span>
                </div>

                <div className="eh-table-wrap">
                  <table className="eh-table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Employee</th>
                        <th>Department</th>
                        <th>Position</th>
                        <th>Pay Type</th>
                        <th>Frequency</th>
                        <th className="eh-right">Monthly Salary</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {employees.length === 0 && (
                        <tr><td colSpan={9} className="eh-empty-state">No employees added yet. Select <b>+ Add Employee</b> to create your first employee record.</td></tr>
                      )}
                      {employees
                        .filter((e) => {
                          const matchesFilter =
                            employeeStatusFilter === 'ALL' || e.activeStatus === employeeStatusFilter;
                          const q = employeeSearch.toLowerCase();
                          const matchesSearch =
                            !q ||
                            e.fullName.toLowerCase().includes(q) ||
                            e.employeeId.toLowerCase().includes(q) ||
                            e.department.toLowerCase().includes(q) ||
                            (e.tin || '').includes(q) ||
                            (e.sssNumber || '').includes(q);
                          return matchesFilter && matchesSearch;
                        })
                        .map((e) => (
                          <tr key={e.employeeId}>
                            <td>
                              <b>{e.employeeId}</b>
                            </td>
                            <td>{e.fullName}</td>
                            <td>{e.department}</td>
                            <td>{e.position}</td>
                            <td>{e.payType}</td>
                            <td>{e.payrollFrequency}</td>
                            <td className="eh-right">{peso(e.monthlySalary)}</td>
                            <td>
                              <span className={`eh-tag ${e.activeStatus === 'ACTIVE' ? 'ok' : 'warn'}`}>
                                {e.activeStatus}
                              </span>
                            </td>
                            <td>
                              <div className="flex items-center gap-1">
                                <button
                                  className="eh-btn small"
                                  onClick={() => {
                                    setEditingEmployee(e);
                                    setShowEmployeeModal(true);
                                  }}
                                >
                                  Edit
                                </button>
                                <button
                                  className="eh-btn small"
                                  onClick={() => {
                                    const updated = employees.map((x) =>
                                      x.employeeId === e.employeeId
                                        ? {
                                            ...x,
                                            activeStatus:
                                              x.activeStatus === 'ACTIVE'
                                                ? ('INACTIVE' as const)
                                                : ('ACTIVE' as const)
                                          }
                                        : x
                                    );
                                    setEmployees(updated);
                                    logAction('Toggle Employee Status', e.employeeId);
                                  }}
                                >
                                  {e.activeStatus === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ================= PAGE 3: ATTENDANCE ================= */}
          {currentPage === 'attendance' && (
            <div className="space-y-4">
              <div className="eh-section-title">
                <div>
                  <h2>Attendance / Daily Time Record</h2>
                  <div className="eh-muted">Upload a DTR export or record time in/out, overtime, night differential, rest days, holidays and leave.</div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className="eh-btn primary"
                    disabled={employees.length === 0}
                    title={employees.length === 0 ? 'Add an employee before recording attendance.' : undefined}
                    onClick={() => {
                      setEditingAttendance(null);
                      setShowAttendanceModal(true);
                    }}
                  >
                    + Attendance
                  </button>
                </div>
              </div>

              <div className="eh-panel space-y-3">
                <div className="eh-toolbar eh-dtr-toolbar">
                  <label className="eh-btn primary small eh-upload-button" htmlFor="capotbooks-dtr-upload">
                    <UploadIcon className="h-3.5 w-3.5" /> Upload DTR CSV
                  </label>
                  <input
                    id="capotbooks-dtr-upload"
                    type="file"
                    accept=".csv,.txt,.tsv,text/csv,text/plain"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) handleDtrUpload(file);
                      event.currentTarget.value = '';
                    }}
                  />
                  <span className="eh-muted eh-dtr-help">CSV columns: Employee ID or Name, Date, Time In, Time Out, Break Minutes, OT Hours, ND Hours, Holiday, Rest Day, Leave, Leave Hours, Remarks. Imported rows stay Pending for review.</span>
                </div>
                <div className="eh-toolbar">
                  <input
                    type="month"
                    value={attMonth}
                    onChange={(e) => setAttMonth(e.target.value)}
                    className="eh-field"
                    style={{ maxWidth: 160 }}
                  />
                  <select
                    value={attEmployeeFilter}
                    onChange={(e) => setAttEmployeeFilter(e.target.value)}
                    className="eh-field"
                    style={{ maxWidth: 220 }}
                  >
                    <option value="ALL">All employees</option>
                    {employees.map((e) => (
                      <option key={e.employeeId} value={e.employeeId}>
                        {e.employeeId} &bull; {e.fullName}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="eh-table-wrap">
                  <table className="eh-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Employee</th>
                        <th>In</th>
                        <th>Out</th>
                        <th className="eh-right">Break</th>
                        <th className="eh-right">OT (hrs)</th>
                        <th className="eh-right">ND (hrs)</th>
                        <th>Holiday</th>
                        <th>Leave</th>
                        <th>Status</th>
                        <th>Remarks</th>
                      </tr>
                    </thead>
                    <tbody>
                      {attendance.filter((a) => a.date.startsWith(attMonth) && (attEmployeeFilter === 'ALL' || a.employeeId === attEmployeeFilter)).length === 0 && (
                        <tr><td colSpan={11} className="eh-empty-state">No attendance rows for this month. Upload a DTR file or add an employee and record attendance.</td></tr>
                      )}
                      {attendance
                        .filter(
                          (a) =>
                            a.date.startsWith(attMonth) &&
                            (attEmployeeFilter === 'ALL' || a.employeeId === attEmployeeFilter)
                        )
                        .map((a) => {
                          const emp = employees.find((e) => e.employeeId === a.employeeId);
                          return (
                            <tr key={a.id}>
                              <td>{dateFmt(a.date)}</td>
                              <td>{emp ? emp.fullName : a.employeeId}</td>
                              <td>{a.in || '&mdash;'}</td>
                              <td>{a.out || '&mdash;'}</td>
                              <td className="eh-right">{a.breakMin}m</td>
                              <td className="eh-right">{a.ot}h</td>
                              <td className="eh-right">{a.nd}h</td>
                              <td>{a.holiday}</td>
                              <td>{a.leave}</td>
                              <td>
                                <span className={`eh-tag ${a.approval === 'Approved' ? 'ok' : 'warn'}`}>
                                  {a.approval}
                                </span>
                              </td>
                              <td className="text-slate-500">{a.remarks}</td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ================= PAGE 4: PAYROLL ================= */}
          {currentPage === 'payroll' && (
            <div className="space-y-4">
              <div className="eh-section-title">
                <div>
                  <h2>Payroll Processing</h2>
                  <div className="eh-muted">Create period, calculate payroll, validate, approve and lock.</div>
                  {payrolls.length === 0 && <div className="eh-alert info mt-2">No payroll periods yet. Select <b>+ New Period</b> to create your first payroll run.</div>}
                </div>
                <div className="eh-toolbar">
                  <button
                    className="eh-btn"
                    onClick={() => {
                      const now = new Date();
                      const year = now.getFullYear();
                      const month = String(now.getMonth() + 1).padStart(2, '0');
                      const firstHalf = now.getDate() <= 15;
                      const from = `${year}-${month}-${firstHalf ? '01' : '16'}`;
                      const lastDay = new Date(year, now.getMonth() + 1, 0).getDate();
                      const to = `${year}-${month}-${String(firstHalf ? 15 : lastDay).padStart(2, '0')}`;
                      const nextMonth = new Date(year, now.getMonth() + (firstHalf ? 0 : 1), 1);
                      const payDate = firstHalf
                        ? `${year}-${month}-20`
                        : `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}-05`;
                      const baseId = `PR-${year}-${month}-${firstHalf ? 'P1' : 'P2'}`;
                      let newId = baseId;
                      let suffix = 2;
                      while (payrolls.some((period) => period.id === newId)) {
                        newId = `${baseId}-${suffix}`;
                        suffix += 1;
                      }
                      const workingDays = countWeekdays(from, to);
                      const periodMeta: PayrollPeriodRecord = {
                        payrollId: newId,
                        periodName: `${firstHalf ? '1st Half' : '2nd Half'} ${year}-${month}`,
                        periodType: firstHalf ? '1st Half' : '2nd Half',
                        cutoffStartDate: from,
                        cutoffEndDate: to,
                        payDate,
                        statutoryVersionId: 'SSS-2025-V1',
                        taxTableVersion: 'TAX-TRAIN-SM-T1',
                        deductSss: !firstHalf,
                        deductPhilHealth: !firstHalf,
                        deductPagIbig: !firstHalf,
                        status: 'Draft',
                        lockedTimestamp: '',
                        lockedBy: '',
                        totalWorkingDays: workingDays,
                        expectedWorkHours: workingDays * (Number(settings.hoursPerDay) || 8),
                        remarks: 'Created in CAPOTBOOKS Payroll'
                      };
                      const newP: ProcessedPayrollPeriod = {
                        id: newId,
                        from,
                        to,
                        payDate,
                        frequency: 'Semi-Monthly',
                        status: 'DRAFT',
                        rows: employees.map((emp) => calculatePayrollWithDtr(periodMeta, emp, undefined)),
                        created: new Date().toISOString(),
                        locked: false
                      };
                      setPayrolls((prev) => [newP, ...prev]);
                      setSelectedPayrollId(newId);
                      logAction('Create Payroll Period', newId);
                    }}
                  >
                    + New Period
                  </button>

                  <button
                    className="eh-btn primary"
                    disabled={!employees.length || !payrolls.some((period) => period.id === currentPayroll.id)}
                    onClick={() => {
                      if (currentPayroll.locked) {
                        alert('This payroll is locked and immutable.');
                        return;
                      }
                      if (!payrolls.some((period) => period.id === currentPayroll.id) || employees.length === 0) {
                        alert('Add at least one employee and create a payroll period before processing payroll.');
                        return;
                      }
                      const calculatedRows = employees.map((emp) => calculatePayrollWithDtr(targetPeriod, emp, undefined));
                      const updated = payrolls.map((p) =>
                        p.id === currentPayroll.id ? { ...p, rows: calculatedRows, status: 'DRAFT' as const } : p
                      );
                      setPayrolls(updated);
                      logAction('Process Payroll Calculation Batch', currentPayroll.id);
                      alert('Payroll calculation complete. Run validation before approval.');
                    }}
                  >
                    Process Payroll
                  </button>

                </div>
              </div>

              {/* Form Grid & KPI Row */}
              <div className="eh-panel space-y-4">
                <div className="eh-formgrid">
                  <div className="eh-field">
                    <label>Payroll ID</label>
                    <select
                      value={selectedPayrollId}
                      onChange={(e) => setSelectedPayrollId(e.target.value)}
                    >
                      {payrolls.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.id} ({p.frequency}) &bull; {p.status}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="eh-field">
                    <label>Coverage From</label>
                    <input type="date" value={currentPayroll.from} readOnly />
                  </div>

                  <div className="eh-field">
                    <label>Coverage To</label>
                    <input type="date" value={currentPayroll.to} readOnly />
                  </div>

                  <div className="eh-field">
                    <label>Pay Date</label>
                    <input type="date" value={currentPayroll.payDate} readOnly />
                  </div>

                  <div className="eh-field">
                    <label>Frequency</label>
                    <input type="text" value={currentPayroll.frequency} readOnly />
                  </div>

                  <div className="eh-field">
                    <label>Status</label>
                    <input type="text" value={currentPayroll.status} readOnly />
                  </div>
                </div>

                <div className="eh-kpi-row">
                  <div className="mini">
                    <b>{peso(totalGrossPayroll)}</b>
                    <span>Gross</span>
                  </div>
                  <div className="mini">
                    <b>{peso(totalGrossPayroll - totalNetPayroll)}</b>
                    <span>Deductions</span>
                  </div>
                  <div className="mini">
                    <b>{peso(totalNetPayroll)}</b>
                    <span>Net Pay</span>
                  </div>
                  <div className="mini">
                    <b>{peso(totalEmployerCost)}</b>
                    <span>Employer Cost</span>
                  </div>
                  <div className="mini">
                    <b>{peso(govContributions.BIR)}</b>
                    <span>Tax Withheld</span>
                  </div>
                </div>
              </div>

              {/* Register Table & Workflow Actions */}
              <div className="eh-section-title">
                <h2>Payroll Register</h2>
                <div className="eh-toolbar">
                  <button className="eh-btn small success" onClick={runChecks}>
                    Validate
                  </button>
                  <button
                    className="eh-btn small"
                    disabled={!payrolls.some((period) => period.id === currentPayroll.id)}
                    onClick={() => {
                      const updated = payrolls.map((p) =>
                        p.id === currentPayroll.id ? { ...p, status: 'CHECKED' as const } : p
                      );
                      setPayrolls(updated);
                      logAction('Submit / Mark Checked', currentPayroll.id);
                    }}
                  >
                    Submit / Mark Checked
                  </button>
                  <button
                    className="eh-btn small"
                    disabled={!payrolls.some((period) => period.id === currentPayroll.id)}
                    onClick={() => {
                      const updated = payrolls.map((p) =>
                        p.id === currentPayroll.id ? { ...p, status: 'APPROVED' as const } : p
                      );
                      setPayrolls(updated);
                      logAction('Approve Payroll', currentPayroll.id);
                    }}
                  >
                    Approve
                  </button>
                  <button
                    className="eh-btn small danger"
                    disabled={!payrolls.some((period) => period.id === currentPayroll.id)}
                    onClick={() => {
                      if (currentPayroll.status !== 'APPROVED') {
                        alert('Only APPROVED payroll can be locked.');
                        return;
                      }
                      const updated = payrolls.map((p) =>
                        p.id === currentPayroll.id ? { ...p, status: 'LOCKED' as const, locked: true } : p
                      );
                      setPayrolls(updated);
                      logAction('Lock Payroll Immutability', currentPayroll.id);
                    }}
                  >
                    Lock
                  </button>
                  <button className="eh-btn small" onClick={() => handleDownloadCsv('Register')}>
                    Export CSV
                  </button>
                </div>
              </div>

              <div className="eh-panel">
                <div className="eh-table-wrap">
                  <table className="eh-table">
                    <thead>
                      <tr>
                        <th>Employee</th>
                        <th>Dept</th>
                        <th className="eh-right">Basic</th>
                        <th className="eh-right">OT</th>
                        <th className="eh-right">Holiday</th>
                        <th className="eh-right">ND</th>
                        <th className="eh-right">Gross</th>
                        <th className="eh-right">SSS</th>
                        <th className="eh-right">PhilHealth</th>
                        <th className="eh-right">Pag-IBIG</th>
                        <th className="eh-right">Tax</th>
                        <th className="eh-right">Other Ded.</th>
                        <th className="eh-right">Net</th>
                        <th className="eh-right">Employer Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(currentPayroll.rows || []).length === 0 && (
                        <tr><td colSpan={14} className="eh-empty-state">{employees.length === 0 ? 'Add your employees before processing payroll.' : 'Create a payroll period and select Process Payroll to calculate employee pay.'}</td></tr>
                      )}
                      {(currentPayroll.rows || []).map((r) => (
                        <tr key={r.employeeId}>
                          <td>
                            <b>{r.employeeName}</b>
                            <div className="eh-muted text-[10px]">{r.employeeId}</div>
                          </td>
                          <td>{r.department}</td>
                          <td className="eh-right">{peso(r.basicPay)}</td>
                          <td className="eh-right">{peso(r.overtimePay)}</td>
                          <td className="eh-right">{peso(r.holidayPay)}</td>
                          <td className="eh-right">{peso(r.nightDiffPay)}</td>
                          <td className="eh-right font-bold">{peso(r.grossPay)}</td>
                          <td className="eh-right">{peso(r.sssEe)}</td>
                          <td className="eh-right">{peso(r.philHealthEe)}</td>
                          <td className="eh-right">{peso(r.pagIbigEe)}</td>
                          <td className="eh-right">{peso(r.withholdingTax)}</td>
                          <td className="eh-right">{peso(r.otherDeductions + r.lateDeduction)}</td>
                          <td className="eh-right font-bold text-emerald-700">{peso(r.netPay)}</td>
                          <td className="eh-right text-slate-600">{peso(r.totalEmployerCost)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="eh-footer-note">
                Rule mode: {currentPayroll.frequency}. Statutory values pulled from version-controlled rates.
              </div>
            </div>
          )}

          {/* ================= PAGE 5: PAYSLIP ================= */}
          {currentPage === 'payslip' && (
            <div className="space-y-4">
              <div className="eh-section-title no-print">
                <div>
                  <h2>Official Payslip</h2>
                  <div className="eh-muted">Select employee and payroll period, then preview, print or save as PDF.</div>
                </div>
                <div className="eh-toolbar">
                  <select
                    value={selectedPayrollId}
                    onChange={(e) => setSelectedPayrollId(e.target.value)}
                    className="eh-field"
                    style={{ maxWidth: 180 }}
                  >
                    {payrolls.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.id}
                      </option>
                    ))}
                  </select>

                  <select
                    value={selectedPayslipEmpId || employees[0]?.employeeId || ''}
                    onChange={(e) => setSelectedPayslipEmpId(e.target.value)}
                    className="eh-field"
                    style={{ maxWidth: 220 }}
                  >
                    {employees.map((e) => (
                      <option key={e.employeeId} value={e.employeeId}>
                        {e.employeeId} &bull; {e.fullName}
                      </option>
                    ))}
                  </select>

                  <button className="eh-btn" disabled={!targetPayslipEmp || !currentPayroll.id || !targetCalc} onClick={() => setShowPdfPreviewModal(true)}>
                    <Eye className="h-3.5 w-3.5" />
                    <span>Read-Only PDF Preview</span>
                  </button>

                  <button className="eh-btn primary" disabled={!targetPayslipEmp || !currentPayroll.id || !targetCalc} onClick={handleDownloadOfficialPdf}>
                    <FileDown className="h-3.5 w-3.5" />
                    <span>Download Official PDF</span>
                  </button>

                  <button className="eh-btn" disabled={!targetPayslipEmp || !currentPayroll.id || !targetCalc} onClick={() => window.print()}>
                    <Printer className="h-3.5 w-3.5" />
                    <span>Print</span>
                  </button>
                </div>
              </div>

              {pdfStatusMessage && (
                <div className="eh-alert info">
                  <CheckCircle2 className="h-4 w-4 inline mr-1" />
                  {pdfStatusMessage}
                </div>
              )}

              {!targetPayslipEmp || !currentPayroll.id || !targetCalc ? (
                <div className="eh-panel eh-empty-state">
                  Add an employee, create a payroll period, and process payroll to generate an official payslip.
                </div>
              ) : (
              /* Exact Attached HTML Printable Payslip Card */
              <div className="eh-payslip">
                <div className="eh-split">
                  <div>
                    <h2 className="text-xl font-black text-slate-950 uppercase">{settings.companyName}</h2>
                    <div className="eh-muted text-xs">{settings.companyAddress}</div>
                    <div className="eh-muted text-xs">BIR Employer TIN: {settings.companyTIN}</div>
                  </div>
                  <div className="text-right">
                    <b className="text-sm font-bold uppercase text-slate-900">Official Payslip</b>
                    <div className="font-mono text-xs">{currentPayroll.id}</div>
                    <div className="text-xs text-slate-600">Pay Date: {dateFmt(currentPayroll.payDate)}</div>
                  </div>
                </div>

                <div className="line" />

                <div className="ps-grid text-xs">
                  <div>
                    <b>Employee:</b> {payslipData.employeeName}
                  </div>
                  <div>
                    <b>Employee ID:</b> {payslipData.employeeId}
                  </div>
                  <div>
                    <b>Department:</b> {payslipData.department}
                  </div>
                  <div>
                    <b>Position:</b> {payslipData.position}
                  </div>
                  <div>
                    <b>Coverage:</b> {payslipData.cutoffRange}
                  </div>
                  <div>
                    <b>Frequency:</b> {payslipData.payType} Paid (Semi-Monthly)
                  </div>
                </div>

                <div className="line" />

                <table className="text-xs">
                  <tbody>
                    <tr className="bg-slate-50 font-bold">
                      <td>Earnings</td>
                      <td className="eh-right">Amount</td>
                    </tr>
                    <tr>
                      <td>Basic Salary (Period Share)</td>
                      <td className="eh-right">{peso(payslipData.basicPay)}</td>
                    </tr>
                    {payslipData.overtimePay > 0 && (
                      <tr>
                        <td>Overtime ({payslipData.overtimeHours} hrs)</td>
                        <td className="eh-right">{peso(payslipData.overtimePay)}</td>
                      </tr>
                    )}
                    {payslipData.nightDiffPay > 0 && (
                      <tr>
                        <td>Night Differential ({payslipData.nightDiffHours} hrs)</td>
                        <td className="eh-right">{peso(payslipData.nightDiffPay)}</td>
                      </tr>
                    )}
                    {payslipData.holidayPay > 0 && (
                      <tr>
                        <td>Holiday Premium Pay</td>
                        <td className="eh-right">{peso(payslipData.holidayPay)}</td>
                      </tr>
                    )}
                    {payslipData.taxableAllowances > 0 && (
                      <tr>
                        <td>Taxable Allowance / Commission</td>
                        <td className="eh-right">{peso(payslipData.taxableAllowances)}</td>
                      </tr>
                    )}
                    {payslipData.nonTaxableRiceSubsidy > 0 && (
                      <tr>
                        <td>Rice Subsidy (Non-Taxable De Minimis)</td>
                        <td className="eh-right">{peso(payslipData.nonTaxableRiceSubsidy)}</td>
                      </tr>
                    )}
                    <tr className="grand border-t border-b border-slate-300">
                      <td>Total Gross Earnings</td>
                      <td className="eh-right">{peso(payslipData.grossPay)}</td>
                    </tr>

                    <tr className="bg-slate-50 font-bold">
                      <td>Deductions</td>
                      <td className="eh-right">Amount</td>
                    </tr>
                    <tr>
                      <td>SSS Contribution (EE Share)</td>
                      <td className="eh-right">{peso(payslipData.sssEe)}</td>
                    </tr>
                    <tr>
                      <td>PhilHealth Contribution (EE Share)</td>
                      <td className="eh-right">{peso(payslipData.philHealthEe)}</td>
                    </tr>
                    <tr>
                      <td>Pag-IBIG / HDMF (EE Share)</td>
                      <td className="eh-right">{peso(payslipData.pagIbigEe)}</td>
                    </tr>
                    <tr>
                      <td>BIR TRAIN Withholding Tax</td>
                      <td className="eh-right">{peso(payslipData.withholdingTax)}</td>
                    </tr>
                    {payslipData.lateDeduction > 0 && (
                      <tr>
                        <td>Tardiness / Late Penalty</td>
                        <td className="eh-right">{peso(payslipData.lateDeduction)}</td>
                      </tr>
                    )}
                    {payslipData.otherDeductions > 0 && (
                      <tr>
                        <td>Other Deductions / Loans</td>
                        <td className="eh-right">{peso(payslipData.otherDeductions)}</td>
                      </tr>
                    )}
                    <tr className="grand border-t border-b border-slate-300 text-rose-700">
                      <td>Total Deductions</td>
                      <td className="eh-right">-{peso(payslipData.totalDeductions)}</td>
                    </tr>

                    <tr className="grand text-emerald-800 bg-emerald-50">
                      <td>NET TAKE-HOME PAY</td>
                      <td className="eh-right">{peso(payslipData.netPay)}</td>
                    </tr>
                  </tbody>
                </table>

                <div className="line" />

                <div className="ps-grid text-xs text-slate-600">
                  <div>
                    <b>Disbursed To:</b> {payslipData.bankName} (Acct: {payslipData.bankAccountNumber})
                  </div>
                  <div>
                    <b>Employer Burden:</b> {peso(payslipData.totalEmployerCost)}
                  </div>
                  <div>
                    <b>BIR TIN:</b> {payslipData.tin}
                  </div>
                  <div>
                    <b>SSS ID:</b> {payslipData.sssNumber}
                  </div>
                </div>

                <div className="eh-footer-note text-center">
                  Generated by PH Payroll Pro Enterprise Hub &bull; Confidential pursuant to RA 10173 (Data Privacy Act of 2012)
                </div>
              </div>
              )}
            </div>
          )}

          {/* ================= PAGE 6: REPORTS ================= */}
          {currentPage === 'reports' && (
            <div className="space-y-4">
              <div className="eh-section-title">
                <div>
                  <h2>Reports &amp; Remittance</h2>
                  <div className="eh-muted">Export payroll register and government contribution summaries. Process Payroll applies uploaded DTR overtime, night differential and paid leave to matching employees in the selected cutoff.</div>
                </div>
              </div>

              <div className="eh-grid eh-two">
                <div className="eh-panel">
                  <div className="eh-section-title">
                    <h2>Government CSV Exports</h2>
                  </div>
                  <div className="eh-toolbar">
                    <button className="eh-btn" onClick={() => handleDownloadCsv('SSS')}>
                      SSS CSV
                    </button>
                    <button className="eh-btn" onClick={() => handleDownloadCsv('PhilHealth')}>
                      PhilHealth CSV
                    </button>
                    <button className="eh-btn" onClick={() => handleDownloadCsv('PagIBIG')}>
                      Pag-IBIG CSV
                    </button>
                    <button className="eh-btn" onClick={() => handleDownloadCsv('BIR')}>
                      BIR Tax CSV
                    </button>
                  </div>
                  <div className="eh-footer-note">
                    Standardized data exports for SSS R-3, PhilHealth RF-1, HDMF MCRF, and BIR 1601-C reporting.
                  </div>
                </div>

                <div className="eh-panel">
                  <div className="eh-section-title">
                    <h2>Year-to-Date Snapshot</h2>
                  </div>
                  <div className="space-y-2 text-xs max-h-48 overflow-y-auto">
                    {employees.length === 0 && <div className="eh-muted">Employee records will appear here after you add them.</div>}
                    {employees.map((e) => (
                      <div key={e.employeeId} className="eh-split py-1 border-b border-slate-100">
                        <span>
                          {e.employeeId} &bull; {e.fullName}
                        </span>
                        <b>{peso(e.monthlySalary * 2)} Gross</b>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="eh-panel">
                <div className="eh-section-title">
                  <h2>Latest Payroll Summary by Department</h2>
                </div>
                <div className="eh-table-wrap">
                  <table className="eh-table">
                    <thead>
                      <tr>
                        <th>Department</th>
                        <th className="eh-right">Headcount</th>
                        <th className="eh-right">Gross</th>
                        <th className="eh-right">Employee Deductions</th>
                        <th className="eh-right">Net</th>
                        <th className="eh-right">Employer Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(deptDist).map(([dept, gross]) => {
                        const count = (currentPayroll.rows || []).filter((r) => r.department === dept).length;
                        const ded = (currentPayroll.rows || [])
                          .filter((r) => r.department === dept)
                          .reduce((s, r) => s + r.totalDeductions, 0);
                        const net = (currentPayroll.rows || [])
                          .filter((r) => r.department === dept)
                          .reduce((s, r) => s + r.netPay, 0);
                        const cost = (currentPayroll.rows || [])
                          .filter((r) => r.department === dept)
                          .reduce((s, r) => s + r.totalEmployerCost, 0);
                        return (
                          <tr key={dept}>
                            <td>{dept}</td>
                            <td className="eh-right">{count}</td>
                            <td className="eh-right">{peso(gross)}</td>
                            <td className="eh-right">{peso(ded)}</td>
                            <td className="eh-right font-bold">{peso(net)}</td>
                            <td className="eh-right">{peso(cost)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ================= PAGE 7: SETTINGS ================= */}
          {currentPage === 'settings' && (
            <div className="space-y-4">
              <div className="eh-section-title">
                <div>
                  <h2>Settings</h2>
                  <div className="eh-muted">Company data, payroll assumptions and configurable statutory rules.</div>
                </div>
                <button
                  className="eh-btn primary"
                  onClick={() => {
                    logAction('Save System Settings', 'SETTINGS');
                    alert('Settings updated successfully.');
                  }}
                >
                  Save Settings
                </button>
              </div>

              <div className="eh-grid eh-two">
                <div className="eh-panel">
                  <div className="eh-section-title">
                    <h2>Active Profile</h2>
                  </div>
                  <p className="eh-muted text-xs mb-3">Company name, TIN and address are linked to the active CAPOTBOOKS profile: <strong>{currentCompany.name}</strong>. To change them, update Business Profile or Client Profiles.</p>
                  <div className="eh-formgrid">
                    <div className="eh-field">
                      <label>Company Name</label>
                      <input value={settings.companyName} readOnly title="Synced from the active CAPOTBOOKS profile" />
                    </div>
                    <div className="eh-field">
                      <label>Company TIN</label>
                      <input value={settings.companyTIN} readOnly title="Synced from the active CAPOTBOOKS profile" />
                    </div>
                    <div className="eh-field">
                      <label>Currency</label>
                      <input value="PHP / ₱" readOnly />
                    </div>
                    <div className="eh-field eh-full">
                      <label>Address</label>
                      <input value={settings.companyAddress} readOnly title="Synced from the active CAPOTBOOKS profile" />
                    </div>
                    <div className="eh-field eh-full">
                      <label>Payroll Email</label>
                      <input
                        value={settings.payrollEmail}
                        onChange={(e) => setSettings({ ...settings, payrollEmail: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                <div className="eh-panel">
                  <div className="eh-section-title">
                    <h2>Payroll Assumptions</h2>
                  </div>
                  <div className="eh-formgrid">
                    <div className="eh-field">
                      <label>Hours Per Day</label>
                      <input
                        type="number"
                        value={settings.hoursPerDay}
                        onChange={(e) => setSettings({ ...settings, hoursPerDay: Number(e.target.value) })}
                      />
                    </div>
                    <div className="eh-field">
                      <label>Days/Month Divisor</label>
                      <input
                        type="number"
                        value={settings.daysMonth}
                        onChange={(e) => setSettings({ ...settings, daysMonth: Number(e.target.value) })}
                      />
                    </div>
                    <div className="eh-field">
                      <label>Periods/Month (Semi)</label>
                      <input
                        type="number"
                        value={settings.periodsSemi}
                        onChange={(e) => setSettings({ ...settings, periodsSemi: Number(e.target.value) })}
                      />
                    </div>
                    <div className="eh-field">
                      <label>Night Differential Rate</label>
                      <input
                        type="number"
                        step="0.01"
                        value={settings.ndRate}
                        onChange={(e) => setSettings({ ...settings, ndRate: Number(e.target.value) })}
                      />
                    </div>
                    <div className="eh-field">
                      <label>Ordinary OT Rate</label>
                      <input
                        type="number"
                        step="0.01"
                        value={settings.otRate}
                        onChange={(e) => setSettings({ ...settings, otRate: Number(e.target.value) })}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* SSS, PhilHealth, Pag-IBIG Cards */}
              <div className="eh-grid eh-three">
                <div className="eh-panel">
                  <div className="eh-section-title">
                    <h2>SSS</h2>
                  </div>
                  <div className="eh-formgrid">
                    <div className="eh-field">
                      <label>Employee Rate</label>
                      <input type="number" step="0.001" value={settings.sss.ee} readOnly />
                    </div>
                    <div className="eh-field">
                      <label>Employer Rate</label>
                      <input type="number" step="0.001" value={settings.sss.er} readOnly />
                    </div>
                    <div className="eh-field">
                      <label>Max MSC</label>
                      <input type="number" value={settings.sss.max} readOnly />
                    </div>
                    <div className="eh-field eh-full">
                      <label>Source</label>
                      <input value={settings.sss.source} readOnly />
                    </div>
                  </div>
                </div>

                <div className="eh-panel">
                  <div className="eh-section-title">
                    <h2>PhilHealth</h2>
                  </div>
                  <div className="eh-formgrid">
                    <div className="eh-field">
                      <label>Premium Rate</label>
                      <input type="number" step="0.001" value={settings.ph.rate} readOnly />
                    </div>
                    <div className="eh-field">
                      <label>Income Floor</label>
                      <input type="number" value={settings.ph.floor} readOnly />
                    </div>
                    <div className="eh-field">
                      <label>Ceiling</label>
                      <input type="number" value={settings.ph.ceiling} readOnly />
                    </div>
                    <div className="eh-field eh-full">
                      <label>Source</label>
                      <input value={settings.ph.source} readOnly />
                    </div>
                  </div>
                </div>

                <div className="eh-panel">
                  <div className="eh-section-title">
                    <h2>Pag-IBIG</h2>
                  </div>
                  <div className="eh-formgrid">
                    <div className="eh-field">
                      <label>EE Rate (&gt; ₱1,500)</label>
                      <input type="number" step="0.001" value={settings.pi.highRate} readOnly />
                    </div>
                    <div className="eh-field">
                      <label>ER Rate</label>
                      <input type="number" step="0.001" value={settings.pi.erRate} readOnly />
                    </div>
                    <div className="eh-field">
                      <label>Ceiling</label>
                      <input type="number" value={settings.pi.ceiling} readOnly />
                    </div>
                    <div className="eh-field eh-full">
                      <label>Source</label>
                      <input value={settings.pi.source} readOnly />
                    </div>
                  </div>
                </div>
              </div>

              {/* BIR Tax Table Panel */}
              <div className="eh-panel">
                <div className="eh-section-title">
                  <h2>BIR Withholding Tax (TRAIN Annex E)</h2>
                </div>
                <div className="eh-alert info">
                  Official BIR Revised Withholding Tax Table under RA 10963 (TRAIN Law), effective January 1, 2023 onwards.
                </div>
                <div className="eh-table-wrap">
                  <table className="eh-table">
                    <thead>
                      <tr>
                        <th>Frequency</th>
                        <th>Compensation Tier 1</th>
                        <th>Tier 2 (15%)</th>
                        <th>Tier 3 (20%)</th>
                        <th>Tier 4 (25%)</th>
                        <th>Tier 5 (30%)</th>
                        <th>Tier 6 (35%)</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td><b>Semi-Monthly</b></td>
                        <td>0 – ₱10,417 (0.00)</td>
                        <td>₱10,417 – ₱16,666 (15%)</td>
                        <td>₱16,667 – ₱33,332 (₱937.50 + 20%)</td>
                        <td>₱33,333 – ₱83,332 (₱4,270.70 + 25%)</td>
                        <td>₱83,333 – ₱333,332 (₱16,770.70 + 30%)</td>
                        <td>&gt; ₱333,333 (₱91,770.70 + 35%)</td>
                      </tr>
                      <tr>
                        <td><b>Monthly</b></td>
                        <td>0 – ₱20,833 (0.00)</td>
                        <td>₱20,833 – ₱33,332 (15%)</td>
                        <td>₱33,333 – ₱66,666 (₱1,875.00 + 20%)</td>
                        <td>₱66,667 – ₱166,666 (₱8,541.80 + 25%)</td>
                        <td>₱166,667 – ₱666,666 (₱33,541.80 + 30%)</td>
                        <td>&gt; ₱666,667 (₱183,541.80 + 35%)</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Statutory Compliance Registry */}
              <div className="eh-panel">
                <div className="eh-section-title">
                  <h2>13-Point Regulatory Compliance Registry</h2>
                </div>
                <div className="eh-table-wrap">
                  <table className="eh-table">
                    <thead>
                      <tr>
                        <th>Agency</th>
                        <th>Rule Item</th>
                        <th>Effective Date</th>
                        <th>Last Verified</th>
                        <th>Official Citation</th>
                      </tr>
                    </thead>
                    <tbody>
                      {STATUTORY_VERIFICATION_AUDIT_MASTER.slice(0, 8).map((item) => (
                        <tr key={item.id}>
                          <td><b>{item.regulatoryBody}</b></td>
                          <td>{item.governingLaw} &bull; {item.category}</td>
                          <td>{item.effectiveFrom}</td>
                          <td>{item.verificationDate}</td>
                          <td>
                            <a
                              href={item.officialSourceUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-blue-600 hover:underline flex items-center gap-1"
                            >
                              <span>{item.circularOrIssuance}</span>
                              <ExternalLink className="h-3 w-3 inline" />
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

        </div>
      </main>

      {/* ================= EMPLOYEE MODAL (MATCHING ATTACHED HTML) ================= */}
      {showEmployeeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b border-slate-200 flex justify-between items-center">
              <h3 className="font-bold text-base text-slate-900">
                {editingEmployee?.employeeId ? 'Edit Employee' : 'Add Employee'}
              </h3>
              <button
                className="text-slate-400 hover:text-slate-700 text-xl font-bold cursor-pointer"
                onClick={() => setShowEmployeeModal(false)}
              >
                &times;
              </button>
            </div>

            <div className="p-6">
              <div className="eh-formgrid">
                <div className="eh-field">
                  <label>Employee ID (auto)</label>
                  <input
                    value={editingEmployee?.employeeId || nextEmployeeId}
                    readOnly
                    style={{ background: '#f1f5f9', fontWeight: 700 }}
                  />
                  <button
                    type="button"
                    className="text-[11px] text-blue-600 hover:underline mt-1 cursor-pointer"
                    onClick={() => {
                      setIdFormatDraft(employeeIdFormat);
                      setShowIdFormatModal(true);
                    }}
                  >
                    Change ID format
                  </button>
                </div>

                <div className="eh-field">
                  <label>First Name *</label>
                  <input
                    value={editingEmployee?.firstName || ''}
                    onChange={(e) =>
                      setEditingEmployee({
                        ...editingEmployee,
                        firstName: e.target.value,
                        fullName: `${e.target.value} ${editingEmployee?.lastName || ''}`
                      })
                    }
                  />
                </div>

                <div className="eh-field">
                  <label>Middle Name</label>
                  <input
                    value={editingEmployee?.middleName || ''}
                    onChange={(e) => setEditingEmployee({ ...editingEmployee, middleName: e.target.value })}
                  />
                </div>

                <div className="eh-field">
                  <label>Last Name *</label>
                  <input
                    value={editingEmployee?.lastName || ''}
                    onChange={(e) =>
                      setEditingEmployee({
                        ...editingEmployee,
                        lastName: e.target.value,
                        fullName: `${editingEmployee?.firstName || ''} ${e.target.value}`
                      })
                    }
                  />
                </div>

                <div className="eh-field">
                  <label>Birthdate</label>
                  <input
                    type="date"
                    max={todayIso}
                    value={editingEmployee?.dateOfBirth || ''}
                    onChange={(e) => setEditingEmployee({ ...editingEmployee, dateOfBirth: e.target.value })}
                  />
                </div>

                <div className="eh-field">
                  <label>Marital Status</label>
                  <select
                    value={editingEmployee?.civilStatus || 'Single'}
                    onChange={(e) =>
                      setEditingEmployee({ ...editingEmployee, civilStatus: e.target.value as EmployeeRecord['civilStatus'] })
                    }
                  >
                    {CIVIL_STATUSES.map((status) => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                </div>

                <div className="eh-field eh-full">
                  <label>Address</label>
                  <textarea
                    rows={2}
                    placeholder="House/Unit No., Street, Barangay, City/Municipality, Province, ZIP"
                    value={editingEmployee?.address || ''}
                    onChange={(e) => setEditingEmployee({ ...editingEmployee, address: e.target.value })}
                  />
                </div>

                <div className="eh-field">
                  <label>TIN</label>
                  <input
                    inputMode="numeric"
                    placeholder="000-000-000-000"
                    value={editingEmployee?.tin || ''}
                    onChange={(e) => setEditingEmployee({ ...editingEmployee, tin: formatTin(e.target.value) })}
                  />
                </div>

                <div className="eh-field">
                  <label>SSS No.</label>
                  <input
                    inputMode="numeric"
                    placeholder="00-0000000-0"
                    value={editingEmployee?.sssNumber || ''}
                    onChange={(e) => setEditingEmployee({ ...editingEmployee, sssNumber: formatSss(e.target.value) })}
                  />
                </div>

                <div className="eh-field">
                  <label>HDMF (Pag-IBIG) No.</label>
                  <input
                    inputMode="numeric"
                    placeholder="0000-0000-0000"
                    value={editingEmployee?.pagIbigNumber || ''}
                    onChange={(e) => setEditingEmployee({ ...editingEmployee, pagIbigNumber: formatHdmf(e.target.value) })}
                  />
                </div>

                <div className="eh-field">
                  <label>PhilHealth No.</label>
                  <input
                    inputMode="numeric"
                    placeholder="00-000000000-0"
                    value={editingEmployee?.philHealthNumber || ''}
                    onChange={(e) => setEditingEmployee({ ...editingEmployee, philHealthNumber: formatPhilHealth(e.target.value) })}
                  />
                </div>

                <div className="eh-field">
                  <label>Email Address</label>
                  <input
                    value={editingEmployee?.workEmail || ''}
                    onChange={(e) =>
                      setEditingEmployee({ ...editingEmployee, workEmail: e.target.value })
                    }
                  />
                </div>

                <div className="eh-field">
                  <label>Department</label>
                  <input
                    value={editingEmployee?.department || ''}
                    onChange={(e) =>
                      setEditingEmployee({ ...editingEmployee, department: e.target.value })
                    }
                  />
                </div>

                <div className="eh-field">
                  <label>Position</label>
                  <input
                    value={editingEmployee?.position || ''}
                    onChange={(e) =>
                      setEditingEmployee({ ...editingEmployee, position: e.target.value })
                    }
                  />
                </div>

                <div className="eh-field">
                  <label>Monthly Salary (PHP)</label>
                  <input
                    type="number"
                    value={editingEmployee?.monthlySalary ?? ''}
                    onChange={(e) =>
                      setEditingEmployee({
                        ...editingEmployee,
                        monthlySalary: Number(e.target.value),
                        dailyRate: Number(e.target.value) / 26,
                        hourlyRate: Number(e.target.value) / 26 / 8
                      })
                    }
                  />
                </div>

                <div className="eh-field">
                  <label>Pay Type</label>
                  <select
                    value={editingEmployee?.payType || 'Monthly'}
                    onChange={(e) =>
                      setEditingEmployee({ ...editingEmployee, payType: e.target.value as any })
                    }
                  >
                    <option value="Monthly">Monthly</option>
                    <option value="Daily">Daily</option>
                    <option value="Hourly">Hourly</option>
                  </select>
                </div>

                <div className="eh-field">
                  <label>Payroll Frequency</label>
                  <select
                    value={editingEmployee?.payrollFrequency || 'Semi-Monthly'}
                    onChange={(e) =>
                      setEditingEmployee({ ...editingEmployee, payrollFrequency: e.target.value as any })
                    }
                  >
                    <option value="Semi-Monthly">Semi-Monthly</option>
                    <option value="Monthly">Monthly</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 flex justify-end gap-2 bg-slate-50">
              <button className="eh-btn" onClick={() => setShowEmployeeModal(false)}>
                Cancel
              </button>
              <button
                className="eh-btn primary"
                onClick={() => {
                  if (!editingEmployee?.firstName?.trim() || !editingEmployee?.lastName?.trim()) {
                    alert('First name and last name are required.');
                    return;
                  }
                  const govError = validateGovIds(editingEmployee);
                  if (govError) {
                    alert(govError);
                    return;
                  }
                  const tinKey = onlyDigits(editingEmployee.tin || '');
                  const empId = editingEmployee.employeeId || nextEmployeeId;
                  if (tinKey && employees.some((x) => x.employeeId !== empId && onlyDigits(x.tin || '') === tinKey)) {
                    alert('Another employee already has this TIN.');
                    return;
                  }
                  const existingIndex = employees.findIndex((x) => x.employeeId === empId);
                  if (existingIndex >= 0) {
                    const updated = [...employees];
                    updated[existingIndex] = { ...updated[existingIndex], ...editingEmployee, employeeId: empId };
                    setEmployees(updated);
                    logAction('Update Employee', empId);
                  } else {
                    const monthly = Number(editingEmployee.monthlySalary) || 0;
                    const newEmp: EmployeeRecord = {
                      employeeId: empId,
                      employeeNumber: empId,
                      firstName: editingEmployee.firstName || '',
                      middleName: editingEmployee.middleName || '',
                      lastName: editingEmployee.lastName || '',
                      suffix: '',
                      fullName: editingEmployee.fullName || `${editingEmployee.firstName} ${editingEmployee.lastName}`,
                      preferredName: editingEmployee.firstName || '',
                      dateOfBirth: editingEmployee.dateOfBirth || '',
                      civilStatus: editingEmployee.civilStatus || 'Single',
                      dependentsCount: 0,
                      address: (editingEmployee.address || '').trim(),
                      contactNumber: '',
                      workEmail: editingEmployee.workEmail || '',
                      tin: editingEmployee.tin || '',
                      sssNumber: editingEmployee.sssNumber || '',
                      pagIbigNumber: editingEmployee.pagIbigNumber || '',
                      philHealthNumber: editingEmployee.philHealthNumber || '',
                      dateHired: '',
                      dateRegularized: '',
                      dateSeparated: '',
                      employmentStatus: 'Regular',
                      employmentCategory: 'Rank & File',
                      department: editingEmployee.department || '',
                      position: editingEmployee.position || '',
                      location: '',
                      supervisorId: '',
                      payType: editingEmployee.payType || 'Monthly',
                      payrollFrequency: editingEmployee.payrollFrequency || 'Semi-Monthly',
                      monthlySalary: monthly,
                      dailyRate: Number(editingEmployee.dailyRate ?? (monthly / 26)) || 0,
                      hourlyRate: Number(editingEmployee.hourlyRate ?? (monthly / 26 / 8)) || 0,
                      activeStatus: 'ACTIVE',
                      remarks: ''
                    };
                    setEmployees([...employees, newEmp]);
                    logAction('Add Employee', newEmp.employeeId);
                  }
                  setShowEmployeeModal(false);
                }}
              >
                Save Employee
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= EMPLOYEE ID FORMAT MODAL ================= */}
      {showIdFormatModal && (() => {
        const draft = resolveIdFormat(idFormatDraft);
        const preview = [0, 1, 2].map((i) => `${idBase(draft, new Date().getFullYear())}${String(draft.startNumber + i).padStart(draft.digits, '0')}`);
        return (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
            <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
              <div className="p-4 border-b border-slate-200 flex justify-between items-center">
                <h3 className="font-bold text-base text-slate-900">Employee ID Format</h3>
                <button className="text-slate-400 hover:text-slate-700 text-xl font-bold cursor-pointer" onClick={() => setShowIdFormatModal(false)}>&times;</button>
              </div>
              <div className="p-6 space-y-4">
                <div className="eh-formgrid" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
                  <div className="eh-field">
                    <label>Prefix</label>
                    <input
                      maxLength={10}
                      placeholder="EMP"
                      value={idFormatDraft.prefix}
                      onChange={(e) => setIdFormatDraft({ ...idFormatDraft, prefix: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })}
                    />
                  </div>
                  <div className="eh-field">
                    <label>Separator</label>
                    <select value={idFormatDraft.separator} onChange={(e) => setIdFormatDraft({ ...idFormatDraft, separator: e.target.value as EmployeeIdFormat['separator'] })}>
                      <option value="-">Dash ( - )</option>
                      <option value="/">Slash ( / )</option>
                      <option value=".">Dot ( . )</option>
                      <option value="_">Underscore ( _ )</option>
                      <option value="">None</option>
                    </select>
                  </div>
                  <div className="eh-field">
                    <label>Year</label>
                    <select value={idFormatDraft.yearStyle} onChange={(e) => setIdFormatDraft({ ...idFormatDraft, yearStyle: e.target.value as EmployeeIdFormat['yearStyle'] })}>
                      <option value="YYYY">4-digit (2026)</option>
                      <option value="YY">2-digit (26)</option>
                      <option value="NONE">Don't include</option>
                    </select>
                  </div>
                  <div className="eh-field">
                    <label>Number length</label>
                    <select value={idFormatDraft.digits} onChange={(e) => setIdFormatDraft({ ...idFormatDraft, digits: Number(e.target.value) })}>
                      {[3, 4, 5, 6].map((n) => <option key={n} value={n}>{n} digits</option>)}
                    </select>
                  </div>
                  <div className="eh-field">
                    <label>Start numbering at</label>
                    <input
                      type="number"
                      min={1}
                      value={idFormatDraft.startNumber}
                      onChange={(e) => setIdFormatDraft({ ...idFormatDraft, startNumber: Number(e.target.value) })}
                    />
                  </div>
                </div>
                <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-sm">
                  <div className="text-[11px] font-bold text-slate-500 mb-1">PREVIEW</div>
                  <b>{preview.join('  \u2022  ')}</b>
                  <div className="eh-muted mt-2">Applies to new employees only. Existing IDs are never changed, and numbering continues from the highest existing number that uses the same prefix and year.</div>
                </div>
              </div>
              <div className="p-4 border-t border-slate-200 flex justify-end gap-2 bg-slate-50">
                <button className="eh-btn" onClick={() => setShowIdFormatModal(false)}>Cancel</button>
                <button
                  className="eh-btn primary"
                  onClick={() => {
                    setSettings((prev: any) => ({ ...prev, employeeIdFormat: draft }));
                    logAction('Update Employee ID Format', `${preview[0]}`);
                    setShowIdFormatModal(false);
                  }}
                >
                  Save Format
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ================= EMPLOYEE UPLOAD PREVIEW MODAL ================= */}
      {employeeUploadPreview && (() => {
        const rows = employeeUploadPreview.rows;
        const okCount = rows.filter((r) => r.employee).length;
        const badCount = rows.length - okCount;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
            <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col">
              <div className="p-4 border-b border-slate-200 flex justify-between items-center">
                <div>
                  <h3 className="font-bold text-base text-slate-900">Upload Employees &mdash; Review</h3>
                  <div className="eh-muted">{employeeUploadPreview.fileName}</div>
                </div>
                <button className="text-slate-400 hover:text-slate-700 text-xl font-bold cursor-pointer" onClick={() => setEmployeeUploadPreview(null)}>&times;</button>
              </div>
              <div className="p-4 overflow-y-auto space-y-3">
                <div className="flex flex-wrap gap-2 items-center">
                  <span className="eh-tag ok">{okCount} ready to import</span>
                  {badCount > 0 && <span className="eh-tag warn">{badCount} will be skipped</span>}
                  <span className="eh-muted">Rows without an Employee ID get one automatically using your ID format.</span>
                </div>
                <div className="eh-table-wrap">
                  <table className="eh-table">
                    <thead>
                      <tr><th>Row</th><th>Employee ID</th><th>Name</th><th>Birthdate</th><th>Status</th><th>TIN</th><th>SSS</th><th>HDMF</th><th>PhilHealth</th><th>Result</th></tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.line}>
                          <td>{r.line}</td>
                          <td>{r.employee?.employeeId || '-'}</td>
                          <td>{r.employee?.fullName || '-'}</td>
                          <td>{r.employee?.dateOfBirth ? dateFmt(r.employee.dateOfBirth) : ''}</td>
                          <td>{r.employee?.civilStatus || ''}</td>
                          <td>{r.employee?.tin}</td>
                          <td>{r.employee?.sssNumber}</td>
                          <td>{r.employee?.pagIbigNumber}</td>
                          <td>{r.employee?.philHealthNumber}</td>
                          <td>
                            {r.error ? <span className="eh-tag warn">{r.error}</span> : r.warning ? <span className="eh-tag warn">{r.warning}</span> : <span className="eh-tag ok">OK</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="p-4 border-t border-slate-200 flex justify-between items-center gap-2 bg-slate-50">
                <button className="eh-btn" onClick={downloadEmployeeTemplate}>Download Template</button>
                <div className="flex gap-2">
                  <button className="eh-btn" onClick={() => setEmployeeUploadPreview(null)}>Cancel</button>
                  <button className="eh-btn primary" disabled={okCount === 0} onClick={confirmEmployeeUpload}>
                    Import {okCount} Employee{okCount === 1 ? '' : 's'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ================= ATTENDANCE MODAL (MATCHING ATTACHED HTML) ================= */}
      {showAttendanceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full">
            <div className="p-4 border-b border-slate-200 flex justify-between items-center">
              <h3 className="font-bold text-base text-slate-900">Record Attendance</h3>
              <button
                className="text-slate-400 hover:text-slate-700 text-xl font-bold cursor-pointer"
                onClick={() => setShowAttendanceModal(false)}
              >
                &times;
              </button>
            </div>

            <div className="p-6">
              <div className="eh-formgrid">
                <div className="eh-field">
                  <label>Employee *</label>
                  <select
                    disabled={employees.length === 0}
                    value={editingAttendance?.employeeId || employees[0]?.employeeId || ''}
                    onChange={(e) =>
                      setEditingAttendance({ ...editingAttendance, employeeId: e.target.value })
                    }
                  >
                    {employees.map((e) => (
                      <option key={e.employeeId} value={e.employeeId}>
                        {e.employeeId} &bull; {e.fullName}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="eh-field">
                  <label>Date *</label>
                  <YearDropdownDateInput value={editingAttendance?.date || new Date().toISOString().slice(0, 10)} onChange={value =>
                      setEditingAttendance({ ...editingAttendance, date: value })} className="input-base" />
                </div>

                <div className="eh-field">
                  <label>Time In</label>
                  <input
                    type="time"
                    value={editingAttendance?.in || '08:00'}
                    onChange={(e) =>
                      setEditingAttendance({ ...editingAttendance, in: e.target.value })
                    }
                  />
                </div>

                <div className="eh-field">
                  <label>Time Out</label>
                  <input
                    type="time"
                    value={editingAttendance?.out || '17:00'}
                    onChange={(e) =>
                      setEditingAttendance({ ...editingAttendance, out: e.target.value })
                    }
                  />
                </div>

                <div className="eh-field">
                  <label>Approved OT (hours)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={editingAttendance?.ot || 0}
                    onChange={(e) =>
                      setEditingAttendance({ ...editingAttendance, ot: Number(e.target.value) })
                    }
                  />
                </div>

                <div className="eh-field">
                  <label>Holiday Type</label>
                  <select
                    value={editingAttendance?.holiday || 'None'}
                    onChange={(e) =>
                      setEditingAttendance({ ...editingAttendance, holiday: e.target.value })
                    }
                  >
                    <option value="None">None</option>
                    <option value="Regular Holiday">Regular Holiday (200%)</option>
                    <option value="Special Non-Working Holiday">Special Non-Working Holiday (130%)</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 flex justify-end gap-2 bg-slate-50">
              <button className="eh-btn" onClick={() => setShowAttendanceModal(false)}>
                Cancel
              </button>
              <button
                className="eh-btn primary"
                onClick={() => {
                  if (employees.length === 0) {
                    alert('Add an employee before recording attendance.');
                    return;
                  }
                  const newAtt: AttendanceRow = {
                    id: `ATT-${Date.now()}`,
                    employeeId: editingAttendance?.employeeId || employees[0].employeeId,
                    date: editingAttendance?.date || new Date().toISOString().slice(0, 10),
                    in: editingAttendance?.in || '08:00',
                    out: editingAttendance?.out || '17:00',
                    breakMin: 60,
                    ot: editingAttendance?.ot || 0,
                    nd: 0,
                    holiday: editingAttendance?.holiday || 'None',
                    rest: false,
                    leave: 'None',
                    leaveHours: 0,
                    approval: 'Approved',
                    remarks: 'Manual entry'
                  };
                  setAttendance([newAtt, ...attendance]);
                  logAction('Record Attendance', newAtt.id);
                  setShowAttendanceModal(false);
                }}
              >
                Save Attendance
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= READ-ONLY PDF PREVIEW MODAL ================= */}
      <PayslipPdfPreviewModal
        isOpen={showPdfPreviewModal}
        onClose={() => setShowPdfPreviewModal(false)}
        payslipData={payslipData}
        onCommitDownload={handleDownloadOfficialPdf}
        isDownloading={isGeneratingPdf}
        watermarkEnabled={currentCompany.watermarkEnabled}
        watermarkText={currentCompany.watermarkEnabled ? 'PAYKAYA TRIAL • CONFIDENTIAL' : undefined}
      />
    </div>
  );
};

function UploadIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}
