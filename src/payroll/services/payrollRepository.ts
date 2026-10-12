import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import type { EmployeeRecord } from '../data/employeeDatabase';
import type { AttendanceRow, AuditEvent, ProcessedPayrollPeriod } from '../PayrollHub';

export type PayrollSettingsRecord = Record<string, unknown>;

export interface PayrollSnapshot {
  employees: EmployeeRecord[];
  attendance: AttendanceRow[];
  payrolls: ProcessedPayrollPeriod[];
  settings?: PayrollSettingsRecord;
  auditLog: AuditEvent[];
}

export interface LoadedPayrollSnapshot {
  hasRecords: boolean;
  /** Employees, attendance, or payroll runs exist. Settings-only rows don't block legacy migration. */
  hasPayrollData: boolean;
  snapshot: Partial<PayrollSnapshot>;
}

type PayrollRecordType = 'employee' | 'attendance' | 'payroll' | 'settings' | 'audit';
type DbPayrollRow = { record_type: PayrollRecordType; record_id: string; data: unknown };

const DEMO_EMPLOYEE_IDS = new Set([
  'EMP-2022-0001', 'EMP-2023-0002', 'EMP-2023-0003', 'EMP-2024-0004', 'EMP-2024-0005',
  'EMP-2024-0006', 'EMP-2024-0007', 'EMP-2024-0008', 'EMP-2024-0009', 'EMP-2024-0010',
  'EMP-2024-0011', 'EMP-2024-0012',
]);
const DEMO_EMPLOYEE_NUMBERS = new Set(Array.from({ length: 12 }, (_, i) => `PH-${1001 + i}`));
const DEMO_PAYROLL_IDS = new Set(['PR-2025-10-P1', 'PR-2025-09-P2']);

