import React, { useState, useMemo } from 'react';
import { motion } from 'motion/react';
import {
  Building2,
  Briefcase,
  User,
  Users,
  Landmark,
  ShieldCheck,
  Store,
  Factory,
  HardHat,
  CheckCircle2,
  ArrowRight,
  Sparkles,
  FileSpreadsheet,
  Scale,
  Receipt,
} from 'lucide-react';
import { resolveBusinessWorkflow } from '../lib/taxEngine';
import type {
  ClientIndustry,
  VatRegistrationType,
  TaxpayerClassificationType,
  TaxpayerSubClassification,
  TaxpayerSizeTier,
  IncomeTaxRegime,
} from '../types';

export interface PreselectedOnboardingCategory {
  tileId: string;
  title: string;
  userRole: 'owner' | 'accountant';
  taxpayerClassification: TaxpayerClassificationType;
  taxpayerSubClassification: TaxpayerSubClassification;
  vatRegistrationType: VatRegistrationType;
  incomeTaxRegime: IncomeTaxRegime;
  percentageTaxRate: number;
  taxpayerTier: TaxpayerSizeTier;
  industry: ClientIndustry;
  category: 'private' | 'government';
  hasEmployees: boolean;
}

export const ONBOARDING_CATEGORY_STORAGE_KEY = 'capot_preselected_onboarding_v1';

export function savePreselectedOnboardingCategory(selection: PreselectedOnboardingCategory): void {
  try {
    localStorage.setItem(ONBOARDING_CATEGORY_STORAGE_KEY, JSON.stringify(selection));
  } catch {
    // ignore storage quota errors
  }
}

