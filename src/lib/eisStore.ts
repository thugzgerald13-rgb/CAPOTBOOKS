// eisStore.ts — EIS transmission records + settings persistence.
//
// Storage layers (mirrors CAPOT's existing localDb + Supabase pattern):
//   * localStorage cache for instant offline access (10-year retention of
//     JSON/JWS/ack trail is satisfied by the Supabase `eis_transmissions`
//     table; the local cache is a working copy).
//   * Supabase `eis_settings` + `eis_transmissions` tables (see
//     scripts/eis_migration.sql) for multi-device + audit.
//
// Also tracks the per-day EisUniqueId sequence (01–99) and computes the
// 3-calendar-day transmission deadline per invoice.

import {
  EIS_TRANSMIT_WINDOW_DAYS,
  type EisInvoiceJson,
  type EisSettings,
  type EisTransmission,
  type EisTransmissionStatus,
} from './eisTypes';
import { supabase } from './supabase';

const LS_SETTINGS_KEY = (clientId: string) => `capot:eis:settings:${clientId}`;
const LS_TRANSMISSIONS_KEY = (clientId: string) => `capot:eis:transmissions:${clientId}`;
const LS_SEQ_KEY = (clientId: string, date: string) => `capot:eis:seq:${clientId}:${date}`;

// ---------------------------------------------------------------------------
// Sequence counter — next 2-digit sequence for a given issue date
// ---------------------------------------------------------------------------

export function nextEisSequence(clientId: string, issueDate: string): number {
  const key = LS_SEQ_KEY(clientId, issueDate.slice(0, 10));
  const current = Number(localStorage.getItem(key) || '0');
  const next = Math.min(99, current + 1);
  localStorage.setItem(key, String(next));
  return next;
}

// ---------------------------------------------------------------------------
// Deadline — 3 calendar days from invoice date
// ---------------------------------------------------------------------------

export function transmissionDeadline(issueDate: string): Date {
  const d = new Date(String(issueDate).slice(0, 10) + 'T00:00:00');
  d.setDate(d.getDate() + EIS_TRANSMIT_WINDOW_DAYS);
  return d;
}

