import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ShieldAlert, Download, Users, RefreshCw, Mail, Calendar, LineChart, CheckCircle2, XCircle, Copy, Check, Ban, Trash2, FlaskConical, Play, AlertTriangle } from 'lucide-react';
import { PageHeader } from './ui/PageHeader';
import { useAccounting } from '../context/AccountingContext';
import { getEgressMetrics } from '../db/localDb';
import { Client } from '../types';
import { useAuth } from '../context/AuthContext';
import { loadAuditLog, ALL_PERMISSIONS, ROLES, can } from '../lib/accessControl';
import { FEATURE_FLAGS, getFlags, setFeatureFlag, buildBackup, parseBackup } from '../lib/featureFlags';
import { FEATURE_VISIBILITY_ITEMS, loadGlobalFeatureVisibility, saveFeatureVisibility, useFeatureVisibility, loadDeveloperFeatureRules, saveDeveloperFeatureRule, type FeatureAccessRule, type FeatureRuleScope } from '../lib/featureVisibility';
import { supabase } from '../lib/supabase';
import packageJson from '../../package.json';
import { AccountHealthMonitor } from './AccountHealthMonitor';
import { computeBusinessTax, computeIncomeTaxByRegime, resolveBusinessWorkflow } from '../lib/taxEngine';
import { getDefaultAccountsForIndustry } from '../lib/journalDefaults';

interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  userRole?: string;
  lastLogin?: any;
  updatedAt?: any;
  approved?: boolean;
  blocked?: boolean;
  subscriptionPlan?: string;
}

type AdminTab = 'users' | 'diagnostics';

type TaxpayerProfile = {
  id: string; user_id: string; owner_email: string | null; owner_name: string | null; name: string;
  taxpayer_classification: string; taxpayer_sub_classification: string | null;
  vat_registration_type: string; income_tax_regime: string | null; deduction_method: string | null;
  percentage_tax_rate: number | null; taxpayer_tier: string; industry: string;
};

const TAXPAYER_FIELDS = [
  { key: 'taxpayer_classification', label: 'Taxpayer classification', options: [['Individual','Individual'],['Non-Individual','Non-Individual']] },
  { key: 'taxpayer_sub_classification', label: 'Sub-classification', options: [['sole_proprietor','Sole Proprietor'],['professional','Professional'],['mixed_income','Mixed Income'],['corporation_regular','Regular Corporation'],['corporation_msme','MSME Corporation'],['domestic_corp','Domestic Corporation'],['msme_corp','MSME Corporation'],['opc','One Person Corporation'],['partnership','Partnership'],['gpp','General Professional Partnership'],['cooperative','Cooperative']] },
  { key: 'vat_registration_type', label: 'VAT / business tax registration', options: [['vat','VAT Registered'],['non-vat','Non-VAT'],['exempt','VAT Exempt'],['zero-rated','Zero-Rated']] },
  { key: 'income_tax_regime', label: 'Income tax rate / regime', options: [['8_percent_flat','8% Flat Rate'],['graduated_itemized','Graduated – Itemized'],['graduated_osd','Graduated – 40% OSD'],['corp_20_msme','20% Corporate – MSME'],['corp_20_osd','20% Corporate – MSME OSD'],['corp_25_regular','25% Regular Corporate'],['corp_25_osd','25% Corporate – OSD'],['corp_gpp_exempt','GPP / Cooperative Exempt'],['corp_special_5','5% Special GIE']] },
  { key: 'deduction_method', label: 'Deduction method', options: [['itemized','Itemized'],['osd','OSD'],['osd_40','40% OSD'],['none','None'],['none_8_percent','None – 8% Flat']] },
  { key: 'taxpayer_tier', label: 'Taxpayer tier', options: [['micro','Micro'],['small','Small'],['medium','Medium'],['large','Large']] },
  { key: 'industry', label: 'Industry type', options: [['retail','Retail / Trading'],['general-services','General Services'],['manufacturing','Manufacturing'],['construction','Construction']] },
] as const;

type TaxpayerTestInputs = {
  grossSales: number;
  grossPurchases: number;
  operatingExpenses: number;
  totalAssets: number;
  yearsOfOperation: number;
};

type TaxpayerTestResult = {
  category: string;
  option: string;
  passed: boolean;
  explanation: string;
  classification: string;
  subClassification: string;
  vat: string;
  incomeRegime: string;
  deductionMethod: string;
  tier: string;
  businessTax: number;
  businessTaxForm: string;
  incomeTax: number;
  incomeTaxForm: string;
  costSection: string;
  coaAccounts: number;
  withholdingDefaults: string;
  requiredForms: string;
};

const TAXPAYER_TEST_DIMENSIONS: Array<{ key: string; label: string; options: ReadonlyArray<readonly [string, string]> }> = [
  { key: 'taxpayer_classification', label: 'Taxpayer classification', options: [['Individual', 'Individual'], ['Non-Individual', 'Non-Individual']] },
  { key: 'taxpayer_sub_classification', label: 'Taxpayer sub-classification', options: [...TAXPAYER_FIELDS[1].options] },
  { key: 'vat_registration_type', label: 'VAT / business tax registration', options: [...TAXPAYER_FIELDS[2].options] },
  { key: 'income_tax_regime', label: 'Income tax rate / regime', options: [...TAXPAYER_FIELDS[3].options] },
  { key: 'deduction_method', label: 'Deduction method', options: [...TAXPAYER_FIELDS[4].options] },
  { key: 'percentage_tax_rate', label: 'Percentage tax rate', options: [['0', '0%'], ['0.01', '1%'], ['0.02', '2%'], ['0.03', '3%'], ['0.05', '5%']] },
  { key: 'taxpayer_tier', label: 'Taxpayer tier', options: [...TAXPAYER_FIELDS[5].options] },
  { key: 'industry', label: 'Industry type', options: [...TAXPAYER_FIELDS[6].options] },
  { key: 'category', label: 'Business / customer category', options: [['private', 'Private'], ['government', 'Government']] },
  { key: 'has_employees', label: 'Has employees', options: [['true', 'With employees'], ['false', 'Without employees']] },
  { key: 'is_top_withholding_agent', label: 'Top withholding agent status', options: [['true', 'Top withholding agent'], ['false', 'Not a top withholding agent']] },
];

const TEST_CATEGORY_OPTIONS = [
  { value: 'all', label: 'All categories' },
  ...TAXPAYER_TEST_DIMENSIONS.map(dimension => ({ value: dimension.key, label: dimension.label })),
];