export function loadPreselectedOnboardingCategory(): PreselectedOnboardingCategory | null {
  try {
    const raw = localStorage.getItem(ONBOARDING_CATEGORY_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PreselectedOnboardingCategory;
  } catch {
    return null;
  }
}

interface CategoryTileDef {
  id: string;
  title: string;
  badge: string;
  subtitle: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  accentColor: string;
  userRole: 'owner' | 'accountant';
  classification: TaxpayerClassificationType;
  subClassification: TaxpayerSubClassification;
  defaultVat: VatRegistrationType;
  defaultRegime: IncomeTaxRegime;
  defaultIndustry: ClientIndustry;
  defaultTier: TaxpayerSizeTier;
  formsPreview: string;
}

export const PRIMARY_CATEGORY_TILES: CategoryTileDef[] = [
  {
    id: 'sole_proprietor',
    title: 'Sole Proprietor',
    badge: 'Individual · DTI Business',
    subtitle: 'Single Proprietorship / Store / Merchant',
    description:
      'For individual business owners running retail, trading, service, or manufacturing operations under DTI & BIR registration.',
    icon: Store,
    accentColor: 'cyan',
    userRole: 'owner',
    classification: 'Individual',
    subClassification: 'sole_proprietor',
    defaultVat: 'non-vat',
    defaultRegime: '8_percent_flat',
    defaultIndustry: 'retail',
    defaultTier: 'micro',
    formsPreview: '1701Q · 1701 / 1701A · 2551Q / 2550Q',
  },
  {
    id: 'professional',
    title: 'Freelancer / Professional',
    badge: 'Individual · Self-Employed',
    subtitle: 'Licensed Professional / Consultant / Creator',
    description:
      'For doctors, lawyers, engineers, CPAs, virtual assistants, and independent contractors billing clients for services.',
    icon: User,
    accentColor: 'blue',
    userRole: 'owner',
    classification: 'Individual',
    subClassification: 'professional',
    defaultVat: 'non-vat',
    defaultRegime: '8_percent_flat',
    defaultIndustry: 'general-services',
    defaultTier: 'micro',
    formsPreview: '1701Q · 1701A (8% or OSD) · 2307 CWT',
  },
  {
    id: 'mixed_income',
    title: 'Mixed-Income Earner',
    badge: 'Individual · Compensation + Business',
    subtitle: 'Employee with Side Business or Practice',
    description:
      'For taxpayers earning both employer compensation (BIR Form 2316) and business/professional income without duplicate ₱250k exemption.',
    icon: Users,
    accentColor: 'indigo',
    userRole: 'owner',
    classification: 'Individual',
    subClassification: 'mixed_income',
    defaultVat: 'non-vat',
    defaultRegime: 'graduated_osd',
    defaultIndustry: 'general-services',
    defaultTier: 'small',
    formsPreview: '1701Q · 1701 (Consolidation) · 2551Q / 2550Q',
  },
  {
    id: 'msme_corp',
    title: 'MSME Corporation (20%)',
    badge: 'Non-Individual · CREATE Law',
    subtitle: 'Domestic Corp (Net ≤ ₱5M & Assets ≤ ₱100M)',
    description:
      'For small and medium domestic corporations qualifying for the lower 20% Corporate Income Tax rate under the CREATE Act.',
    icon: Building2,
    accentColor: 'emerald',
    userRole: 'owner',
    classification: 'Non-Individual',
    subClassification: 'msme_corp',
    defaultVat: 'vat',
    defaultRegime: 'corp_20_msme',
    defaultIndustry: 'retail',
    defaultTier: 'small',
    formsPreview: '1702Q · 1702-RT (20% MSME) · 2550Q + RELIEF',
  },
  {
    id: 'domestic_corp',
    title: 'Regular Corporation (25%)',
    badge: 'Non-Individual · Regular RCIT',
    subtitle: 'Medium & Large Domestic Corporation',
    description:
      'For regular domestic corporations subject to 25% RCIT (with automatic MCIT comparison after Year 4), VAT/RELIEF, and EWT.',
    icon: Landmark,
    accentColor: 'violet',
    userRole: 'owner',
    classification: 'Non-Individual',
    subClassification: 'domestic_corp',
    defaultVat: 'vat',
    defaultRegime: 'corp_25_regular',
    defaultIndustry: 'manufacturing',
    defaultTier: 'medium',
    formsPreview: '1702Q · 1702-RT (25% / MCIT) · 2550Q + RELIEF',
  },
  {
    id: 'opc',
    title: 'One Person Corporation (OPC)',
    badge: 'Non-Individual · Single Stockholder',
    subtitle: 'SEC-Registered OPC',
    description:
      'For single-stockholder corporations enjoying limited liability with corporate tax workflows (20% MSME or 25% RCIT).',
    icon: ShieldCheck,
    accentColor: 'teal',
    userRole: 'owner',
    classification: 'Non-Individual',
    subClassification: 'opc',
    defaultVat: 'vat',
    defaultRegime: 'corp_20_msme',
    defaultIndustry: 'general-services',
    defaultTier: 'small',
    formsPreview: '1702Q · 1702-RT · 2550Q / 2551Q',
  },
  {
    id: 'gpp',
    title: 'General Professional Partnership',
    badge: 'Non-Individual · Tax-Exempt Entity',
    subtitle: 'Law, Accounting, Engineering & Medical Firms',
    description:
      'For GPPs exempt from corporate income tax (Form 1702-EX) where net income is distributed to partners for individual taxation.',
    icon: Scale,
    accentColor: 'amber',
    userRole: 'owner',
    classification: 'Non-Individual',
    subClassification: 'gpp',
    defaultVat: 'vat',
    defaultRegime: 'corp_gpp_exempt',
    defaultIndustry: 'general-services',
    defaultTier: 'small',
    formsPreview: '1702-EX (0% Entity Tax) · 2550Q · 1601-EQ',
  },
  {
    id: 'cooperative',
    title: 'Partnership / Cooperative / Ecozone',
    badge: 'Non-Individual · Special / Exempt / Mixed',
    subtitle: 'CDA Cooperative, PEZA (5% GIE), or Joint Venture',
    description:
      'For cooperatives, PEZA/Ecozone enterprises under 5% Special Gross Income Earned (1702-MX), or taxable business partnerships.',
    icon: Factory,
    accentColor: 'rose',
    userRole: 'owner',
    classification: 'Non-Individual',
    subClassification: 'cooperative',
    defaultVat: 'exempt',
    defaultRegime: 'corp_special_5',
    defaultIndustry: 'manufacturing',
    defaultTier: 'medium',
    formsPreview: '1702-MX (5% GIE) / 1702-EX · Zero-Rated / Exempt',
  },
  {
    id: 'accountant_firm',
    title: 'Accountant / Bookkeeper',
    badge: 'Multi-Client Practice Hub',
    subtitle: 'Accounting Firm / External Bookkeeper / Tax Practitioner',
    description:
      'Manage multiple client workspaces across all taxpayer classifications, VAT types, industries, and BIR compliance schedules.',
    icon: Briefcase,
    accentColor: 'sky',
    userRole: 'accountant',
    classification: 'Individual',
    subClassification: 'professional',
    defaultVat: 'vat',
    defaultRegime: 'graduated_osd',
    defaultIndustry: 'general-services',
    defaultTier: 'small',
    formsPreview: 'Multi-Client Books · All BIR Forms · RELIEF & Alphalist',
  },
];

const VAT_TILES: Array<{ value: VatRegistrationType; label: string; desc: string }> = [
  { value: 'non-vat', label: 'Non-VAT / Percentage Tax', desc: 'Form 2551Q (or Exempt on 8% Flat)' },
  { value: 'vat', label: 'VAT Registered (12%)', desc: 'Form 2550Q + Quarterly RELIEF (SLSP)' },
  { value: 'exempt', label: 'VAT-Exempt', desc: '0% VAT · Exempt Goods/Services' },
  { value: 'zero-rated', label: 'Zero-Rated (0%)', desc: '0% Output VAT + Input VAT Credit' },
];

const INDUSTRY_TILES: Array<{ value: ClientIndustry; label: string; desc: string; icon: React.ComponentType<{ className?: string }> }> = [
  { value: 'retail', label: 'Retail / Trading', desc: 'Cost of Sales · Merchandise Inventory', icon: Store },
  { value: 'general-services', label: 'General Services', desc: 'Cost of Revenue · Direct Service Costs', icon: Briefcase },
  { value: 'manufacturing', label: 'Manufacturing', desc: 'Cost of Goods Manufactured & Sold', icon: Factory },
  { value: 'construction', label: 'Construction / Contracting', desc: 'Cost of Contract Revenue · BOQ/WIP', icon: HardHat },
];

const INDIVIDUAL_REGIME_TILES: Array<{ value: IncomeTaxRegime; label: string; desc: string }> = [
  { value: '8_percent_flat', label: '8% Flat Income Tax', desc: '8% on Gross > ₱250k · No 2551Q Percentage Tax' },
  { value: 'graduated_itemized', label: 'Graduated (0%–35%) + Itemized', desc: 'TRAIN Tax Table with Itemized Expenses' },
  { value: 'graduated_osd', label: 'Graduated (0%–35%) + 40% OSD', desc: '40% Optional Standard Deduction on Gross' },
];

const CORPORATE_REGIME_TILES: Array<{ value: IncomeTaxRegime; label: string; desc: string }> = [
  { value: 'corp_20_msme', label: '20% CREATE MSME (Itemized)', desc: 'Net Income ≤ ₱5M & Assets ≤ ₱100M' },
  { value: 'corp_20_osd', label: '20% CREATE MSME (40% OSD)', desc: '20% CIT with 40% OSD on Gross Income' },
  { value: 'corp_25_regular', label: '25% Regular RCIT (Itemized)', desc: 'Standard 25% CIT + MCIT Comparison' },
  { value: 'corp_25_osd', label: '25% Regular RCIT (40% OSD)', desc: '25% CIT with 40% OSD on Gross Income' },
  { value: 'corp_gpp_exempt', label: '0% Exempt / GPP (1702-EX)', desc: 'Tax-Exempt GPP or Exempt Cooperative' },
  { value: 'corp_special_5', label: '5% Special GIE (1702-MX)', desc: 'PEZA / Ecozone 5% Gross Income Earned' },
];

const EOPT_TIER_TILES: Array<{ value: TaxpayerSizeTier; label: string; desc: string }> = [
  { value: 'micro', label: 'Micro (< ₱3M)', desc: 'Reduced 10% surcharge & 6% interest' },
  { value: 'small', label: 'Small (₱3M – < ₱20M)', desc: 'Reduced 10% surcharge & 6% interest' },
  { value: 'medium', label: 'Medium (₱20M – < ₱1B)', desc: 'Standard 25% surcharge & 12% interest' },
  { value: 'large', label: 'Large (≥ ₱1B)', desc: 'Standard 25% surcharge & 12% interest' },
];

interface LandingPageProps {
  onNavigateAuth: (mode: 'login' | 'signup', category?: PreselectedOnboardingCategory) => void;
}

export function LandingPage({ onNavigateAuth }: LandingPageProps) {
  const existing = useMemo(() => loadPreselectedOnboardingCategory(), []);
  const initialTile = PRIMARY_CATEGORY_TILES.find(t => t.id === existing?.tileId) || PRIMARY_CATEGORY_TILES[0];

  const [selectedTileId, setSelectedTileId] = useState<string>(initialTile.id);
  const [vatType, setVatType] = useState<VatRegistrationType>(existing?.vatRegistrationType || initialTile.defaultVat);
  const [industry, setIndustry] = useState<ClientIndustry>(existing?.industry || initialTile.defaultIndustry);
  const [regime, setRegime] = useState<IncomeTaxRegime>(existing?.incomeTaxRegime || initialTile.defaultRegime);
  const [sizeTier, setSizeTier] = useState<TaxpayerSizeTier>(existing?.taxpayerTier || initialTile.defaultTier);
  const [counterpartyCategory, setCounterpartyCategory] = useState<'private' | 'government'>(existing?.category || 'private');
  const [percentageTaxRate, setPercentageTaxRate] = useState<number>(existing?.percentageTaxRate ?? 0.03);
  const [hasEmployees, setHasEmployees] = useState<boolean>(existing?.hasEmployees ?? true);

  const activeTile = useMemo(
    () => PRIMARY_CATEGORY_TILES.find(t => t.id === selectedTileId) || PRIMARY_CATEGORY_TILES[0],
    [selectedTileId]
  );

  const handleSelectPrimaryTile = (tile: CategoryTileDef) => {
    setSelectedTileId(tile.id);
    setVatType(tile.defaultVat);
    setIndustry(tile.defaultIndustry);
    setRegime(tile.defaultRegime);
    setSizeTier(tile.defaultTier);
  };

  const handleVatChange = (nextVat: VatRegistrationType) => {
    setVatType(nextVat);
    // VAT-registered individuals cannot elect 8% Flat Income Tax under TRAIN Law
    if (nextVat === 'vat' && regime === '8_percent_flat') {
      setRegime('graduated_itemized');
    }
  };

  const currentSelection: PreselectedOnboardingCategory = useMemo(
    () => ({
      tileId: activeTile.id,
      title: activeTile.title,
      userRole: activeTile.userRole,
      taxpayerClassification: activeTile.classification,
      taxpayerSubClassification: activeTile.subClassification,
      vatRegistrationType: vatType,
      incomeTaxRegime: regime,
      percentageTaxRate: regime === '8_percent_flat' ? 0 : percentageTaxRate,
      taxpayerTier: sizeTier,
      industry,
      category: counterpartyCategory,
      hasEmployees,
    }),
    [activeTile, vatType, regime, percentageTaxRate, sizeTier, industry, counterpartyCategory, hasEmployees]
  );

  const resolvedWorkflow = useMemo(
    () =>
      resolveBusinessWorkflow({
        taxpayerClassification: currentSelection.taxpayerClassification,
        taxpayerSubClassification: currentSelection.taxpayerSubClassification,
        vatRegistrationType: currentSelection.vatRegistrationType,
        incomeTaxRegime: currentSelection.incomeTaxRegime,
        percentageTaxRate: currentSelection.percentageTaxRate,
        taxpayerTier: currentSelection.taxpayerTier,
        industry: currentSelection.industry,
        category: currentSelection.category,
        hasEmployees: currentSelection.hasEmployees,
      }),
    [currentSelection]
  );

  const handleProceedWithCategory = (mode: 'signup' | 'login' = 'signup', overrideTile?: CategoryTileDef) => {
    const payload: PreselectedOnboardingCategory = overrideTile
      ? {
          tileId: overrideTile.id,
          title: overrideTile.title,
          userRole: overrideTile.userRole,
          taxpayerClassification: overrideTile.classification,
          taxpayerSubClassification: overrideTile.subClassification,
          vatRegistrationType: overrideTile.defaultVat,
          incomeTaxRegime: overrideTile.defaultRegime,
          percentageTaxRate: overrideTile.defaultRegime === '8_percent_flat' ? 0 : 0.03,
          taxpayerTier: overrideTile.defaultTier,
          industry: overrideTile.defaultIndustry,
          category: counterpartyCategory,
          hasEmployees,
        }
      : currentSelection;

    savePreselectedOnboardingCategory(payload);
    onNavigateAuth(mode, payload);
  };

  const availableRegimes =
    activeTile.classification === 'Non-Individual' ? CORPORATE_REGIME_TILES : INDIVIDUAL_REGIME_TILES;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 font-sans flex flex-col">
      {/* Top Navigation Bar with Login / Sign Up in Top-Right Corner */}
      <header className="sticky top-0 z-40 backdrop-blur-md bg-white/90 dark:bg-slate-900/90 border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white font-black text-lg shadow-sm">
              CB
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-black text-lg tracking-tight text-slate-900 dark:text-white">
                  CAPOTBOOKS
                </span>
                <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-cyan-50 text-cyan-700 dark:bg-cyan-950/60 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800">
                  BIR &amp; EOPT Ready
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 hidden sm:block">
                Philippine Accounting, Books of Accounts &amp; Multi-Workflow Tax Compliance
              </p>
            </div>
          </div>

          {/* Top-Right Login / Sign Up Words & Quick Action */}
          <div className="flex items-center gap-3 sm:gap-5">
            <div className="flex items-center gap-2 text-sm font-bold">
              <button
                type="button"
                onClick={() => onNavigateAuth('login', currentSelection)}
                className="px-2.5 py-1.5 rounded-lg text-slate-700 dark:text-slate-200 hover:text-cyan-600 dark:hover:text-cyan-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Login
              </button>
              <span className="text-slate-300 dark:text-slate-700 select-none">/</span>
              <button
                type="button"
                onClick={() => handleProceedWithCategory('signup')}
                className="px-2.5 py-1.5 rounded-lg text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 dark:hover:text-cyan-300 hover:bg-cyan-50 dark:hover:bg-cyan-950/40 transition-colors cursor-pointer"
              >
                Sign Up
              </button>
            </div>

            <button
              type="button"
              onClick={() => handleProceedWithCategory('signup')}
              className="hidden md:inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-bold shadow-sm transition-colors cursor-pointer"
            >
              <span>Start 7-Day Free Trial</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12 space-y-10">
        {/* Hero Header */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center max-w-3xl mx-auto space-y-3"
        >
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-cyan-50 dark:bg-cyan-950/50 border border-cyan-200 dark:border-cyan-800 text-cyan-700 dark:text-cyan-300 text-xs font-bold">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Step 1 of 2 · Choose Your Taxpayer &amp; Business Category</span>
          </div>
          <h1 className="text-2xl sm:text-4xl font-black tracking-tight text-slate-900 dark:text-white">
            What Category Does Your Business Fall Under?
          </h1>
          <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
            Select a tile below before signing up. CAPOTBOOKS automatically configures your separate workflow for
            Chart of Accounts, Books of Accounts, VAT / Percentage Tax, and BIR Forms based on your classification.
          </p>
        </motion.div>

        {/* STEP 1: Primary Taxpayer & Role Category Tiles */}
        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-cyan-600 text-white text-xs font-black inline-flex items-center justify-center">
                  1
                </span>
                Select Your Taxpayer Classification or Practice Category
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 ml-8">
                Click any tile to preview its custom workflow, or click &ldquo;Select &amp; Sign Up&rdquo; on the tile to proceed immediately.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {PRIMARY_CATEGORY_TILES.map((tile) => {
              const Icon = tile.icon;
              const isSelected = selectedTileId === tile.id;
              return (
                <motion.div
                  key={tile.id}
                  whileHover={{ y: -2 }}
                  onClick={() => handleSelectPrimaryTile(tile)}
                  className={`group relative rounded-2xl p-5 border-2 transition-all cursor-pointer flex flex-col justify-between ${
                    isSelected
                      ? 'border-cyan-600 dark:border-cyan-400 bg-cyan-50/40 dark:bg-cyan-950/25 shadow-md ring-2 ring-cyan-500/20'
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-cyan-400 dark:hover:border-cyan-600'
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div
                        className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                          isSelected
                            ? 'bg-cyan-600 text-white'
                            : 'bg-slate-100 dark:bg-slate-800 text-cyan-600 dark:text-cyan-400 group-hover:bg-cyan-50 dark:group-hover:bg-cyan-950/40'
                        }`}
                      >
                        <Icon className="w-5 h-5" />
                      </div>
                      <span
                        className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
                          isSelected
                            ? 'bg-cyan-600 text-white'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {tile.badge}
                      </span>
                    </div>

                    <h3 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                      <span>{tile.title}</span>
                      {isSelected && <CheckCircle2 className="w-4 h-4 text-cyan-600 dark:text-cyan-400 shrink-0" />}
                    </h3>
                    <p className="text-xs font-semibold text-cyan-700 dark:text-cyan-300 mt-0.5">{tile.subtitle}</p>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-2 leading-relaxed">
                      {tile.description}
                    </p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 truncate">
                      {tile.formsPreview}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectPrimaryTile(tile);
                        handleProceedWithCategory('signup', tile);
                      }}
                      className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-colors ${
                        isSelected
                          ? 'bg-cyan-600 text-white hover:bg-cyan-700'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-cyan-600 hover:text-white'
                      }`}
                    >
                      <span>Select &amp; Sign Up</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </section>

        {/* STEP 2: Customize VAT Type, Industry, Tax Rate Regime & EOPT Tier Tiles */}
        <section className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-7 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-4">
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-cyan-600 text-white text-xs font-black inline-flex items-center justify-center">
                  2
                </span>
                Tailor Your VAT Type, Business Industry &amp; Tax Rate Workflow (Optional)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 ml-8">
                Smart defaults are already selected for <strong>{activeTile.title}</strong>. Click any tile below to customize before signing up.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* VAT Registration Tiles */}
            <div className="space-y-2.5">
              <label className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <Receipt className="w-3.5 h-3.5 text-cyan-600" />
                VAT / Business Tax Registration Type
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {VAT_TILES.map((v) => {
                  const active = vatType === v.value;
                  return (
                    <button
                      key={v.value}
                      type="button"
                      onClick={() => handleVatChange(v.value)}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                        active
                          ? 'border-cyan-600 bg-cyan-50/60 dark:bg-cyan-950/40 dark:border-cyan-400 ring-1 ring-cyan-500/30'
                          : 'border-slate-200 dark:border-slate-800 hover:border-cyan-400'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-extrabold text-slate-900 dark:text-white">{v.label}</span>
                        {active && <CheckCircle2 className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />}
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{v.desc}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Business Industry Tiles */}
            <div className="space-y-2.5">
              <label className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <FileSpreadsheet className="w-3.5 h-3.5 text-cyan-600" />
                Business Type / Industry Chart of Accounts
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {INDUSTRY_TILES.map((ind) => {
                  const IndIcon = ind.icon;
                  const active = industry === ind.value;
                  return (
                    <button
                      key={ind.value}
                      type="button"
                      onClick={() => setIndustry(ind.value)}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                        active
                          ? 'border-cyan-600 bg-cyan-50/60 dark:bg-cyan-950/40 dark:border-cyan-400 ring-1 ring-cyan-500/30'
                          : 'border-slate-200 dark:border-slate-800 hover:border-cyan-400'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                          <IndIcon className="w-3.5 h-3.5 text-cyan-600" />
                          {ind.label}
                        </span>
                        {active && <CheckCircle2 className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />}
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{ind.desc}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Income Tax Regime & Rate Tiles */}
            <div className="space-y-2.5">
              <label className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <Scale className="w-3.5 h-3.5 text-cyan-600" />
                Chosen Income Tax Rate / Regime ({activeTile.classification})
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {availableRegimes.map((r) => {
                  const disabled = vatType === 'vat' && r.value === '8_percent_flat';
                  const active = regime === r.value;
                  return (
                    <button
                      key={r.value}
                      type="button"
                      disabled={disabled}
                      onClick={() => setRegime(r.value)}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        disabled
                          ? 'opacity-45 cursor-not-allowed border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900'
                          : active
                          ? 'border-cyan-600 bg-cyan-50/60 dark:bg-cyan-950/40 dark:border-cyan-400 ring-1 ring-cyan-500/30 cursor-pointer'
                          : 'border-slate-200 dark:border-slate-800 hover:border-cyan-400 cursor-pointer'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-extrabold text-slate-900 dark:text-white">{r.label}</span>
                        {active && <CheckCircle2 className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />}
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        {disabled ? 'Unavailable for VAT-registered taxpayers' : r.desc}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* EOPT Size Tier & Counterparty / Percentage Tax Rate Tiles */}
            <div className="space-y-2.5">
              <label className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-cyan-600" />
                EOPT Act Taxpayer Tier &amp; Counterparty Settings
              </label>
              <div className="grid grid-cols-2 gap-2.5">
                {EOPT_TIER_TILES.map((t) => {
                  const active = sizeTier === t.value;
                  return (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setSizeTier(t.value)}
                      className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                        active
                          ? 'border-cyan-600 bg-cyan-50/60 dark:bg-cyan-950/40 dark:border-cyan-400 ring-1 ring-cyan-500/30'
                          : 'border-slate-200 dark:border-slate-800 hover:border-cyan-400'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-extrabold text-slate-900 dark:text-white">{t.label}</span>
                        {active && <CheckCircle2 className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />}
                      </div>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">{t.desc}</p>
                    </button>
                  );
                })}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setCounterpartyCategory(counterpartyCategory === 'private' ? 'government' : 'private')}
                  className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-cyan-400 text-left text-xs cursor-pointer"
                >
                  <div className="text-[10px] font-bold uppercase text-slate-400">Counterparty</div>
                  <div className="font-extrabold text-slate-800 dark:text-slate-100 mt-0.5">
                    {counterpartyCategory === 'government' ? 'Gov’t (5% FV + EWT)' : 'Private Commercial'}
                  </div>
                </button>

                {vatType === 'non-vat' && regime !== '8_percent_flat' && (
                  <div className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 text-left text-xs">
                    <div className="text-[10px] font-bold uppercase text-slate-400">2551Q % Tax Rate</div>
                    <select
                      value={String(percentageTaxRate)}
                      onChange={(e) => setPercentageTaxRate(parseFloat(e.target.value))}
                      className="w-full bg-transparent font-extrabold text-slate-800 dark:text-slate-100 mt-0.5 focus:outline-none"
                    >
                      <option value="0.03">3% Regular (PT010)</option>
                      <option value="0.01">1% Cooperative / Create</option>
                      <option value="0.02">2% Financial / Other</option>
                      <option value="0.05">5% Gross Receipts Tax</option>
                    </select>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setHasEmployees(!hasEmployees)}
                  className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-cyan-400 text-left text-xs cursor-pointer"
                >
                  <div className="text-[10px] font-bold uppercase text-slate-400">With Employees</div>
                  <div className="font-extrabold text-slate-800 dark:text-slate-100 mt-0.5">
                    {hasEmployees ? 'Yes (1601-C + Payroll)' : 'No Employees'}
                  </div>
                </button>
              </div>
            </div>
          </div>

          {/* Live Workflow Summary Banner + Primary CTA */}
          <div className="rounded-2xl bg-gradient-to-r from-slate-900 via-slate-800 to-cyan-950 text-white p-5 sm:p-6 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-5">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-cyan-500/20 text-cyan-300 border border-cyan-400/30">
                  Selected Category: {activeTile.title}
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-white/10 text-slate-200">
                  {resolvedWorkflow.vatLabel}
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-white/10 text-slate-200">
                  EOPT {resolvedWorkflow.sizeTier.toUpperCase()}
                </span>
              </div>
              <div className="text-sm sm:text-base font-bold text-white">
                Configured BIR Forms:{' '}
                <span className="text-cyan-300">
                  {[
                    resolvedWorkflow.quarterlyItrForm,
                    resolvedWorkflow.annualItrForm,
                    resolvedWorkflow.businessTaxForm,
                    resolvedWorkflow.isReliefApplicable ? 'RELIEF (SLSP)' : null,
                    '1601-EQ / 0619-E',
                    hasEmployees ? '1601-C / 1604-C' : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </div>
              <p className="text-xs text-slate-300">
                Chart of Accounts Cost Structure: <strong>{resolvedWorkflow.costSectionLabel}</strong> · Primary Role:{' '}
                <strong>{activeTile.userRole === 'accountant' ? 'Accountant / Bookkeeper' : 'Business Owner'}</strong>
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto justify-end">
              <button
                type="button"
                onClick={() => handleProceedWithCategory('login')}
                className="px-4 py-3 rounded-xl border border-white/20 hover:bg-white/10 text-white text-xs sm:text-sm font-bold transition-colors cursor-pointer"
              >
                Already have an account? Login
              </button>
              <button
                type="button"
                onClick={() => handleProceedWithCategory('signup')}
                className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs sm:text-sm font-black shadow-lg transition-all cursor-pointer"
              >
                <span>Continue to Sign Up with This Category</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