export function deadlineStatus(issueDate: string, status: EisTransmissionStatus): 'ok' | 'due-soon' | 'overdue' | 'transmitted' {
  if (status === 'accepted' || status === 'submitted' || status === 'cancelled') return 'transmitted';
  const deadline = transmissionDeadline(issueDate);
  const now = new Date();
  const daysLeft = Math.ceil((deadline.getTime() - now.getTime()) / 86_400_000);
  if (daysLeft < 0) return 'overdue';
  if (daysLeft <= 1) return 'due-soon';
  return 'ok';
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export function loadEisSettings(clientId: string): EisSettings | null {
  try {
    const raw = localStorage.getItem(LS_SETTINGS_KEY(clientId));
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function saveEisSettings(clientId: string, settings: EisSettings): void {
  localStorage.setItem(LS_SETTINGS_KEY(clientId), JSON.stringify({ ...settings, clientId, updatedAt: new Date().toISOString() }));
  // Best-effort server sync (table may not exist yet — fail silently).
  supabase?.from('eis_settings').upsert({ ...settings, client_id: clientId }).then(() => {}).catch(() => {});
}

// ---------------------------------------------------------------------------
// Transmission records
// ---------------------------------------------------------------------------

function readLocal(clientId: string): EisTransmission[] {
  try {
    return JSON.parse(localStorage.getItem(LS_TRANSMISSIONS_KEY(clientId)) || '[]');
  } catch { return []; }
}

function writeLocal(clientId: string, rows: EisTransmission[]): void {
  localStorage.setItem(LS_TRANSMISSIONS_KEY(clientId), JSON.stringify(rows));
}

export function listTransmissions(clientId: string): EisTransmission[] {
  return readLocal(clientId).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}

export function getTransmissionByInvoice(clientId: string, invoiceId: string): EisTransmission | undefined {
  return readLocal(clientId).find(t => t.invoiceId === invoiceId);
}

export function upsertTransmission(clientId: string, record: EisTransmission): EisTransmission {
  const rows = readLocal(clientId);
  const idx = rows.findIndex(r => r.id === record.id);
  const now = new Date().toISOString();
  const finalRec = { ...record, clientId, updatedAt: now };
  if (idx >= 0) rows[idx] = { ...rows[idx], ...finalRec }; else rows.push({ ...finalRec, createdAt: finalRec.createdAt || now });
  writeLocal(clientId, rows);
  supabase?.from('eis_transmissions').upsert(toRow(finalRec)).then(() => {}).catch(() => {});
  return finalRec;
}

export function createTransmissionRecord(input: {
  clientId: string;
  invoiceId: string;
  invoiceNumber: string;
  eisUniqueId: string;
  docType: EisTransmission['docType'];
  issueDate: string;
  amountDue: number;
  invoiceJson?: EisInvoiceJson;
  jws?: string;
}): EisTransmission {
  const record: EisTransmission = {
    id: `eis-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    clientId: input.clientId,
    invoiceId: input.invoiceId,
    invoiceNumber: input.invoiceNumber,
    eisUniqueId: input.eisUniqueId,
    docType: input.docType,
    issueDate: input.issueDate,
    amountDue: input.amountDue,
    status: 'queued',
    attempts: 0,
    invoiceJson: input.invoiceJson,
    jws: input.jws,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  return upsertTransmission(input.clientId, record);
}

export function markSubmitted(clientId: string, id: string, batchId: string): void {
  const rows = readLocal(clientId);
  const r = rows.find(x => x.id === id);
  if (r) {
    r.status = 'submitted';
    r.batchId = batchId;
    r.submittedAt = new Date().toISOString();
    r.attempts += 1;
    writeLocal(clientId, rows);
    supabase?.from('eis_transmissions').update({ status: 'submitted', batch_id: batchId, submitted_at: r.submittedAt, attempts: r.attempts }).eq('id', id).then(() => {}).catch(() => {});
  }
}

export function markAck(clientId: string, id: string, ackCode: string, ackMessage?: string): void {
  const rows = readLocal(clientId);
  const r = rows.find(x => x.id === id);
  if (r) {
    const accepted = ackCode.toUpperCase().startsWith('ACC') || ackCode === '0' || ackCode === 'SUCCESS';
    r.status = accepted ? 'accepted' : 'rejected';
    r.birAckCode = ackCode;
    r.birAckMessage = ackMessage;
    r.birAckAt = new Date().toISOString();
    writeLocal(clientId, rows);
    supabase?.from('eis_transmissions').update({ status: r.status, bir_ack_code: ackCode, bir_ack_message: ackMessage, bir_ack_at: r.birAckAt }).eq('id', id).then(() => {}).catch(() => {});
  }
}

export function markError(clientId: string, id: string, error: string): void {
  const rows = readLocal(clientId);
  const r = rows.find(x => x.id === id);
  if (r) {
    r.lastError = error;
    r.attempts += 1;
    writeLocal(clientId, rows);
    supabase?.from('eis_transmissions').update({ last_error: error, attempts: r.attempts }).eq('id', id).then(() => {}).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Row mapping for Supabase (snake_case columns)
// ---------------------------------------------------------------------------

function toRow(r: EisTransmission) {
  return {
    id: r.id,
    client_id: r.clientId,
    invoice_id: r.invoiceId,
    invoice_number: r.invoiceNumber,
    eis_unique_id: r.eisUniqueId,
    doc_type: r.docType,
    issue_date: r.issueDate,
    amount_due: r.amountDue,
    status: r.status,
    batch_id: r.batchId,
    submitted_at: r.submittedAt,
    bir_ack_code: r.birAckCode,
    bir_ack_message: r.birAckMessage,
    bir_ack_at: r.birAckAt,
    attempts: r.attempts,
    last_error: r.lastError,
    invoice_json: r.invoiceJson,
    jws: r.jws,
    created_at: r.createdAt,
    updated_at: r.updatedAt,
  };
}

/** Pull server rows into the local cache (multi-device sync). */
export async function syncTransmissionsFromServer(clientId: string): Promise<void> {
  try {
    const { data } = await supabase.from('eis_transmissions').select('*').eq('client_id', clientId);
    if (data && data.length) {
      const merged = new Map<string, EisTransmission>();
      for (const r of readLocal(clientId)) merged.set(r.id, r);
      for (const row of data) {
        merged.set(row.id, {
          id: row.id, clientId: row.client_id, invoiceId: row.invoice_id,
          invoiceNumber: row.invoice_number, eisUniqueId: row.eis_unique_id,
          docType: row.doc_type, issueDate: row.issue_date, amountDue: row.amount_due,
          status: row.status, batchId: row.batch_id, submittedAt: row.submitted_at,
          birAckCode: row.bir_ack_code, birAckMessage: row.bir_ack_message, birAckAt: row.bir_ack_at,
          attempts: row.attempts, lastError: row.last_error, invoiceJson: row.invoice_json,
          jws: row.jws, createdAt: row.created_at, updatedAt: row.updated_at,
        });
      }
      writeLocal(clientId, Array.from(merged.values()));
    }
  } catch { /* table may not exist yet */ }
}