function buildTaxpayerTestCandidate(base: TaxpayerProfile, fieldKey: string, value: string, inputs: TaxpayerTestInputs): Record<string, any> {
  const candidate: Record<string, any> = {
    taxpayerClassification: base.taxpayer_classification || 'Individual',
    taxpayerSubClassification: base.taxpayer_sub_classification || 'sole_proprietor',
    vatRegistrationType: base.vat_registration_type || 'non-vat',
    incomeTaxRegime: base.income_tax_regime || 'graduated_itemized',
    deductionMethod: base.deduction_method || 'itemized',
    percentageTaxRate: base.percentage_tax_rate ?? 0.03,
    taxpayerTier: base.taxpayer_tier || 'micro',
    industry: base.industry || 'general-services',
    category: 'private',
    hasEmployees: false,
    totalAssetsExcludingLand: inputs.totalAssets,
    yearsOfOperation: inputs.yearsOfOperation,
    sales: [{ amount: inputs.grossSales }],
  };

  const individualSubClasses = ['sole_proprietor', 'professional', 'mixed_income'];
  const corporateSubClasses = ['corporation_regular', 'corporation_msme', 'domestic_corp', 'msme_corp', 'opc', 'partnership', 'gpp', 'cooperative'];

  switch (fieldKey) {
    case 'taxpayer_classification':
      candidate.taxpayerClassification = value;
      candidate.taxpayerSubClassification = value === 'Individual' ? 'sole_proprietor' : 'corporation_msme';
      candidate.incomeTaxRegime = value === 'Individual' ? 'graduated_itemized' : 'corp_20_msme';
      break;
    case 'taxpayer_sub_classification':
      candidate.taxpayerSubClassification = value;
      candidate.taxpayerClassification = individualSubClasses.includes(value) ? 'Individual' : 'Non-Individual';
      candidate.incomeTaxRegime = individualSubClasses.includes(value)
        ? 'graduated_itemized'
        : value === 'gpp' || value === 'cooperative'
          ? 'corp_gpp_exempt'
          : value === 'corporation_regular'
            ? 'corp_25_regular'
            : 'corp_20_msme';
      break;
    case 'vat_registration_type':
      candidate.vatRegistrationType = value;
      if (value === 'vat' && candidate.incomeTaxRegime === '8_percent_flat') candidate.incomeTaxRegime = 'graduated_itemized';
      break;
    case 'income_tax_regime':
      candidate.incomeTaxRegime = value;
      if (value.startsWith('corp_')) {
        candidate.taxpayerClassification = 'Non-Individual';
        candidate.taxpayerSubClassification = value === 'corp_gpp_exempt'
          ? 'gpp'
          : value.startsWith('corp_25')
            ? 'corporation_regular'
            : 'corporation_msme';
      } else {
        candidate.taxpayerClassification = 'Individual';
        candidate.taxpayerSubClassification = 'sole_proprietor';
        if (value === '8_percent_flat') candidate.vatRegistrationType = 'non-vat';
      }
      break;
    case 'deduction_method':
      // Test the method independently. The production resolver derives the
      // regime from the method only when no explicit regime is supplied.
      delete candidate.incomeTaxRegime;
      candidate.deductionMethod = value;
      if (candidate.taxpayerClassification === 'Individual' && value === 'none_8_percent') {
        candidate.vatRegistrationType = 'non-vat';
      }
      if (!individualSubClasses.includes(candidate.taxpayerSubClassification) && !corporateSubClasses.includes(candidate.taxpayerSubClassification)) {
        candidate.taxpayerSubClassification = candidate.taxpayerClassification === 'Individual' ? 'sole_proprietor' : 'corporation_msme';
      }
      break;
    case 'percentage_tax_rate':
      // A percentage-tax scenario must be Non-VAT and not using a regime that
      // legally suppresses the percentage-tax workflow in this app.
      candidate.taxpayerClassification = 'Individual';
      candidate.taxpayerSubClassification = 'sole_proprietor';
      candidate.vatRegistrationType = 'non-vat';
      candidate.incomeTaxRegime = 'graduated_itemized';
      candidate.deductionMethod = 'itemized';
      candidate.percentageTaxRate = Number(value);
      break;
    case 'taxpayer_tier':
      candidate.taxpayerTier = value;
      break;
    case 'industry':
      candidate.industry = value;
      break;
    case 'category':
      candidate.category = value;
      break;
    case 'has_employees':
      candidate.hasEmployees = value === 'true';
      break;
    case 'is_top_withholding_agent':
      candidate.isTopWithholdingAgent = value === 'true';
      break;
  }

  return candidate;
}

function runTaxpayerCategoryTest(
  base: TaxpayerProfile,
  fieldKey: string,
  categoryLabel: string,
  optionValue: string,
  optionLabel: string,
  inputs: TaxpayerTestInputs,
): TaxpayerTestResult {
  const entity = buildTaxpayerTestCandidate(base, fieldKey, optionValue, inputs);
  const workflow = resolveBusinessWorkflow(entity);
  const businessTax = computeBusinessTax({
    grossSales: inputs.grossSales,
    grossPurchases: inputs.grossPurchases,
    vatRegistrationType: workflow.vatRegistrationType,
    incomeTaxRegime: workflow.incomeTaxRegime,
    percentageTaxRate: workflow.percentageTaxRate,
  });
  const incomeTax = computeIncomeTaxByRegime({
    grossSalesOrReceipts: inputs.grossSales,
    costOfSalesOrServices: inputs.grossPurchases,
    itemizedOperatingExpenses: inputs.operatingExpenses,
    taxpayerClassification: workflow.classification,
    taxpayerSubClassification: workflow.subClassification,
    vatRegistrationType: workflow.vatRegistrationType,
    incomeTaxRegime: workflow.incomeTaxRegime,
    deductionMethod: workflow.deductionMethod,
    totalAssetsExcludingLand: inputs.totalAssets,
    yearsOfOperation: inputs.yearsOfOperation,
  });
  const coaAccounts = getDefaultAccountsForIndustry(workflow.industry, 'numeric');

  let passed = true;
  let explanation = 'The selected option flowed through the workflow and computation engines.';
  switch (fieldKey) {
    case 'taxpayer_classification':
      passed = workflow.classification === optionValue && incomeTax.classification === optionValue;
      break;
    case 'taxpayer_sub_classification':
      passed = workflow.subClassification === optionValue && incomeTax.subClassification === optionValue;
      if (!passed) explanation = `The workflow resolved ${workflow.subClassification}, while the income-tax engine resolved ${incomeTax.subClassification}.`;
      break;
    case 'vat_registration_type':
      passed = workflow.vatRegistrationType === optionValue && businessTax.vatRegistrationType === optionValue;
      break;
    case 'income_tax_regime':
      passed = workflow.incomeTaxRegime === optionValue && incomeTax.regime === optionValue;
      if (!passed) explanation = `Requested ${optionValue}; effective workflow is ${workflow.incomeTaxRegime} and income-tax engine is ${incomeTax.regime}.`;
      break;
    case 'deduction_method': {
      const expectedMethod = optionValue === 'none_8_percent' ? 'none_8_percent' : optionValue === 'osd_40' ? 'osd_40' : 'itemized';
      passed = workflow.deductionMethod === expectedMethod && incomeTax.deductionMethod === expectedMethod;
      if (!passed || (optionValue === 'osd' || optionValue === 'none')) {
        passed = false;
        explanation = `The engine applies ${workflow.deductionMethod}; the selected value “${optionValue}” is not handled as a distinct method by the workflow resolver.`;
      }
      break;
    }
    case 'percentage_tax_rate':
      passed = Math.abs(workflow.percentageTaxRate - Number(optionValue)) < 0.000001
        && Math.abs(businessTax.percentageTaxRate - Number(optionValue)) < 0.000001;
      if (!passed) explanation = `Requested ${(Number(optionValue) * 100).toFixed(2)}%, but effective percentage tax is ${(workflow.percentageTaxRate * 100).toFixed(2)}%.`;
      break;
    case 'taxpayer_tier':
      passed = workflow.sizeTier === optionValue;
      break;
    case 'industry':
      passed = workflow.industry === optionValue && coaAccounts.length > 0 && Boolean(workflow.costSectionLabel);
      break;
    case 'category':
      passed = workflow.category === optionValue
        && (optionValue === 'government' ? workflow.requiredForms.includes('1600-VT') : !workflow.requiredForms.includes('1600-VT'));
      break;
    case 'has_employees':
      passed = workflow.hasEmployees === (optionValue === 'true')
        && workflow.requiredForms.includes('1601-C') === (optionValue === 'true');
      break;
    case 'is_top_withholding_agent':
      passed = workflow.isTopWithholdingAgent === (optionValue === 'true');
      break;
  }

  return {
    category: categoryLabel,
    option: optionLabel,
    passed,
    explanation,
    classification: incomeTax.classification,
    subClassification: incomeTax.subClassification,
    vat: workflow.vatLabel,
    incomeRegime: incomeTax.regime,
    deductionMethod: incomeTax.deductionMethod,
    tier: workflow.sizeTier,
    businessTax: businessTax.totalBusinessTaxPayable,
    businessTaxForm: businessTax.applicableForm,
    incomeTax: incomeTax.netIncomeTaxPayable,
    incomeTaxForm: incomeTax.applicableAnnualForm,
    costSection: workflow.costSectionLabel,
    coaAccounts: coaAccounts.length,
    withholdingDefaults: `${workflow.defaultPurchaseWhtAtc} / ${workflow.defaultServiceWhtAtc}${workflow.isTopWithholdingAgent ? ' · TWA' : ''}`,
    requiredForms: workflow.requiredForms.join(', '),
  };
}

function formatTestCurrency(value: number): string {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 2 }).format(value || 0);
}

// Masks a Supabase project URL down to just the host, e.g.
// "https://abcdefgh.supabase.co" -> "abcdefgh.supabase.co", so nothing
// beyond what's already visible in network requests gets shown/copied.
function maskSupabaseUrl(url: string | undefined): string {
  if (!url) return 'Not set';
  try {
    return new URL(url).host;
  } catch {
    return 'Invalid URL';
  }
}

function DiagSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl overflow-hidden mb-6 page-panel">
      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40">
        <h4 className="text-sm font-bold text-slate-700 dark:text-slate-200">{title}</h4>
      </div>
      <div className="divide-y divide-slate-100 dark:divide-slate-700/60">{children}</div>
    </div>
  );
}

function DiagRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-2.5 text-sm">
      <span className="text-slate-500 dark:text-slate-400 shrink-0">{label}</span>
      <span className="text-slate-800 dark:text-slate-100 font-mono text-xs text-right break-all">{value}</span>
    </div>
  );
}

function DiagStatusRow({
  label,
  ok,
  okText,
  failText,
  pending,
}: {
  label: string;
  ok: boolean | null;
  okText: string;
  failText: string;
  pending?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-2.5 text-sm">
      <span className="text-slate-500 dark:text-slate-400 shrink-0">{label}</span>
      {pending || ok === null ? (
        <span className="flex items-center gap-1.5 text-slate-400 text-xs font-medium">
          <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Checking...
        </span>
      ) : ok ? (
        <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 text-xs font-bold">
          <CheckCircle2 className="w-3.5 h-3.5" /> {okText}
        </span>
      ) : (
        <span className="flex items-center gap-1.5 text-rose-600 dark:text-rose-400 text-xs font-bold">
          <XCircle className="w-3.5 h-3.5" /> {failText}
        </span>
      )}
    </div>
  );
}