export function payrollCloudAvailable(): boolean {
  return isSupabaseConfigured;
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : String(value ?? '');
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function fromDbRows(rows: DbPayrollRow[]): LoadedPayrollSnapshot {
  if (!rows.length) return { hasRecords: false, hasPayrollData: false, snapshot: {} };

  const employees = rows
    .filter((row) => row.record_type === 'employee')
    .map((row) => asRecord(row.data) as unknown as EmployeeRecord)
    .filter((employee) => !DEMO_EMPLOYEE_IDS.has(employee.employeeId) && !DEMO_EMPLOYEE_NUMBERS.has(employee.employeeNumber));

  const attendance = rows
    .filter((row) => row.record_type === 'attendance')
    .map((row) => asRecord(row.data) as unknown as AttendanceRow)
    .filter((entry) => !DEMO_EMPLOYEE_IDS.has(entry.employeeId) && !['Loaded test record', 'Loaded overtime test'].includes(entry.remarks));

  const payrolls = rows
    .filter((row) => row.record_type === 'payroll')
    .map((row) => asRecord(row.data) as unknown as ProcessedPayrollPeriod)
    .filter((period) => !DEMO_PAYROLL_IDS.has(period.id))
    .map((period) => ({
      ...period,
      rows: (period.rows || []).filter((entry) => !DEMO_EMPLOYEE_IDS.has(entry.employeeId)),
    }));

  const settingsRow = rows.find((row) => row.record_type === 'settings');
  const auditLog = rows
    .filter((row) => row.record_type === 'audit')
    .map((row) => asRecord(row.data) as unknown as AuditEvent)
    .sort((a, b) => stringValue(b.time).localeCompare(stringValue(a.time)))
    .slice(0, 200);

  return {
    hasRecords: true,
    hasPayrollData: rows.some((row) => row.record_type === 'employee' || row.record_type === 'attendance' || row.record_type === 'payroll'),
    snapshot: {
      employees,
      attendance,
      payrolls,
      ...(settingsRow ? { settings: asRecord(settingsRow.data) } : {}),
      auditLog,
    },
  };
}

/** Load payroll records only for the currently selected CAPOTBOOKS business. RLS is authoritative. */
export async function loadPayrollSnapshot(clientId: string): Promise<LoadedPayrollSnapshot> {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');
  if (!clientId) throw new Error('Select a CAPOTBOOKS business before loading payroll data.');

  const { data: authorized, error: accessError } = await supabase.rpc('can_access_client_operation', {
    p_client_id: clientId,
    p_permission: 'manage_settings',
  });
  if (accessError) throw new Error(`Could not verify payroll permission: ${accessError.message}`);
  if (!authorized) throw new Error('Your account is not authorized to access payroll for this business. Ask the business owner to grant access.');

  const { data, error } = await supabase
    .from('payroll_records')
    .select('record_type,record_id,data')
    .eq('client_id', clientId);

  if (error) throw new Error(error.message);
  return fromDbRows((data || []) as DbPayrollRow[]);
}

function snapshotRows(clientId: string, snapshot: PayrollSnapshot) {
  const rows: Array<{
    client_id: string;
    record_type: PayrollRecordType;
    record_id: string;
    data: unknown;
    updated_at: string;
  }> = [];
  const now = new Date().toISOString();

  snapshot.employees.forEach((employee) => rows.push({
    client_id: clientId,
    record_type: 'employee',
    record_id: stringValue(employee.employeeId),
    data: employee,
    updated_at: now,
  }));
  snapshot.attendance.forEach((entry) => rows.push({
    client_id: clientId,
    record_type: 'attendance',
    record_id: stringValue(entry.id),
    data: entry,
    updated_at: now,
  }));
  snapshot.payrolls.forEach((period) => rows.push({
    client_id: clientId,
    record_type: 'payroll',
    record_id: stringValue(period.id),
    data: period,
    updated_at: now,
  }));
  rows.push({
    client_id: clientId,
    record_type: 'settings',
    record_id: 'settings',
    data: snapshot.settings || {},
    updated_at: now,
  });
  snapshot.auditLog.slice(0, 200).forEach((event) => rows.push({
    client_id: clientId,
    record_type: 'audit',
    record_id: `${stringValue(event.time)}|${stringValue(event.action)}|${stringValue(event.ref)}`,
    data: event,
    updated_at: now,
  }));
  return rows;
}

async function persistRecordType(
  clientId: string,
  type: PayrollRecordType,
  rows: ReturnType<typeof snapshotRows>,
): Promise<void> {
  const currentRows = rows.filter((row) => row.record_type === type);
  const { data: existing, error: selectError } = await supabase
    .from('payroll_records')
    .select('record_id')
    .eq('client_id', clientId)
    .eq('record_type', type);
  if (selectError) throw new Error(selectError.message);

  if (currentRows.length) {
    const { error } = await supabase
      .from('payroll_records')
      .upsert(currentRows, { onConflict: 'client_id,record_type,record_id' });
    if (error) throw new Error(error.message);
  }

  const wanted = new Set(currentRows.map((row) => row.record_id));
  const staleIds = (existing || [])
    .map((row: { record_id: string }) => row.record_id)
    .filter((recordId: string) => !wanted.has(recordId));
  if (staleIds.length) {
    const { error } = await supabase
      .from('payroll_records')
      .delete()
      .eq('client_id', clientId)
      .eq('record_type', type)
      .in('record_id', staleIds);
    if (error) throw new Error(error.message);
  }
}

// Serialize writes per business so quick edits don't cause an older snapshot to
// overtake a newer one. This keeps the current app state as the source of truth.
const pendingWrites = new Map<string, Promise<void>>();

export function savePayrollSnapshot(clientId: string, snapshot: PayrollSnapshot): Promise<void> {
  if (!isSupabaseConfigured) return Promise.reject(new Error('Supabase is not configured.'));
  if (!clientId) return Promise.reject(new Error('Select a CAPOTBOOKS business before saving payroll data.'));

  const previous = pendingWrites.get(clientId) || Promise.resolve();
  const next = previous.catch(() => undefined).then(async () => {
    const rows = snapshotRows(clientId, snapshot);
    for (const type of ['employee', 'attendance', 'payroll', 'settings', 'audit'] as PayrollRecordType[]) {
      await persistRecordType(clientId, type, rows);
    }
  });
  pendingWrites.set(clientId, next);
  void next.finally(() => {
    if (pendingWrites.get(clientId) === next) pendingWrites.delete(clientId);
  }).catch(() => undefined);
  return next;
}
