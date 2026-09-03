// src/services/clientService.ts
import { supabase } from '@/lib/supabase';

// ---------- Client Shell ----------
export async function fetchClientShell(clientId: string) {
  const { data, error } = await supabase
    .from('clients')
    .select('id, name, address, tax_id, accounting_type, fiscal_year_start')
    .eq('id', clientId)
    .single();
  if (error) throw error;
  return data;
}

// ---------- Journal Entries (paginated) ----------
export async function fetchJournalEntries(clientId: string, page: number, pageSize: number) {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const { data, error, count } = await supabase
    .from('journal_entries')
    .select('id, entry_date, description, total_debit, total_credit, journal_type', { count: 'exact' })
    .eq('client_id', clientId)
    .order('entry_date', { ascending: false })
    .range(from, to);
  if (error) throw error;
  return { data, count };
}

// Fetch a single entry detail (full row, including `values`)
export async function fetchJournalEntryDetail(entryId: string) {
  const { data, error } = await supabase
    .from('journal_entries')
    .select('*')
    .eq('id', entryId)
    .single();
  if (error) throw error;
  return data;
}

// ---------- Purchases (paginated) ----------
export async function fetchPurchases(clientId: string, page: number, pageSize: number) {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const { data, error, count } = await supabase
    .from('purchases')
    .select('id, vendor, purchase_date, total, status', { count: 'exact' })
    .eq('client_id', clientId)
    .order('purchase_date', { ascending: false })
    .range(from, to);
  if (error) throw error;
  return { data, count };
}

// ---------- Invoices (AP) ----------
export async function fetchInvoices(clientId: string, page: number, pageSize: number) {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const { data, error, count } = await supabase
    .from('payable_invoices')
    .select('id, vendor, invoice_date, total, status', { count: 'exact' })
    .eq('client_id', clientId)
    .order('invoice_date', { ascending: false })
    .range(from, to);
  if (error) throw error;
  return { data, count };
}

// ---------- Mutations (granular) ----------
export async function upsertJournalEntry(entry: any) {
  const { error } = await supabase
    .from('journal_entries')
    .upsert(entry)
    .eq('client_id', entry.client_id);
  if (error) throw error;
}

export async function deleteJournalEntry(id: string) {
  const { error } = await supabase.from('journal_entries').delete().eq('id', id);
  if (error) throw error;
}

// ... similar for purchases, invoices, etc.