function DiagnosticsTab() {
  const { clients, isSyncing, syncError } = useAccounting();
  const { user, isAdmin } = useAuth();

  const [dbReadOk, setDbReadOk] = useState<boolean | null>(null);
  const [dbLatencyMs, setDbLatencyMs] = useState<number | null>(null);
  const [supabaseOk, setSupabaseOk] = useState<boolean | null>(null);
  const [supabaseLatencyMs, setSupabaseLatencyMs] = useState<number | null>(null);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const [copied, setCopied] = useState(false);

  const runChecks = async () => {
    setSupabaseOk(null);
    setSupabaseLatencyMs(null);
    setDbReadOk(null);
    setDbLatencyMs(null);

    // Supabase reachability + round-trip latency via a minimal auth call
    // (doesn't touch any table, so it still works when signed out).
    const start = performance.now();
    try {
      const { error } = await supabase.auth.getSession();
      setSupabaseLatencyMs(Math.round(performance.now() - start));
      setSupabaseOk(!error);
    } catch {
      setSupabaseLatencyMs(Math.round(performance.now() - start));
      setSupabaseOk(false);
    }

    // Database read probe: a lightweight, non-destructive query against the
    // clients table to confirm the DB connection and RLS policies are working.
    const dbStart = performance.now();
    try {
      const { error } = await supabase.from('clients').select('id').limit(1);
      setDbLatencyMs(Math.round(performance.now() - dbStart));
      setDbReadOk(!error);
    } catch {
      setDbLatencyMs(Math.round(performance.now() - dbStart));
      setDbReadOk(false);
    }

    setCheckedAt(new Date());
  };

  useEffect(() => {
    runChecks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const recordCounts = useMemo(() => {
    const list = Object.values(clients) as Client[];
    return {
      clients: list.length,
      sales: list.reduce((sum, c) => sum + (c.sales?.length || 0), 0),
      purchases: list.reduce((sum, c) => sum + (c.purchases?.length || 0), 0),
      glEntries: list.reduce(
        (sum, c) => sum + (c.glAccounts || []).reduce((s, g) => s + (g.entries?.length || 0), 0),
        0
      ),
      files: list.reduce((sum, c) => sum + (c.files?.length || 0), 0),
    };
  }, [clients]);

  // Approximate size of the currently loaded client data (in-memory, sourced
  // entirely from Supabase) rather than any on-device browser storage.
  const dataUsageKb = useMemo(() => {
    try {
      const bytes = new Blob([JSON.stringify(clients)]).size;
      return (bytes / 1024).toFixed(1);
    } catch {
      return 'N/A';
    }
  }, [clients]);

  const envReport = useMemo(() => {
    return [
      `CapotBooks Diagnostics — ${new Date().toISOString()}`,
      `App version: ${packageJson.version}`,
      `Supabase project: ${maskSupabaseUrl(import.meta.env.VITE_SUPABASE_URL as string)}`,
      `Build mode: ${import.meta.env.MODE}`,
      `User: ${user?.email || 'signed out'}`,
      `Admin: ${isAdmin}`,
      `Browser: ${navigator.userAgent}`,
      `Screen: ${window.screen.width}x${window.screen.height}`,
      `Viewport: ${window.innerWidth}x${window.innerHeight}`,
      `Online: ${navigator.onLine}`,
      `Local cache hit ratio: ${(getEgressMetrics().hitRatio * 100).toFixed(1)}%`,
      `Bytes served locally (rows): ${(getEgressMetrics().cacheHitBytes / 1024).toFixed(0)} KB`,
      `Bytes fetched from network: ${(getEgressMetrics().networkBytes / 1024).toFixed(0)} KB`,
      `Blob cache hits (attachments): ${(getEgressMetrics().blobCacheHitBytes / 1024).toFixed(0)} KB`,
      `Supabase reachable: ${supabaseOk} (${supabaseLatencyMs ?? '—'} ms)`,
      `Database read OK: ${dbReadOk} (${dbLatencyMs ?? '—'} ms)`,
      `Loaded client data size: ${dataUsageKb} KB`,
      `Clients: ${recordCounts.clients}, Sales: ${recordCounts.sales}, Purchases: ${recordCounts.purchases}, GL entries: ${recordCounts.glEntries}, Files: ${recordCounts.files}`,
      `Last sync error: ${syncError || 'none'}`,
    ].join('\n');
  }, [supabaseOk, supabaseLatencyMs, dbReadOk, dbLatencyMs, dataUsageKb, recordCounts, syncError, user, isAdmin]);

  const handleCopyReport = async () => {
    try {
      await navigator.clipboard.writeText(envReport);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable — report is still visible on screen either way.
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">System &amp; Environment</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopyReport}
            className="flex items-center gap-2 px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-bold transition-all active:scale-95"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied' : 'Copy Report'}
          </button>
          <button
            onClick={runChecks}
            className="flex items-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-md transition-all active:scale-95"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Re-run Checks
          </button>
        </div>
      </div>

      <DiagSection title="Connection Status">
        <DiagStatusRow
          label="Supabase API"
          ok={supabaseOk}
          okText={`Reachable (${supabaseLatencyMs ?? '—'} ms)`}
          failText="Unreachable"
        />
        <DiagStatusRow
          label="Database read (clients table)"
          ok={dbReadOk}
          okText={`Reachable (${dbLatencyMs ?? '—'} ms)`}
          failText="Unavailable"
        />
        <DiagStatusRow
          label="Last cloud sync"
          ok={!syncError}
          okText={isSyncing ? 'Syncing...' : 'OK'}
          failText={syncError || 'Error'}
          pending={isSyncing}
        />
        <DiagRow label="Checked at" value={checkedAt ? checkedAt.toLocaleTimeString() : '—'} />
      </DiagSection>

      <DiagSection title="App">
        <DiagRow label="Version" value={packageJson.version} />
        <DiagRow label="Build mode" value={import.meta.env.MODE} />
        <DiagRow label="Supabase project" value={maskSupabaseUrl(import.meta.env.VITE_SUPABASE_URL as string)} />
      </DiagSection>

      <DiagSection title="Session">
        <DiagRow label="Signed in as" value={user?.email || 'Signed out'} />
        <DiagRow label="Admin (developer) access" value={isAdmin ? 'Yes' : 'No'} />
      </DiagSection>

      <DiagSection title="Data">
        <DiagRow label="Clients loaded" value={String(recordCounts.clients)} />
        <DiagRow label="Sales records" value={String(recordCounts.sales)} />
        <DiagRow label="Purchase records" value={String(recordCounts.purchases)} />
        <DiagRow label="GL entries" value={String(recordCounts.glEntries)} />
        <DiagRow label="Files stored" value={String(recordCounts.files)} />
        <DiagRow label="Loaded data size" value={`${dataUsageKb} KB`} />
      </DiagSection>

      <DiagSection title="Browser / Environment">
        <DiagRow label="User agent" value={navigator.userAgent} />
        <DiagRow label="Screen size" value={`${window.screen.width} x ${window.screen.height}`} />
        <DiagRow label="Viewport size" value={`${window.innerWidth} x ${window.innerHeight}`} />
        <DiagRow label="Online" value={navigator.onLine ? 'Yes' : 'No'} />
      </DiagSection>
    </div>
  );
}

function TaxpayerTestBench({ profile }: { profile: TaxpayerProfile | null }) {
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [inputs, setInputs] = useState<TaxpayerTestInputs>({
    grossSales: 2400000,
    grossPurchases: 900000,
    operatingExpenses: 450000,
    totalAssets: 50000000,
    yearsOfOperation: 5,
  });
  const [results, setResults] = useState<TaxpayerTestResult[]>([]);
  const [testedAt, setTestedAt] = useState<Date | null>(null);
  const [testError, setTestError] = useState('');

  const runTests = () => {
    if (!profile) {
      setTestError('Select a taxpayer workspace before running the tests.');
      return;
    }

    setTestError('');
    const dimensions = selectedCategory === 'all'
      ? TAXPAYER_TEST_DIMENSIONS
      : TAXPAYER_TEST_DIMENSIONS.filter(dimension => dimension.key === selectedCategory);
    const nextResults: TaxpayerTestResult[] = [];

    dimensions.forEach(dimension => {
      dimension.options.forEach(([value, label]) => {
        try {
          nextResults.push(runTaxpayerCategoryTest(profile, dimension.key, dimension.label, value, label, inputs));
        } catch (error) {
          nextResults.push({
            category: dimension.label,
            option: label,
            passed: false,
            explanation: error instanceof Error ? error.message : String(error),
            classification: '—',
            subClassification: '—',
            vat: '—',
            incomeRegime: '—',
            deductionMethod: '—',
            tier: '—',
            businessTax: 0,
            businessTaxForm: 'ERROR',
            incomeTax: 0,
            incomeTaxForm: 'ERROR',
            costSection: '—',
            coaAccounts: 0,
            withholdingDefaults: '—',
            requiredForms: '—',
          });
        }
      });
    });

    setResults(nextResults);
    setTestedAt(new Date());
  };

  const passedCount = results.filter(result => result.passed).length;
  const failedCount = results.length - passedCount;
  const totalAllOptions = TAXPAYER_TEST_DIMENSIONS.reduce((sum, dimension) => sum + dimension.options.length, 0);

  return (
    <section className="mb-8 rounded-2xl border border-cyan-200 dark:border-cyan-900 bg-white dark:bg-slate-900 p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-cyan-50 dark:bg-cyan-950/50 p-2 text-cyan-700 dark:text-cyan-300"><FlaskConical className="w-5 h-5" /></div>
          <div>
            <h4 className="font-bold text-slate-800 dark:text-slate-100">Taxpayer Category Test Bench</h4>
            <p className="text-xs text-slate-500 mt-1">Test every option against the live tax workflow and computation functions using sample transactions. Tests never save or modify a client workspace.</p>
          </div>
        </div>
        <span className="text-[10px] rounded-full px-2.5 py-1 bg-cyan-50 dark:bg-cyan-950 text-cyan-700 dark:text-cyan-300 font-bold">{totalAllOptions} available option tests</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
        <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Category to test
          <select className="form-input w-full mt-1" value={selectedCategory} onChange={event => setSelectedCategory(event.target.value)}>
            {TEST_CATEGORY_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Sample gross sales / receipts (₱)
          <input className="form-input w-full mt-1" type="number" min="0" step="1000" value={inputs.grossSales} onChange={event => setInputs(current => ({ ...current, grossSales: Math.max(0, Number(event.target.value) || 0) }))} />
        </label>
        <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Sample gross purchases / cost (₱)
          <input className="form-input w-full mt-1" type="number" min="0" step="1000" value={inputs.grossPurchases} onChange={event => setInputs(current => ({ ...current, grossPurchases: Math.max(0, Number(event.target.value) || 0) }))} />
        </label>
        <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Sample operating expenses (₱)
          <input className="form-input w-full mt-1" type="number" min="0" step="1000" value={inputs.operatingExpenses} onChange={event => setInputs(current => ({ ...current, operatingExpenses: Math.max(0, Number(event.target.value) || 0) }))} />
        </label>
        <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Sample assets excluding land (₱)
          <input className="form-input w-full mt-1" type="number" min="0" step="100000" value={inputs.totalAssets} onChange={event => setInputs(current => ({ ...current, totalAssets: Math.max(0, Number(event.target.value) || 0) }))} />
        </label>
        <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Years of operation
          <input className="form-input w-full mt-1" type="number" min="1" step="1" value={inputs.yearsOfOperation} onChange={event => setInputs(current => ({ ...current, yearsOfOperation: Math.max(1, Number(event.target.value) || 1) }))} />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <button type="button" onClick={runTests} disabled={!profile} className="inline-flex items-center gap-2 rounded-lg bg-cyan-700 hover:bg-cyan-800 text-white px-4 py-2.5 text-xs font-bold disabled:opacity-50">
          <Play className="w-3.5 h-3.5" /> Run {selectedCategory === 'all' ? `all ${totalAllOptions} tests` : 'category tests'}
        </button>
        <button type="button" onClick={() => { setResults([]); setTestedAt(null); setTestError(''); }} disabled={!results.length} className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2.5 text-xs font-semibold text-slate-600 dark:text-slate-300 disabled:opacity-40">Clear results</button>
        {testedAt && <span className="text-[10px] text-slate-400">Last run: {testedAt.toLocaleString()}</span>}
      </div>

      {testError && <div className="mb-3 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 p-3 text-xs text-rose-700 dark:text-rose-300">{testError}</div>}

      {results.length > 0 && <>
        <div className="flex flex-wrap items-center gap-3 mb-3 text-xs">
          <span className="font-bold text-slate-700 dark:text-slate-200">{results.length} scenarios executed</span>
          <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="w-3.5 h-3.5" /> {passedCount} passed</span>
          <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400"><AlertTriangle className="w-3.5 h-3.5" /> {failedCount} need review</span>
        </div>
        <div className="max-h-[560px] overflow-auto rounded-xl border border-slate-200 dark:border-slate-700">
          <table className="min-w-[1120px] w-full text-[11px]">
            <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-300">
              <tr>
                <th className="text-left p-2.5">Category / option</th>
                <th className="text-left p-2.5">Result</th>
                <th className="text-left p-2.5">Effective taxpayer</th>
                <th className="text-left p-2.5">VAT / income tax</th>
                <th className="text-right p-2.5">Business tax</th>
                <th className="text-right p-2.5">Income tax payable</th>
                <th className="text-left p-2.5">BIR forms</th>
                <th className="text-left p-2.5">Industry / COA</th>
                <th className="text-left p-2.5">Withholding defaults</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {results.map((result, index) => <tr key={`${result.category}-${result.option}-${index}`} className="align-top hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                <td className="p-2.5"><div className="font-bold text-slate-700 dark:text-slate-200">{result.category}</div><div className="text-slate-500 mt-0.5">{result.option}</div></td>
                <td className="p-2.5">
                  <span className={`inline-flex items-center gap-1 font-bold ${result.passed ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                    {result.passed ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}{result.passed ? 'PASS' : 'REVIEW'}
                  </span>
                  {!result.passed && <div className="max-w-[230px] whitespace-normal text-[10px] text-amber-700 dark:text-amber-300 mt-1">{result.explanation}</div>}
                </td>
                <td className="p-2.5"><div>{result.classification}</div><div className="text-slate-500">{result.subClassification}</div><div className="text-slate-500">Tier: {result.tier}</div></td>
                <td className="p-2.5"><div>{result.vat}</div><div className="text-slate-500">{result.incomeRegime}</div><div className="text-slate-500">Deduction: {result.deductionMethod}</div></td>
                <td className="p-2.5 text-right tabular-nums">{formatTestCurrency(result.businessTax)}<div className="text-slate-500">{result.businessTaxForm}</div></td>
                <td className="p-2.5 text-right tabular-nums">{formatTestCurrency(result.incomeTax)}<div className="text-slate-500">{result.incomeTaxForm}</div></td>
                <td className="p-2.5"><div>{result.businessTaxForm}</div><div className="text-slate-500">{result.incomeTaxForm}</div><div className="max-w-[220px] whitespace-normal text-slate-400 mt-1">{result.requiredForms}</div></td>
                <td className="p-2.5"><div>{result.costSection}</div><div className="text-slate-500">{result.coaAccounts} default accounts</div></td>
                <td className="p-2.5">{result.withholdingDefaults}</td>
              </tr>)}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[10px] text-slate-400">PASS means the selected value is reflected in the tested workflow and calculation output. REVIEW means the option is normalized, unsupported, or behaves differently across engines; inspect the explanation before using it.</p>
      </>}
      {!results.length && <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-5 text-center text-xs text-slate-400">Choose a category or “All categories,” adjust the sample amounts, then run the tests to see how each option affects tax calculations, BIR forms, and industry account presets.</div>}
    </section>
  );
}

export function AdminSettings() {
  const { currentClient } = useAccounting();
  const { isAdmin, userRole, setUserRole } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [taxpayerProfiles, setTaxpayerProfiles] = useState<TaxpayerProfile[]>([]);
  const [selectedTaxpayerId, setSelectedTaxpayerId] = useState('');
  const [taxpayerDraft, setTaxpayerDraft] = useState<TaxpayerProfile | null>(null);
  const [taxpayerLoading, setTaxpayerLoading] = useState(false);
  const [taxpayerSaving, setTaxpayerSaving] = useState(false);
  // ---- T025: feature flags state ----
  useFeatureVisibility();
  const [featureVisibility, setFeatureVisibility] = useState<Record<string, boolean>>({});
  const [featureVisibilitySaving, setFeatureVisibilitySaving] = useState(false);
  const [featureAccessRules, setFeatureAccessRules] = useState<FeatureAccessRule[]>([]);
  const [featureAccessRulesLoading, setFeatureAccessRulesLoading] = useState(false);
  const [featureAccessRulesSaving, setFeatureAccessRulesSaving] = useState(false);
  const [featureAccessRulesError, setFeatureAccessRulesError] = useState('');
  const [featureRuleScope, setFeatureRuleScope] = useState<FeatureRuleScope>('plan');
  const [selectedFeaturePlan, setSelectedFeaturePlan] = useState('free');
  const [selectedFeatureUser, setSelectedFeatureUser] = useState('');
  useEffect(() => {
    let active = true;
    loadGlobalFeatureVisibility()
      .then(settings => { if (active) setFeatureVisibility(settings); })
      .catch(error => console.warn('[Feature visibility] Could not load global settings:', error));
    return () => { active = false; };
  }, []);
  const toggleVisibleFeature = async (id: string) => {
    const next = { ...featureVisibility, [id]: featureVisibility[id] === false };
    setFeatureVisibilitySaving(true);
    try { await saveFeatureVisibility(next); setFeatureVisibility(next); }
    catch (error) { alert(`Could not save feature visibility: ${error instanceof Error ? error.message : String(error)}`); }
    finally { setFeatureVisibilitySaving(false); }
  };
  useEffect(() => {
    if (!isAdmin) return;
    let active = true;
    setFeatureAccessRulesLoading(true);
    loadDeveloperFeatureRules()
      .then(rows => { if (active) { setFeatureAccessRules(rows); setFeatureAccessRulesError(''); } })
      .catch(error => { if (active) setFeatureAccessRulesError(error instanceof Error ? error.message : String(error)); })
      .finally(() => { if (active) setFeatureAccessRulesLoading(false); });
    return () => { active = false; };
  }, [isAdmin]);

  const featurePlanOptions = useMemo(() => {
    const labels: Record<string, string> = {
      free: 'Free / Trial', starter: 'Starter', pro: 'Pro', enterprise: 'Enterprise',
      essentials: 'Business Essentials', retail: 'Retail & Trading', practice: 'Accountant Practice',
    };
    const keys = new Set(['free', 'starter', 'pro', 'enterprise']);
    users.forEach(user => { if (user.subscriptionPlan) keys.add(user.subscriptionPlan.trim().toLowerCase()); });
    return [...keys].filter(Boolean).sort((a, b) => a === 'free' ? -1 : b === 'free' ? 1 : a.localeCompare(b)).map(value => ({
      value,
      label: labels[value] || value.replace(/[-_]/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase()),
    }));
  }, [users]);

  const selectedFeatureTarget = featureRuleScope === 'plan'
    ? selectedFeaturePlan
    : selectedFeatureUser;
  const selectedFeatureUserProfile = users.find(user => user.uid === selectedFeatureUser);
  const getFeatureRule = (scope: FeatureRuleScope, key: string, featureId: string) =>
    featureAccessRules.find(rule => rule.scope_type === scope && rule.scope_key === key && rule.feature_id === featureId);

  const changeTargetedFeatureRule = async (featureId: string, value: string) => {
    if (!selectedFeatureTarget) return;
    const enabled = value === 'inherit' ? null : value === 'enabled';
    setFeatureAccessRulesSaving(true);
    setFeatureAccessRulesError('');
    try {
      await saveDeveloperFeatureRule(featureRuleScope, selectedFeatureTarget, featureId, enabled);
      setFeatureAccessRules(current => [
        ...current.filter(rule => !(rule.scope_type === featureRuleScope && rule.scope_key === selectedFeatureTarget && rule.feature_id === featureId)),
        ...(enabled === null ? [] : [{ scope_type: featureRuleScope, scope_key: selectedFeatureTarget, feature_id: featureId, enabled } as FeatureAccessRule]),
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setFeatureAccessRulesError(message);
      alert(`Could not save targeted feature access: ${message}`);
    } finally {
      setFeatureAccessRulesSaving(false);
    }
  };
  const [flags, setFlags] = useState<Record<string, boolean>>(() => getFlags());
  const toggleFlag = (key: string) => { const v = !flags[key]; setFeatureFlag(key, v); setFlags(getFlags()); };
  const handleFullBackup = () => {
    const blob = new Blob([buildBackup({ users, localStorage: Object.fromEntries(Object.entries(localStorage).filter(([k]) => k.startsWith('capot.'))) })], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = `capot-backup-${new Date().toISOString().split('T')[0]}.json`; a.click(); URL.revokeObjectURL(url);
  };
  const [loading, setLoading] = useState(false);
  const [actionUserId, setActionUserId] = useState<string | null>(null);
  const [dbConnectionOk, setDbConnectionOk] = useState<boolean | null>(null);

  // Which tab shows is driven by the URL path itself
  // (/developertools/systemconfig vs /developertools/diagnostics), so each
  // tab has its own real, shareable/bookmarkable URL and the sidebar's
  // "System Config" / "Diagnostics" buttons link straight to the right one.
  const location = useLocation();
  const activeTab: AdminTab = location.pathname.endsWith('/diagnostics') ? 'diagnostics' : 'users';

  // Actually verify the Supabase database connection is live, instead of
  // showing a hardcoded "active" light regardless of real state.
  useEffect(() => {
    (async () => {
      try {
        const { error } = await supabase.from('clients').select('id').limit(1);
        setDbConnectionOk(!error);
      } catch {
        setDbConnectionOk(false);
      }
    })();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, display_name, user_role, last_login, updated_at, approved, blocked, subscription_plan')
        .order('updated_at', { ascending: false });
      if (error) throw error;
      const userList = (data || []).map((row) => ({
        uid: row.id,
        email: row.email,
        displayName: row.display_name,
        userRole: row.user_role,
        lastLogin: row.last_login,
        updatedAt: row.updated_at,
        approved: !!row.approved,
        blocked: !!row.blocked,
        subscriptionPlan: row.subscription_plan || 'free',
      })) as UserProfile[];
      setUsers(userList);
      setSelectedFeatureUser(current => current || userList[0]?.uid || '');
    } catch (err) {
      console.error("Error fetching users:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      fetchUsers();
    }
  }, [isAdmin]);

  const fetchTaxpayerProfiles = async () => {
    setTaxpayerLoading(true);
    try {
      const { data, error } = await supabase.rpc('developer_list_taxpayer_profiles');
      if (error) throw error;
      const rows = (Array.isArray(data) ? data : []) as TaxpayerProfile[];
      setTaxpayerProfiles(rows);
      setSelectedTaxpayerId(current => current && rows.some(row => row.id === current) ? current : (rows[0]?.id || ''));
      setTaxpayerDraft(current => {
        const selected = rows.find(row => row.id === selectedTaxpayerId) || rows[0];
        return selected ? { ...selected } : current;
      });
    } catch (err) {
      console.error('Unable to load taxpayer profiles:', err);
      alert(`Unable to load taxpayer profiles. Apply scripts/developer_taxpayer_controls.sql first. ${err instanceof Error ? err.message : String(err)}`);
    } finally { setTaxpayerLoading(false); }
  };

  useEffect(() => { if (isAdmin) fetchTaxpayerProfiles(); }, [isAdmin]);
  useEffect(() => {
    const selected = taxpayerProfiles.find(row => row.id === selectedTaxpayerId);
    setTaxpayerDraft(selected ? { ...selected } : null);
  }, [selectedTaxpayerId, taxpayerProfiles]);

  const saveTaxpayerProfile = async () => {
    if (!taxpayerDraft) return;
    setTaxpayerSaving(true);
    try {
      const { error } = await supabase.rpc('developer_update_taxpayer_profile', {
        p_client_id: taxpayerDraft.id,
        p_taxpayer_classification: taxpayerDraft.taxpayer_classification,
        p_taxpayer_sub_classification: taxpayerDraft.taxpayer_sub_classification || '',
        p_vat_registration_type: taxpayerDraft.vat_registration_type,
        p_income_tax_regime: taxpayerDraft.income_tax_regime || '',
        p_deduction_method: taxpayerDraft.deduction_method || '',
        p_percentage_tax_rate: taxpayerDraft.percentage_tax_rate,
        p_taxpayer_tier: taxpayerDraft.taxpayer_tier,
        p_industry: taxpayerDraft.industry,
      });
      if (error) throw error;
      alert('Taxpayer profile updated successfully.');
      await fetchTaxpayerProfiles();
    } catch (err) {
      console.error('Taxpayer profile update failed:', err);
      alert(`Failed to update taxpayer profile: ${err instanceof Error ? err.message : String(err)}`);
    } finally { setTaxpayerSaving(false); }
  };

  const handleBackup = () => {
    const dataStr = JSON.stringify(users, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `capotbooks_users_backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  
  const handleToggleApproval = async (uid: string, approve: boolean) => {
    setActionUserId(uid);
    try {
      // Approval changes must go through the SECURITY DEFINER RPC because the
      // developer is intentionally editing another user's profile. A direct
      // PostgREST UPDATE is subject to profiles RLS and can affect zero rows.
      const { error } = await supabase.rpc('set_user_approved', {
        p_target_user_id: uid,
        p_approved: approve,
      });

      if (error) throw error;

      await fetchUsers();
    } catch (err) {
      console.error('Approval toggle failed:', err);
      const message = err instanceof Error ? err.message : String(err);
      alert(`Failed to ${approve ? 'approve' : 'revoke'} user: ${message}`);
    } finally {
      setActionUserId(null);
    }
  };

  const handleToggleBlocked = async (uid: string, blocked: boolean) => {
    setActionUserId(uid);
    try {
      const { error } = await supabase.rpc('set_user_blocked', {
        p_target_user_id: uid,
        p_blocked: blocked,
      });
      if (error) throw error;
      await fetchUsers();
    } catch (err) {
      console.error('Block toggle failed:', err);
      const message = err instanceof Error ? err.message : String(err);
      alert(`Failed to ${blocked ? 'block' : 'unblock'} user: ${message}`);
    } finally {
      setActionUserId(null);
    }
  };

  const handleDeleteUser = async (user: UserProfile) => {
    const confirmed = window.confirm(
      `Delete ${user.email}?\n\nThis permanently deletes the webapp account and its associated CAPOT data. This cannot be undone.`
    );
    if (!confirmed) return;

    setActionUserId(user.uid);
    try {
      const { error } = await supabase.rpc('delete_user_account', {
        p_target_user_id: user.uid,
      });
      if (error) throw error;
      await fetchUsers();
    } catch (err) {
      console.error('User deletion failed:', err);
      const message = err instanceof Error ? err.message : String(err);
      alert(`Failed to delete user: ${message}`);
    } finally {
      setActionUserId(null);
    }
  };

  if (!isAdmin) return null;

  return (
    <div className="w-full flex flex-col">
      <PageHeader title="Developer System Config" icon={<ShieldAlert className="text-emerald-500" />} />
      <div className="p-4 md:p-6 flex-1">
      <div className="p-6 overflow-y-auto max-h-[80vh]">

        {/* Tab switcher: Superuser Dashboard (user directory/backup) vs
            Diagnostics (system/environment info). */}
        <div className="flex items-center gap-1 mb-6 border-b border-slate-200 dark:border-slate-700">
          <button
            onClick={() => navigate('/developertools/systemconfig')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-bold border-b-2 transition-all -mb-px ${
              activeTab === 'users'
                ? 'border-emerald-500 text-emerald-700 dark:text-emerald-400'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}
          >
            <Users className="w-4 h-4" />
            Superuser Dashboard
          </button>
          <button
            onClick={() => navigate('/developertools/diagnostics')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-bold border-b-2 transition-all -mb-px ${
              activeTab === 'diagnostics'
                ? 'border-emerald-500 text-emerald-700 dark:text-emerald-400'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}
          >
            <LineChart className="w-4 h-4" />
            Diagnostics
          </button>
        </div>

        {activeTab === 'diagnostics' ? (
          <DiagnosticsTab />
        ) : (
        <>
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Superuser Dashboard</h3>
          <button 
            onClick={handleBackup}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold shadow-md transition-all active:scale-95"
          >
            <Download className="w-4 h-4" />
            Backup User Directory
          </button>
        </div>
        
        <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4 mb-8">
          <p className="text-sm text-emerald-800 dark:text-emerald-300 font-medium mb-4">
            Authorized Developer: thugz.gerald13@gmail.com
          </p>
          
          <div className="flex items-center gap-4">
            <label className="text-sm font-bold text-emerald-900 dark:text-emerald-100">
              Current Active View:
            </label>
            <select 
              value={userRole || ''} 
              onChange={(e) => setUserRole(e.target.value)}
              className="bg-white dark:bg-slate-800 border border-emerald-200 dark:border-emerald-700 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="owner">Business Owner</option>
              <option value="accountant">Accountant / Bookkeeper</option>
            </select>
          </div>
        </div>

        {/* Developer-only cross-account taxpayer configuration */}
        <section className="mb-8 rounded-2xl border border-violet-200 dark:border-violet-900 bg-white dark:bg-slate-900 p-4 md:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h4 className="font-bold text-slate-800 dark:text-slate-100">Taxpayer Profile Manager</h4>
              <p className="text-xs text-slate-500 mt-1">Change the tax setup of any owner's client workspace. Changes are saved to Supabase.</p>
            </div>
            <button onClick={fetchTaxpayerProfiles} disabled={taxpayerLoading} className="px-3 py-2 rounded-lg text-xs font-bold border border-slate-300 dark:border-slate-700 disabled:opacity-50">
              <RefreshCw className={`inline w-3.5 h-3.5 mr-1 ${taxpayerLoading ? 'animate-spin' : ''}`} /> Refresh workspaces
            </button>
          </div>
          <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">Owner / taxpayer workspace</label>
          <select value={selectedTaxpayerId} onChange={e => setSelectedTaxpayerId(e.target.value)} className="form-input w-full mb-4" disabled={taxpayerLoading || !taxpayerProfiles.length}>
            {taxpayerProfiles.map(profile => <option key={profile.id} value={profile.id}>{profile.owner_email || profile.owner_name || profile.user_id} — {profile.name} ({profile.id})</option>)}
          </select>
          {taxpayerDraft ? <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {TAXPAYER_FIELDS.map(field => <label key={field.key} className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                {field.label}
                <select className="form-input w-full mt-1" value={String((taxpayerDraft as any)[field.key] || '')} onChange={e => setTaxpayerDraft(current => current ? { ...current, [field.key]: e.target.value } : current)}>
                  <option value="">Not specified</option>
                  {field.options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>)}
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Percentage tax rate
                <select className="form-input w-full mt-1" value={taxpayerDraft.percentage_tax_rate == null ? '' : String(taxpayerDraft.percentage_tax_rate)} onChange={e => setTaxpayerDraft(current => current ? { ...current, percentage_tax_rate: e.target.value === '' ? null : Number(e.target.value) } : current)}>
                  <option value="">Not specified</option><option value="0">0% (Exempt)</option><option value="0.01">1%</option><option value="0.02">2%</option><option value="0.03">3%</option><option value="0.05">5%</option>
                </select>
              </label>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
              <span className="text-[11px] text-slate-400">Owner: {taxpayerDraft.owner_email || 'Unknown'} · Workspace: {taxpayerDraft.name}</span>
              <button onClick={saveTaxpayerProfile} disabled={taxpayerSaving} className="px-5 py-2.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold disabled:opacity-50">{taxpayerSaving ? 'Saving…' : 'Save taxpayer configuration'}</button>
            </div>
          </> : <p className="text-sm text-slate-400 py-4">{taxpayerLoading ? 'Loading workspaces…' : 'No client workspaces found.'}</p>}
        </section>

        <TaxpayerTestBench profile={taxpayerDraft} />

        {/* User List Table */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-slate-500" />
              <h4 className="font-bold text-slate-700 dark:text-slate-200">Registered Users ({users.length})</h4>
            </div>
            <button 
              onClick={fetchUsers}
              className="p-2 text-slate-400 hover:text-blue-500 transition-colors"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700">
            {/* T023: permissions matrix + audit trail */}
            <div className="grid md:grid-cols-2 gap-4 mb-6">
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
                <div className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">Role Permissions Matrix</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-[10px]">
                    <thead><tr className="text-slate-400"><th className="text-left py-1">Permission</th>{ROLES.map(r => <th key={r} className="text-center py-1 px-1">{r}</th>)}</tr></thead>
                    <tbody>
                      {ALL_PERMISSIONS.map(p => (
                        <tr key={p.key} className="border-t border-slate-100 dark:border-slate-800">
                          <td className="py-1 text-slate-600 dark:text-slate-300">{p.label}</td>
                          {ROLES.map(r => <td key={r} className="text-center py-1">{can(r, p.key) ? <span className="text-emerald-500">✓</span> : <span className="text-slate-300">—</span>}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
                <div className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">Audit Trail (recent)</div>
                <div className="max-h-48 overflow-y-auto space-y-1.5">
                  {loadAuditLog().slice(0, 10).length === 0 && <div className="text-[11px] text-slate-400">No audit entries yet. Actions will be logged here.</div>}
                  {loadAuditLog().slice(0, 10).map(e => (
                    <div key={e.id} className="text-[11px] border-l-2 border-cyan-400 pl-2 py-0.5">
                      <span className="font-bold text-slate-700 dark:text-slate-200">{e.userEmail}</span>
                      <span className="text-slate-500"> · {e.action} · {e.entity}</span>
                      <div className="text-[9px] text-slate-400">{new Date(e.timestamp).toLocaleString()}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            {/* Account-specific system health audit */}
            <div className="mb-6">
              {users.find(u => u.email?.toLowerCase() === 'thugz.gerald13@gmail.com') ? (
                <AccountHealthMonitor
                  userId={users.find(u => u.email?.toLowerCase() === 'thugz.gerald13@gmail.com')!.uid}
                  email="thugz.gerald13@gmail.com"
                />
              ) : (
                <div className="rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/20 p-4 text-xs text-amber-800 dark:text-amber-300">
                  Account Health Monitor is configured for thugz.gerald13@gmail.com. Refresh the user directory and confirm that the profile is available to enable account-scoped checks.
                </div>
              )}
            </div>

            {/* Developer-controlled global feature visibility */}
            <div className="rounded-xl border border-violet-200 dark:border-violet-900 bg-white dark:bg-slate-900 p-4 mb-6">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <div>
                  <div className="text-xs font-black uppercase tracking-wider text-violet-700 dark:text-violet-300">User Feature Visibility</div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">Choose which pages and functions are visible to regular users. Changes apply across user accounts; the developer can still access hidden pages.</p>
                </div>
                <span className="text-[10px] text-slate-400">{featureVisibilitySaving ? 'Saving…' : 'Saved to Supabase'}</span>
              </div>
              <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4 mt-4">
                {[...new Set(FEATURE_VISIBILITY_ITEMS.map(item => item.group))].map(group => (
                  <div key={group} className="rounded-lg border border-slate-100 dark:border-slate-800 p-3">
                    <div className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-2">{group}</div>
                    <div className="space-y-2">
                      {FEATURE_VISIBILITY_ITEMS.filter(item => item.group === group).map(item => (
                        <label key={item.id} className="flex items-center justify-between gap-2 text-xs cursor-pointer">
                          <span className="text-slate-700 dark:text-slate-200">{item.label}</span>
                          <input type="checkbox" checked={featureVisibility[item.id] !== false} disabled={featureVisibilitySaving} onChange={() => void toggleVisibleFeature(item.id)} className="w-4 h-4 accent-violet-600 shrink-0" />
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Plan-level and per-user developer feature rules */}
            <section className="rounded-xl border border-indigo-200 dark:border-indigo-900 bg-white dark:bg-slate-900 p-4 mb-6">
              <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                <div>
                  <div className="text-xs font-black uppercase tracking-wider text-indigo-700 dark:text-indigo-300">Targeted Feature Controls</div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">Enable or disable individual pages for a subscription plan or a specific account. User rules override plan rules. A feature hidden globally remains hidden for everyone except the developer.</p>
                </div>
                <span className="text-[10px] text-slate-400">{featureAccessRulesLoading ? 'Loading rules…' : featureAccessRulesSaving ? 'Saving rule…' : `${featureAccessRules.length} targeted rules`}</span>
              </div>

              <div className="grid sm:grid-cols-3 gap-3 mb-4">
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300">
                  Apply rules to
                  <select className="form-input w-full mt-1" value={featureRuleScope} onChange={event => setFeatureRuleScope(event.target.value as FeatureRuleScope)} disabled={featureAccessRulesSaving}>
                    <option value="plan">Subscription plan</option>
                    <option value="user">Specific user</option>
                  </select>
                </label>
                {featureRuleScope === 'plan' ? (
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 sm:col-span-2">
                    Subscription plan
                    <select className="form-input w-full mt-1" value={selectedFeaturePlan} onChange={event => setSelectedFeaturePlan(event.target.value)} disabled={featureAccessRulesSaving}>
                      {featurePlanOptions.map(plan => <option key={plan.value} value={plan.value}>{plan.label}</option>)}
                    </select>
                  </label>
                ) : (
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 sm:col-span-2">
                    User account
                    <select className="form-input w-full mt-1" value={selectedFeatureUser} onChange={event => setSelectedFeatureUser(event.target.value)} disabled={featureAccessRulesSaving || !users.length}>
                      <option value="">Select a registered user</option>
                      {users.map(user => <option key={user.uid} value={user.uid}>{user.email} · {user.subscriptionPlan || 'free'}</option>)}
                    </select>
                  </label>
                )}
              </div>

              {featureRuleScope === 'user' && selectedFeatureUserProfile && (
                <div className="text-[10px] text-slate-500 dark:text-slate-400 mb-3">Account plan: <strong>{selectedFeatureUserProfile.subscriptionPlan || 'free'}</strong>. Features not overridden for this user inherit the plan rule, then the global setting.</div>
              )}

              {featureAccessRulesError && <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-300 text-[11px] p-3 mb-3">{featureAccessRulesError}. Run <code>scripts/developer_feature_access_rules.sql</code> in Supabase SQL Editor, then refresh this page.</div>}

              <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {[...new Set(FEATURE_VISIBILITY_ITEMS.map(item => item.group))].map(group => (
                  <div key={group} className="rounded-lg border border-slate-100 dark:border-slate-800 p-3">
                    <div className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-2">{group}</div>
                    <div className="space-y-2">
                      {FEATURE_VISIBILITY_ITEMS.filter(item => item.group === group).map(item => {
                        const directRule = getFeatureRule(featureRuleScope, selectedFeatureTarget, item.id);
                        const planKey = featureRuleScope === 'user' ? (selectedFeatureUserProfile?.subscriptionPlan || 'free').toLowerCase() : selectedFeaturePlan;
                        const planRule = featureRuleScope === 'user' ? getFeatureRule('plan', planKey, item.id) : undefined;
                        const globalAllowed = featureVisibility[item.id] !== false;
                        const effectiveAllowed = globalAllowed && (directRule?.enabled ?? planRule?.enabled ?? true);
                        const source = !globalAllowed ? 'Global lock' : directRule ? (featureRuleScope === 'user' ? 'User override' : 'Plan rule') : planRule ? 'Plan rule' : 'Global default';
                        const selectedValue = directRule ? (directRule.enabled ? 'enabled' : 'disabled') : 'inherit';
                        return (
                          <div key={item.id} className="rounded-md border border-slate-100 dark:border-slate-800 px-2 py-2">
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">{item.label}</span>
                              <span className={`text-[9px] font-bold ${effectiveAllowed ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>{effectiveAllowed ? 'ENABLED' : 'DISABLED'}</span>
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[9px] text-slate-400">{source}</span>
                              <select aria-label={`${item.label} targeted access`} className="form-input !py-1 !px-2 !text-[10px] max-w-[150px]" value={selectedValue} onChange={event => void changeTargetedFeatureRule(item.id, event.target.value)} disabled={featureAccessRulesLoading || featureAccessRulesSaving || !selectedFeatureTarget}>
                                <option value="inherit">Inherit</option>
                                <option value="enabled">Enable</option>
                                <option value="disabled">Disable</option>
                              </select>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-slate-400 mt-3">Inherit removes the selected override. For user rules, inheritance resolves as user → subscription plan → global visibility. These settings control app navigation and page access; existing Supabase data policies and transaction permissions remain in force.</p>
            </section>

            {/* T025: feature flags + full backup */}
            <div className="grid md:grid-cols-2 gap-4 mb-6">
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
                <div className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">Feature Flags</div>
                <div className="space-y-2">
                  {FEATURE_FLAGS.map(f => (
                    <label key={f.key} className="flex items-center justify-between gap-2 text-xs cursor-pointer">
                      <span><span className="font-semibold text-slate-700 dark:text-slate-200">{f.label}</span><span className="block text-[10px] text-slate-400">{f.description}</span></span>
                      <input type="checkbox" checked={!!flags[f.key]} onChange={() => toggleFlag(f.key)} className="w-4 h-4 accent-violet-600 shrink-0" />
                    </label>
                  ))}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
                <div className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">Data Backup & Restore</div>
                <button onClick={handleFullBackup} className="w-full mb-2 px-3 py-2 text-xs font-bold rounded-lg bg-slate-900 text-white dark:bg-white dark:text-slate-900 hover:opacity-90">Download Full Backup (.json)</button>
                <label className="block w-full px-3 py-2 text-xs font-bold rounded-lg border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 text-center cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800">
                  Restore from Backup…
                  <input type="file" accept=".json" className="hidden" onChange={e => {
                    const f = e.target.files?.[0]; if (!f) return;
                    const r = new FileReader(); r.onload = () => { const d = parseBackup(String(r.result || '')); if (d) alert('Backup parsed — restore logic pending review.'); else alert('Invalid backup file.'); }; r.readAsText(f);
                  }} />
                </label>
                <div className="text-[10px] text-slate-400 mt-2">Backup includes users + all capot.* localStorage settings.</div>
              </div>
            </div>
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                  <th className="px-4 py-3 font-bold text-slate-600 dark:text-slate-400">User</th>
                  <th className="px-4 py-3 font-bold text-slate-600 dark:text-slate-400">Role</th>
                  <th className="px-4 py-3 font-bold text-slate-600 dark:text-slate-400 text-right">Last Sync</th>
                  <th className="px-4 py-3 font-bold text-slate-600 dark:text-slate-400 text-right">Account Status / Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {users.map((u) => (
                  <tr key={u.uid} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <span className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                          {u.displayName || 'Anonymous'}
                          {u.email === 'thugz.gerald13@gmail.com' && <span className="bg-amber-100 dark:bg-amber-900/30 text-amber-600 text-[10px] px-1 rounded border border-amber-200">DEV</span>}
                        </span>
                        <span className="text-xs text-slate-400 flex items-center gap-1">
                          <Mail className="w-3 h-3" /> {u.email}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 capitalize">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${u.userRole === 'owner' ? 'bg-cyan-100 text-cyan-700' : 'bg-indigo-100 text-indigo-700'}`}>
                        {u.userRole || 'Not Set'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-slate-400 tabular-nums">
                      <div className="flex items-center justify-end gap-1">
                        <Calendar className="w-3 h-3" />
                        {u.lastLogin?.toDate ? u.lastLogin.toDate().toLocaleString() : 'N/A'}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {u.email?.toLowerCase() === 'thugz.gerald13@gmail.com' ? (
                        <span className="text-[10px] px-2 py-1 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 font-bold uppercase tracking-wide">Developer</span>
                      ) : (
                        <div className="flex items-center justify-end gap-2 flex-wrap">
                          {u.blocked ? (
                            <span className="text-[10px] px-2 py-1 rounded bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 font-bold uppercase tracking-wide">Blocked</span>
                          ) : u.approved ? (
                            <span className="text-[10px] px-2 py-1 rounded bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 font-bold uppercase tracking-wide">Approved</span>
                          ) : (
                            <span className="text-[10px] px-2 py-1 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 font-bold uppercase tracking-wide animate-pulse">Pending</span>
                          )}

                          {!u.blocked && !u.approved && (
                            <button
                              onClick={() => handleToggleApproval(u.uid, true)}
                              disabled={actionUserId === u.uid}
                              className="text-[10px] px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-wait text-white font-bold uppercase tracking-wide transition-colors"
                            >
                              Approve
                            </button>
                          )}

                          {!u.blocked && u.approved && (
                            <button
                              onClick={() => handleToggleApproval(u.uid, false)}
                              disabled={actionUserId === u.uid}
                              className="text-[10px] px-2 py-1 rounded border border-slate-300 dark:border-slate-600 text-slate-500 hover:text-red-500 hover:border-red-300 dark:hover:border-red-700 disabled:opacity-50 disabled:cursor-wait font-bold uppercase tracking-wide transition-colors"
                            >
                              Revoke
                            </button>
                          )}

                          <button
                            onClick={() => handleToggleBlocked(u.uid, !u.blocked)}
                            disabled={actionUserId === u.uid}
                            title={u.blocked ? 'Unblock account' : 'Block account'}
                            className={`inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded border font-bold uppercase tracking-wide transition-colors disabled:opacity-50 disabled:cursor-wait ${u.blocked ? 'border-emerald-300 text-emerald-600 hover:bg-emerald-50 dark:border-emerald-700 dark:hover:bg-emerald-900/20' : 'border-rose-300 text-rose-600 hover:bg-rose-50 dark:border-rose-700 dark:hover:bg-rose-900/20'}`}
                          >
                            <Ban className="w-3 h-3" />
                            {u.blocked ? 'Unblock' : 'Block'}
                          </button>

                          <button
                            onClick={() => handleDeleteUser(u)}
                            disabled={actionUserId === u.uid}
                            title="Permanently delete account"
                            className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded border border-slate-300 dark:border-slate-600 text-slate-500 hover:text-rose-600 hover:border-rose-300 dark:hover:border-rose-700 disabled:opacity-50 disabled:cursor-wait font-bold uppercase tracking-wide transition-colors"
                          >
                            <Trash2 className="w-3 h-3" />
                            Delete
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-slate-400 italic">
                      No users synchronized with central database yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-4 bg-white dark:bg-slate-800">
            <h4 className="font-bold text-slate-700 dark:text-slate-200 mb-2">Current Active Client Context</h4>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {currentClient ? currentClient.id : 'No client selected'}
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
              Data is synced live to Supabase Postgres under `clients` (row id = `${currentClient?.id || 'CLIENT_ID'}`). No data is stored in the browser.
            </p>
          </div>

          <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-4 bg-white dark:bg-slate-800">
            <h4 className="font-bold text-slate-700 dark:text-slate-200 mb-2">System Status</h4>
            <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
              <span
                className={`w-2 h-2 rounded-full ${
                  dbConnectionOk === null
                    ? 'bg-slate-400 animate-pulse'
                    : dbConnectionOk
                    ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] animate-pulse'
                    : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]'
                }`}
              ></span>
              {dbConnectionOk === null
                ? 'Checking Database Connection...'
                : dbConnectionOk
                ? 'Supabase Database Connected'
                : 'Supabase Database Unavailable'}
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 mt-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></span>
              Supabase Auth Active
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 mt-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></span>
              Supabase Postgres Sync Active
            </div>
          </div>
        </div>
        </>
        )}
      </div>
          </div>
    </div>
  );
}

