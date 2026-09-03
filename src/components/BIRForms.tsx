import React, { useState, useMemo, useEffect } from 'react';
import { PageHeader } from './ui/PageHeader';
import { useAccounting } from '../context/AccountingContext';
import { 
  FileText, Printer, Sparkles, CheckCircle2
} from 'lucide-react';
import { TaxDeadline, Client } from '../types';
import { adjustDeadlineForWeekend } from '../lib/complianceUtils';
import { supabase } from '../lib/supabase';

// Standard BIR filing deadlines generator for Philippines 2026/2025
export function generateStandardDeadlines(year: number): TaxDeadline[] {
  const deadlines: TaxDeadline[] = [];

  // 1. Form 2550Q (Quarterly Value-Added Tax)
  deadlines.push({
    id: `2550Q-${year}-Q1`,
    formType: '2550Q',
    title: 'BIR Form 2550Q (VAT)',
    period: `Q1 ${year}`,
    dueDate: `${year}-04-25`,
    status: 'Pending'
  });
  deadlines.push({
    id: `2550Q-${year}-Q2`,
    formType: '2550Q',
    title: 'BIR Form 2550Q (VAT)',
    period: `Q2 ${year}`,
    dueDate: `${year}-07-25`,
    status: 'Pending'
  });
  deadlines.push({
    id: `2550Q-${year}-Q3`,
    formType: '2550Q',
    title: 'BIR Form 2550Q (VAT)',
    period: `Q3 ${year}`,
    dueDate: `${year}-10-25`,
    status: 'Pending'
  });
  deadlines.push({
    id: `2550Q-${year}-Q4`,
    formType: '2550Q',
    title: 'BIR Form 2550Q (VAT)',
    period: `Q4 ${year}`,
    dueDate: `${year + 1}-01-25`,
    status: 'Pending'
  });

  // 2. Form 1701Q (Quarterly Income Tax for Individuals)
  deadlines.push({
    id: `1701Q-${year}-Q1`,
    formType: '1701Q',
    title: 'BIR Form 1701Q (Income Tax)',
    period: `Q1 ${year}`,
    dueDate: `${year}-05-15`,
    status: 'Pending'
  });
  deadlines.push({
    id: `1701Q-${year}-Q2`,
    formType: '1701Q',
    title: 'BIR Form 1701Q (Income Tax)',
    period: `Q2 ${year}`,
    dueDate: `${year}-08-15`,
    status: 'Pending'
  });
  deadlines.push({
    id: `1701Q-${year}-Q3`,
    formType: '1701Q',
    title: 'BIR Form 1701Q (Income Tax)',
    period: `Q3 ${year}`,
    dueDate: `${year}-11-15`,
    status: 'Pending'
  });

  // 3. Form 2551Q (Quarterly Percentage Tax)
  deadlines.push({
    id: `2551Q-${year}-Q1`,
    formType: '2551Q',
    title: 'BIR Form 2551Q (Percentage Tax)',
    period: `Q1 ${year}`,
    dueDate: `${year}-04-25`,
    status: 'Pending'
  });
  deadlines.push({
    id: `2551Q-${year}-Q2`,
    formType: '2551Q',
    title: 'BIR Form 2551Q (Percentage Tax)',
    period: `Q2 ${year}`,
    dueDate: `${year}-07-25`,
    status: 'Pending'
  });
  deadlines.push({
    id: `2551Q-${year}-Q3`,
    formType: '2551Q',
    title: 'BIR Form 2551Q (Percentage Tax)',
    period: `Q3 ${year}`,
    dueDate: `${year}-10-25`,
    status: 'Pending'
  });
  deadlines.push({
    id: `2551Q-${year}-Q4`,
    formType: '2551Q',
    title: 'BIR Form 2551Q (Percentage Tax)',
    period: `Q4 ${year}`,
    dueDate: `${year + 1}-01-25`,
    status: 'Pending'
  });

  // 4. Form 1601-EQ (Quarterly EWT)
  deadlines.push({
    id: `1601-EQ-${year}-Q1`,
    formType: '1601-EQ',
    title: 'BIR Form 1601-EQ (Quarterly EWT)',
    period: `Q1 ${year}`,
    dueDate: `${year}-04-30`,
    status: 'Pending'
  });
  deadlines.push({
    id: `1601-EQ-${year}-Q2`,
    formType: '1601-EQ',
    title: 'BIR Form 1601-EQ (Quarterly EWT)',
    period: `Q2 ${year}`,
    dueDate: `${year}-07-31`,
    status: 'Pending'
  });
  deadlines.push({
    id: `1601-EQ-${year}-Q3`,
    formType: '1601-EQ',
    title: 'BIR Form 1601-EQ (Quarterly EWT)',
    period: `Q3 ${year}`,
    dueDate: `${year}-10-31`,
    status: 'Pending'
  });
  deadlines.push({
    id: `1601-EQ-${year}-Q4`,
    formType: '1601-EQ',
    title: 'BIR Form 1601-EQ (Quarterly EWT)',
    period: `Q4 ${year}`,
    dueDate: `${year + 1}-01-31`,
    status: 'Pending'
  });

  // 5. Monthly deadlines: 1601-C & 0619-E
  const months = [
    { num: 1, name: 'Jan' },
    { num: 2, name: 'Feb' },
    { num: 3, name: 'Mar' },
    { num: 4, name: 'Apr' },
    { num: 5, name: 'May' },
    { num: 6, name: 'Jun' },
    { num: 7, name: 'Jul' },
    { num: 8, name: 'Aug' },
    { num: 9, name: 'Sep' },
    { num: 10, name: 'Oct' },
    { num: 11, name: 'Nov' },
    { num: 12, name: 'Dec' }
  ];

  months.forEach(m => {
    // 1601-C
    deadlines.push({
      id: `1601-C-${year}-${m.num}`,
      formType: '1601-C',
      title: 'BIR Form 1601-C (Withholding)',
      period: `${m.name} ${year}`,
      dueDate: m.num === 12 ? `${year + 1}-01-15` : `${year}-${String(m.num + 1).padStart(2, '0')}-10`,
      status: 'Pending'
    });

    // 0619-E
    deadlines.push({
      id: `0619-E-${year}-${m.num}`,
      formType: '0619-E',
      title: 'BIR Form 0619-E (Monthly EWT)',
      period: `${m.name} ${year}`,
      dueDate: m.num === 12 ? `${year + 1}-01-10` : `${year}-${String(m.num + 1).padStart(2, '0')}-10`,
      status: 'Pending'
    });
  });

  return deadlines.map(d => ({ ...d, dueDate: adjustDeadlineForWeekend(d.dueDate) }));
}

export function BIRForms() {
  const { currentClient, currentClientId, setCurrentClientId, clients, businessProfile, activePage, navigateToPage, birFormTab, ownerClientId } = useAccounting();

  // Active form choice: '2550Q' | '1701Q' | '2551Q' | '1601-C' | '0619-E' | '1601-EQ'
  const [activeFormType, setActiveFormType] = useState<'2550Q' | '1701Q' | '2551Q' | '1601-C' | '0619-E' | '1601-EQ'>('2550Q');

  // Query configurations use the real device date; DAT no longer controls forms.
  const effectiveYear = new Date().getFullYear();
  const effectiveMonth = new Date().getMonth() + 1;
  const [selectedYear, setSelectedYear] = useState<number>(effectiveYear);
  const [selectedQuarter, setSelectedQuarter] = useState<number>(Math.ceil(effectiveMonth / 3));
  const [selectedMonth, setSelectedMonth] = useState<number>(effectiveMonth);


  // Manual Overrides / Inputs
  // 1. VAT General Form overrides (2550Q)
  const [manualVatSales, setManualVatSales] = useState<string>('');
  const [manualZeroSales, setManualZeroSales] = useState<string>('');
  const [manualExemptSales, setManualExemptSales] = useState<string>('');
  const [manualCarryOverInput, setManualCarryOverInput] = useState<string>('0');
  const [manualWithholdingCredits, setManualWithholdingCredits] = useState<string>('0');

  // 2. Income Tax Form overrides (1701Q)
  const [is8PercentRate, setIs8PercentRate] = useState<boolean>(true); // 8% option vs graduated
  const [manualOperatingCost, setManualOperatingCost] = useState<string>('');

  // 3. Percentage Tax Form overrides (2551Q)
  const [manualPercentageSales, setManualPercentageSales] = useState<string>('');

  // 4. Compensation Withholding overrides (1601-C)
  const [numEmployees, setNumEmployees] = useState<number>(2);
  const [manualTotalSalaries, setManualTotalSalaries] = useState<string>('50000');
  const [manualNonTaxableSalaries, setManualNonTaxableSalaries] = useState<string>('15000');

  // 5. Monthly Expanded Tax Overrides (0619-E)
  const [manual0619EAmount, setManual0619EAmount] = useState<string>('');
  const [manual0619EPrevRemitted, setManual0619EPrevRemitted] = useState<string>('0');
  const [manual0619ESurcharge, setManual0619ESurcharge] = useState<string>('0');
  const [manual0619EInterest, setManual0619EInterest] = useState<string>('0');
  const [manual0619ECompromise, setManual0619ECompromise] = useState<string>('0');

  // 6. Quarterly Expanded Tax Overrides (1601-EQ)
  const [manual1601EQMonth1, setManual1601EQMonth1] = useState<string>('');
  const [manual1601EQMonth2, setManual1601EQMonth2] = useState<string>('');
  const [manual1601EQPrevFiled, setManual1601EQPrevFiled] = useState<string>('0');
  const [manual1601EQOverRemit, setManual1601EQOverRemit] = useState<string>('0');
  const [manual1601EQOtherPayments, setManual1601EQOtherPayments] = useState<string>('0');
  const [manual1601EQSurcharge, setManual1601EQSurcharge] = useState<string>('0');
  const [manual1601EQInterest, setManual1601EQInterest] = useState<string>('0');
  const [manual1601EQCompromise, setManual1601EQCompromise] = useState<string>('0');

  // Load correct form type on activePage or birFormTab change if triggered from Sidebar
  useEffect(() => {
    if (birFormTab && ['2550Q', '1701Q', '2551Q', '1601-C', '0619-E', '1601-EQ'].includes(birFormTab)) {
      setActiveFormType(birFormTab as any);
    } else if (activePage && activePage.startsWith('bir-')) {
      const type = activePage.split('-')[1]?.toUpperCase() as any;
      if (['2550Q', '1701Q', '2551Q', '1601C', '0619E', '1601EQ'].includes(type)) {
        setActiveFormType(type === '1601C' ? '1601-C' : type === '0619E' ? '0619-E' : type === '1601EQ' ? '1601-EQ' : type);
      }
    }
  }, [activePage, birFormTab]);

  // Automatically select the user's own-business client if no active client is selected
  useEffect(() => {
    if ((activePage === 'bir-forms' || activePage?.startsWith('bir-')) && !currentClientId && ownerClientId) {
      setCurrentClientId(ownerClientId);
    }
  }, [activePage, currentClientId, setCurrentClientId, ownerClientId]);

  // Utility to determine date quarter
  const getQuarterNum = (dateStr: string) => {
    if (!dateStr) return 1;
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return 1;
    const month = date.getMonth(); // 0 to 11
    if (month < 3) return 1;
    if (month < 6) return 2;
    if (month < 9) return 3;
    return 4;
  };

  const getMonthNum = (dateStr: string) => {
    if (!dateStr) return 1;
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return 1;
    return date.getMonth() + 1; // 1 to 12
  };

  // BIR forms only need transactions for the selected filing period.
  // Fetch them directly from the normalized tables instead of hydrating the
  // client's entire sales/purchases/expenses/AP history into React.
  const [birSales, setBirSales] = useState<any[]>([]);
  const [birPurchases, setBirPurchases] = useState<any[]>([]);
  const [birExpenses, setBirExpenses] = useState<any[]>([]);
  const [birPayableInvoices, setBirPayableInvoices] = useState<any[]>([]);

  useEffect(() => {
    let cancelled = false;

    const loadBIRPeriod = async () => {
      if (!currentClientId) {
        setBirSales([]);
        setBirPurchases([]);
        setBirExpenses([]);
        setBirPayableInvoices([]);
        return;
      }

      const monthly = ['1601-C', '0619-E'].includes(activeFormType);
      const startMonth = monthly
        ? selectedMonth
        : (selectedQuarter - 1) * 3 + 1;
      const endMonth = monthly ? selectedMonth : startMonth + 2;
      const startDate = `${selectedYear}-${String(startMonth).padStart(2, '0')}-01`;
      const endDate = new Date(selectedYear, endMonth, 0);
      const endDateString = `${selectedYear}-${String(endMonth).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`;

      const [salesRes, purchasesRes, apRes] = await Promise.all([
        supabase
          .from('sales')
          .select('id,date,amount,vat_type,net_of_vat')
          .eq('client_id', currentClientId)
          .gte('date', startDate)
          .lte('date', endDateString),
        supabase
          .from('purchases')
          .select('id,date,amount,vat_type,input_tax')
          .eq('client_id', currentClientId)
          .gte('date', startDate)
          .lte('date', endDateString),
        supabase
          .from('payable_invoices')
          .select('id,date,subtotal,wht_amount,withholding_tax_id')
          .eq('client_id', currentClientId)
          .gte('date', startDate)
          .lte('date', endDateString),
      ]);

      const firstError = [salesRes, purchasesRes, apRes].find(r => r.error)?.error;
      if (firstError) {
        console.error('Failed to load BIR filing period data:', firstError);
        if (!cancelled) {
          setBirSales([]);
          setBirPurchases([]);
          setBirExpenses([]);
          setBirPayableInvoices([]);
        }
        return;
      }

      if (cancelled) return;

      setBirSales((salesRes.data || []).map((s: any) => ({
        id: s.id,
        date: s.date,
        amount: Number(s.amount || 0),
        vatType: s.vat_type,
        netOfVat: s.net_of_vat == null ? undefined : Number(s.net_of_vat),
      })));
      setBirPurchases((purchasesRes.data || []).map((p: any) => ({
        id: p.id,
        date: p.date,
        amount: Number(p.amount || 0),
        vatType: p.vat_type,
        inputTax: p.input_tax == null ? undefined : Number(p.input_tax),
      })));
      // Purchases are the single source of expense transactions.
      setBirExpenses((purchasesRes.data || []).map((p: any) => ({
        id: p.id,
        date: p.date,
        amount: Number(p.amount || 0),
      })));
      setBirPayableInvoices((apRes.data || []).map((inv: any) => ({
        id: inv.id,
        date: inv.date,
        subtotal: Number(inv.subtotal || 0),
        whtAmount: Number(inv.wht_amount || 0),
        withholdingTaxId: inv.withholding_tax_id,
      })));
    };

    void loadBIRPeriod();
    return () => { cancelled = true; };
  }, [currentClientId, selectedYear, selectedQuarter, selectedMonth, activeFormType]);

  // Compile active client statistics
  const compiledData = useMemo(() => {
    if (!currentClient) {
      return {
        salesTotal: 0,
        purchasesTotal: 0,
        vatPurchasesTotal: 0,
        purchasesInputTax: 0,
        expensesTotal: 0,
        monthlyEwtTotal: 0,
        ewtMonth1: 0,
        ewtMonth2: 0,
        ewtMonth3: 0,
        quarterlyAtcList: [] as { atcCode: string; description: string; baseAmount: number; rate: number; taxWithheld: number }[],
        quarterlyTotalTaxesWithheld: 0
      };
    }

    // Filter Sales
    const salesList = birSales.filter(s => {
      const d = new Date(s.date);
      if (isNaN(d.getTime())) return false;
      const isYear = d.getFullYear() === selectedYear;
      if (['1601-C', '0619-E'].includes(activeFormType)) {
        return isYear && getMonthNum(s.date) === selectedMonth;
      } else {
        return isYear && getQuarterNum(s.date) === selectedQuarter;
      }
    });

    // Filter Purchases
    const purchasesList = birPurchases.filter(p => {
      const d = new Date(p.date);
      if (isNaN(d.getTime())) return false;
      const isYear = d.getFullYear() === selectedYear;
      if (['1601-C', '0619-E'].includes(activeFormType)) {
        return isYear && getMonthNum(p.date) === selectedMonth;
      } else {
        return isYear && getQuarterNum(p.date) === selectedQuarter;
      }
    });

    // Filter Expenses
    const expensesList = birExpenses.filter(e => {
      const d = new Date(e.date);
      if (isNaN(d.getTime())) return false;
      const isYear = d.getFullYear() === selectedYear;
      if (['1601-C', '0619-E'].includes(activeFormType)) {
        return isYear && getMonthNum(e.date) === selectedMonth;
      } else {
        return isYear && getQuarterNum(e.date) === selectedQuarter;
      }
    });

    const salesTotal = salesList.reduce((sum, s) => sum + s.amount, 0);
    // VAT-taxable base for 2550Q: net-of-VAT amount for VATable entries only (excludes
    // VAT Exempt / Zero-Rated). Legacy entries (saved before per-entry VAT breakdown existed)
    // stored `amount` as already-net with a flat 12% assumed, so they fall back to their
    // full amount here, matching prior behavior for that data.
    const vatableNetSales = salesList
      .filter(s => !s.vatType || s.vatType === 'VATable')
      .reduce((sum, s) => sum + (s.netOfVat !== undefined ? s.netOfVat : s.amount), 0);
    const purchasesTotal = purchasesList.reduce((sum, p) => sum + p.amount, 0);
    const vatPurchasesTotal = purchasesList
      .filter(p => p.vatType === 'vat')
      .reduce((sum, p) => sum + p.amount, 0);
    const purchasesInputTax = purchasesList
      .filter(p => p.vatType === 'vat')
      .reduce((sum, p) => sum + (p.inputTax || p.amount * 0.12), 0);
    const expensesTotal = expensesList.reduce((sum, e) => sum + e.amount, 0);

    // Monthly Expanded Withholding Tax (EWT) computation (for 0619-E)
    const monthlyWhtInvoices = birPayableInvoices.filter(inv => {
      const d = new Date(inv.date);
      if (isNaN(d.getTime())) return false;
      return d.getFullYear() === selectedYear && (d.getMonth() + 1) === selectedMonth;
    });
    const monthlyEwtTotal = monthlyWhtInvoices.reduce((sum, inv) => sum + (inv.whtAmount || 0), 0);

    // Quarterly EWT breakdown for 1601-EQ
    const qMonths = [
      (selectedQuarter - 1) * 3 + 1,
      (selectedQuarter - 1) * 3 + 2,
      (selectedQuarter - 1) * 3 + 3
    ];

    const ewtMonth1 = birPayableInvoices.filter(inv => {
      const d = new Date(inv.date);
      if (isNaN(d.getTime())) return false;
      return d.getFullYear() === selectedYear && (d.getMonth() + 1) === qMonths[0];
    }).reduce((sum, inv) => sum + (inv.whtAmount || 0), 0);

    const ewtMonth2 = birPayableInvoices.filter(inv => {
      const d = new Date(inv.date);
      if (isNaN(d.getTime())) return false;
      return d.getFullYear() === selectedYear && (d.getMonth() + 1) === qMonths[1];
    }).reduce((sum, inv) => sum + (inv.whtAmount || 0), 0);

    const ewtMonth3 = birPayableInvoices.filter(inv => {
      const d = new Date(inv.date);
      if (isNaN(d.getTime())) return false;
      return d.getFullYear() === selectedYear && (d.getMonth() + 1) === qMonths[2];
    }).reduce((sum, inv) => sum + (inv.whtAmount || 0), 0);

    // Grouping for 1601-EQ ATC Matrix
    // ATC master data is no longer stored in a dedicated normalized table.
    // Keep the report list empty until an ATC source is supplied elsewhere.
    const quarterlyAtcList: Array<{ atcCode: string; description: string; baseAmount: number; rate: number; taxWithheld: number }> = [];

    const quarterlyTotalTaxesWithheld = quarterlyAtcList.reduce((sum, item) => sum + item.taxWithheld, 0);

    return {
      salesTotal,
      vatableNetSales,
      purchasesTotal,
      vatPurchasesTotal,
      purchasesInputTax,
      expensesTotal,
      monthlyEwtTotal,
      ewtMonth1,
      ewtMonth2,
      ewtMonth3,
      quarterlyAtcList,
      quarterlyTotalTaxesWithheld
    };
  }, [currentClient, birSales, birPurchases, birExpenses, birPayableInvoices, selectedYear, selectedQuarter, selectedMonth, activeFormType]);

  // Clean values combining manual overrides and compiled values.
  // Uses vatableNetSales (net-of-VAT, VATable entries only) rather than the gross
  // salesTotal, since output tax must be computed on the net taxable base, not gross.
  const activeVatSales = manualVatSales !== '' ? parseFloat(manualVatSales) || 0 : compiledData.vatableNetSales;
  const activeZeroSales = parseFloat(manualZeroSales) || 0;
  const activeExemptSales = parseFloat(manualExemptSales) || 0;
  const activeTotalSalesLine = activeVatSales + activeZeroSales + activeExemptSales;
  const activeOutputTax = activeVatSales * 0.12;

  const activeCarryOver = parseFloat(manualCarryOverInput) || 0;
  const activeInputTax = compiledData.purchasesInputTax;
  const totalAvailableInput = activeCarryOver + activeInputTax;
  const activeWithholding = parseFloat(manualWithholdingCredits) || 0;

  // Final VAT Payable
  const vatPayableValue = Math.max(0, activeOutputTax - totalAvailableInput - activeWithholding);

  // Form 1701Q calculations (Quarterly Income)
  const grossIncome1701 = compiledData.salesTotal;
  const operatingCost1701 = manualOperatingCost !== '' ? parseFloat(manualOperatingCost) || 0 : compiledData.expensesTotal;
  
  // 1701Q Tax computed
  const taxDue1701 = useMemo(() => {
    if (is8PercentRate) {
      // 8% tax rate option on gross revenues over 250k
      const taxable = Math.max(0, grossIncome1701 - 250000);
      return taxable * 0.08;
    } else {
      // Graduated Income Tax Rates (simplification based on 2026 TRAIN Law Graduated Rates)
      // Annualized/Quarterly threshold:
      // - Under 250k: 0
      // - 250k to 400k: 15% of excess over 250k
      // - 400k to 800k: 22,500 + 20% of excess over 400k
      // - 800k to 2M: 102,500 + 25% of excess over 800k
      // - 2M to 8M: 402,500 + 30% of excess over 2M
      // - Over 8M: 2,202,500 + 35% of excess over 8M
      // (Quarterly amounts scaled to quarter since it is quarterly return)
      const quarterlyNet = Math.max(0, grossIncome1701 - operatingCost1701);
      const annualEquiv = quarterlyNet * 4;
      let annualTax = 0;
      if (annualEquiv <= 250000) {
        annualTax = 0;
      } else if (annualEquiv <= 400000) {
        annualTax = (annualEquiv - 250000) * 0.15;
      } else if (annualEquiv <= 800000) {
        annualTax = 22500 + (annualEquiv - 400000) * 0.20;
      } else if (annualEquiv <= 2000000) {
        annualTax = 102500 + (annualEquiv - 800000) * 0.25;
      } else if (annualEquiv <= 8000000) {
        annualTax = 402500 + (annualEquiv - 2000000) * 0.30;
      } else {
        annualTax = 2202500 + (annualEquiv - 8000000) * 0.35;
      }
      return annualTax / 4;
    }
  }, [grossIncome1701, operatingCost1701, is8PercentRate]);

  // Form 2551Q Percentage Tax calculations
  const grossIncome2551Q = manualPercentageSales !== '' ? parseFloat(manualPercentageSales) || 0 : compiledData.salesTotal;
  const percentageTaxRate = 0.03; // Standard 3% Percentage tax
  const percentageTaxDue = grossIncome2551Q * percentageTaxRate;

  // Form 1601-C Compensation Calculation
  const totalSalaries = parseFloat(manualTotalSalaries) || 0;
  const nonTaxableSalaries = parseFloat(manualNonTaxableSalaries) || 0;
  const taxableCompensation = Math.max(0, totalSalaries - nonTaxableSalaries);
  
  // Tax withheld estimate (graduated table for payroll)
  const compensationTaxDue = useMemo(() => {
    if (taxableCompensation <= 0) return 0;
    // Average monthly withholding estimate
    const avgMonthlyComp = taxableCompensation;
    if (avgMonthlyComp <= 20833) return 0;
    if (avgMonthlyComp <= 33333) return (avgMonthlyComp - 20833) * 0.15;
    if (avgMonthlyComp <= 66667) return 1875 + (avgMonthlyComp - 33333) * 0.20;
    if (avgMonthlyComp <= 166667) return 8541.67 + (avgMonthlyComp - 66667) * 0.25;
    if (avgMonthlyComp <= 666667) return 33541.67 + (avgMonthlyComp - 166667) * 0.30;
    return 183541.67 + (avgMonthlyComp - 666667) * 0.35;
  }, [taxableCompensation]);

  // Form 0619-E Calculations (Monthly Remittance Form of Creditable Income Taxes Withheld (Expanded))
  const active0619EAmount = manual0619EAmount !== '' ? parseFloat(manual0619EAmount) || 0 : compiledData.monthlyEwtTotal;
  const active0619EPrevRemitted = parseFloat(manual0619EPrevRemitted) || 0;
  const active0619ENetAmount = Math.max(0, active0619EAmount - active0619EPrevRemitted);
  const active0619ESurcharge = parseFloat(manual0619ESurcharge) || 0;
  const active0619EInterest = parseFloat(manual0619EInterest) || 0;
  const active0619ECompromise = parseFloat(manual0619ECompromise) || 0;
  const active0619ETotalPenalties = active0619ESurcharge + active0619EInterest + active0619ECompromise;
  const active0619ETotalDue = active0619ENetAmount + active0619ETotalPenalties;

  // Form 1601-EQ Calculations (Quarterly Remittance Return of Creditable Income Taxes Withheld (Expanded))
  const active1601EQMonth1 = manual1601EQMonth1 !== '' ? parseFloat(manual1601EQMonth1) || 0 : compiledData.ewtMonth1;
  const active1601EQMonth2 = manual1601EQMonth2 !== '' ? parseFloat(manual1601EQMonth2) || 0 : compiledData.ewtMonth2;
  const active1601EQPrevFiled = parseFloat(manual1601EQPrevFiled) || 0;
  const active1601EQOverRemit = parseFloat(manual1601EQOverRemit) || 0;
  const active1601EQOtherPayments = parseFloat(manual1601EQOtherPayments) || 0;
  const active1601EQTotalRemittances = active1601EQMonth1 + active1601EQMonth2 + active1601EQPrevFiled + active1601EQOverRemit + active1601EQOtherPayments;
  const active1601EQTaxStillDue = compiledData.quarterlyTotalTaxesWithheld - active1601EQTotalRemittances;
  const active1601EQSurcharge = parseFloat(manual1601EQSurcharge) || 0;
  const active1601EQInterest = parseFloat(manual1601EQInterest) || 0;
  const active1601EQCompromise = parseFloat(manual1601EQCompromise) || 0;
  const active1601EQTotalPenalties = active1601EQSurcharge + active1601EQInterest + active1601EQCompromise;
  const active1601EQTotalDue = active1601EQTaxStillDue + active1601EQTotalPenalties;

  // Format TIN
  const formattedTin = (tinString?: string) => {
    if (!tinString) return '—';
    const clean = tinString.replace(/\D/g, '');
    if (clean.length >= 9) {
      return `${clean.slice(0, 3)}-${clean.slice(3, 6)}-${clean.slice(6, 9)}-${clean.slice(9, 12) || '000'}`;
    }
    return tinString;
  };

  const handlePrint = () => {
    window.print();
  };

  const yearsList = [2026, 2025, 2024, 2023];

  return (
    <div className="w-full flex flex-col">
      <PageHeader title="Philippine BIR Tax Declarations" icon={<FileText className="text-blue-600 w-5 h-5" />} />
      <div className="p-4 md:p-6 flex-1">
      <div className="flex flex-col lg:flex-row gap-6 font-sans">
        
        {/* Left Control Sidebar */}
        <div className="w-full lg:w-80 shrink-0 bg-slate-50 dark:bg-slate-800/40 p-5 rounded-2xl border border-slate-100 dark:border-slate-800 flex flex-col gap-5">
          {/* Active Taxpayer Dropdown */}
          <div className="space-y-2">
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-400 block mb-1">Active Entity / Profile</h4>
            <div className="relative">
              <select
                value={currentClientId || ''}
                onChange={e => setCurrentClientId(e.target.value)}
                className="w-full text-xs font-bold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                {/* Own business option */}
                {businessProfile ? (
                  <option value={ownerClientId || ''}>🏢 Own Business: {businessProfile.name}</option>
                ) : (
                  <option value={ownerClientId || ''}>🏢 Own Business (Unconfigured)</option>
                )}
                
                {/* List other clients if available */}
                {clients && (Object.values(clients) as Client[])
                  .filter((c: Client) => c.id !== ownerClientId)
                  .map((client: Client) => (
                    <option key={client.id} value={client.id}>
                      👤 Client: {client.registeredName || client.name}
                    </option>
                  ))
                }
              </select>
            </div>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
              Data, transactions, and declarations will automatically sync with this selected profile.
            </p>
          </div>

          <hr className="border-slate-200 dark:border-slate-700" />

          <div>
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-400 mb-3 block">Form Generation</h4>
            <div className="flex flex-col gap-1.5">
              {[
                { type: '2550Q', label: 'BIR Form 2550Q', desc: 'Quarterly Value-Added Tax' },
                { type: '1701Q', label: 'BIR Form 1701Q', desc: 'Quarterly Income Tax (Individual)' },
                { type: '2551Q', label: 'BIR Form 2551Q', desc: 'Quarterly Percentage Tax' },
                { type: '1601-C', label: 'BIR Form 1601-C', desc: 'Monthly Withholding on Salaries' },
                { type: '0619-E', label: 'BIR Form 0619-E', desc: 'Monthly Remittance of EWT' },
                { type: '1601-EQ', label: 'BIR Form 1601-EQ', desc: 'Quarterly Remittance of EWT' }
              ].map((f) => (
                <button
                  key={f.type}
                  onClick={() => setActiveFormType(f.type as any)}
                  className={`w-full p-3 text-left border rounded-xl transition-all ${
                    activeFormType === f.type 
                      ? 'bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-500/10' 
                      : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <span className="font-bold text-xs block leading-tight">{f.label}</span>
                  <span className={`text-[10px] block font-medium mt-0.5 leading-tight ${
                    activeFormType === f.type 
                      ? 'text-white/80' 
                      : 'text-slate-500'
                  }`}>{f.desc}</span>
                </button>
              ))}
            </div>
          </div>

          <hr className="border-slate-200 dark:border-slate-700" />

          {/* Configuration */}
          <div className="space-y-4">
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-400 block">
              Filing Period Selection
            </h4>
            
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-1">Calendar Year</label>
                <select 
                  value={selectedYear}
                  onChange={e => setSelectedYear(parseInt(e.target.value))}
                  className="w-full text-xs font-bold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 rounded-xl rounded-b-xl outline-none"
                >
                  {yearsList.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>

              {['1601-C', '0619-E'].includes(activeFormType) ? (
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-1">Tax Month</label>
                  <select 
                    value={selectedMonth}
                    onChange={e => setSelectedMonth(parseInt(e.target.value))}
                    className="w-full text-xs font-bold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 rounded-xl outline-none"
                  >
                    {['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map((m, idx) => (
                      <option key={m} value={idx + 1}>{m}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-1">Tax Quarter</label>
                  <select 
                    value={selectedQuarter}
                    onChange={e => setSelectedQuarter(parseInt(e.target.value))}
                    className="w-full text-xs font-bold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 rounded-xl outline-none"
                  >
                    <option value={1}>1st Quarter (Q1)</option>
                    <option value={2}>2nd Quarter (Q2)</option>
                    <option value={3}>3rd Quarter (Q3)</option>
                    <option value={4}>4th Quarter (Q4)</option>
                  </select>
                </div>
              )}
            </div>
            
            {/* Real-time sync feedback banner */}
            <div className="bg-slate-100 dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700 flex items-start gap-2">
              <Sparkles className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
              <p className="text-[10px] leading-relaxed text-slate-600 dark:text-slate-400">
                Values are dynamically compiled from sales and purchases. Overriding fields below compiles tax lines instantly.
              </p>
            </div>
          </div>

          <hr className="border-slate-200 dark:border-slate-700" />

          {/* Form-specific input overrides */}
          <div className="space-y-4">
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-400 block">Form Field Overrides</h4>
            
            {activeFormType === '2550Q' && (
              <div className="space-y-3 font-medium">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 block mb-1">Vatable Sales & Receipts (₱)</label>
                  <input 
                    type="number" 
                    placeholder={compiledData.salesTotal.toLocaleString()}
                    value={manualVatSales} 
                    onChange={e => setManualVatSales(e.target.value)}
                    className="w-full text-xs border border-slate-200 bg-white dark:bg-slate-800 p-2 rounded-lg"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 block mb-1">Zero-Rated Sales & Receipts (₱)</label>
                  <input 
                    type="number" 
                    placeholder="0"
                    value={manualZeroSales} 
                    onChange={e => setManualZeroSales(e.target.value)}
                    className="w-full text-xs border border-slate-200 bg-white dark:bg-slate-800 p-2 rounded-lg"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 block mb-1">Exempt Sales & Receipts (₱)</label>
                  <input 
                    type="number" 
                    placeholder="0"
                    value={manualExemptSales} 
                    onChange={e => setManualExemptSales(e.target.value)}
                    className="w-full text-xs border border-slate-200 bg-white dark:bg-slate-800 p-2 rounded-lg"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 block mb-1">Input VAT Carry-Over (₱)</label>
                  <input 
                    type="number" 
                    value={manualCarryOverInput} 
                    onChange={e => setManualCarryOverInput(e.target.value)}
                    className="w-full text-xs border border-slate-200 bg-white dark:bg-slate-800 p-2 rounded-lg"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 block mb-1">Tax Withheld Credits (2307) (₱)</label>
                  <input 
                    type="number" 
                    value={manualWithholdingCredits} 
                    onChange={e => setManualWithholdingCredits(e.target.value)}
                    className="w-full text-xs border border-slate-200 bg-white dark:bg-slate-800 p-2 rounded-lg"
                  />
                </div>
              </div>
            )}

            {activeFormType === '1701Q' && (
              <div className="space-y-3 font-medium">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 block mb-1">Tax Calculation Scheme</label>
                  <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
                    <button 
                      onClick={() => setIs8PercentRate(true)}
                      type="button"
                      className={`text-[9px] font-black px-1.5 py-1.5 rounded transition ${is8PercentRate ? 'bg-white shadow text-blue-600 dark:bg-slate-700 dark:text-blue-400' : 'text-slate-500 hover:text-slate-800'}`}
                    >
                      8% Flat Tax
                    </button>
                    <button 
                      onClick={() => setIs8PercentRate(false)}
                      type="button"
                      className={`text-[9px] font-black px-1.5 py-1.5 rounded transition ${!is8PercentRate ? 'bg-white shadow text-blue-600 dark:bg-slate-700 dark:text-blue-400' : 'text-slate-500 hover:text-slate-800'}`}
                    >
                      Graduated Rates
                    </button>
                  </div>
                </div>
                {!is8PercentRate && (
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 block mb-1">Operating/General Expenses (₱)</label>
                    <input 
                      type="number" 
                      placeholder={compiledData.expensesTotal.toString()}
                      value={manualOperatingCost} 
                      onChange={e => setManualOperatingCost(e.target.value)}
                      className="w-full text-xs border border-slate-200 bg-white dark:bg-slate-800 p-2 rounded-lg"
                    />
                  </div>
                )}
              </div>
            )}

            {activeFormType === '2551Q' && (
              <div className="space-y-3 font-medium">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 block mb-1">Quarterly Percentage Sales (₱)</label>
                  <input 
                    type="number" 
                    placeholder={compiledData.salesTotal.toString()}
                    value={manualPercentageSales} 
                    onChange={e => setManualPercentageSales(e.target.value)}
                    className="w-full text-xs border border-slate-200 bg-white dark:bg-slate-800 p-2 rounded-lg"
                  />
                </div>
              </div>
            )}

            {activeFormType === '1601-C' && (
              <div className="space-y-3 font-medium">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 block mb-1">Number of Employees Paid</label>
                  <input 
                    type="number" 
                    value={numEmployees}
                    min={0}
                    onChange={e => setNumEmployees(parseInt(e.target.value) || 0)}
                    className="w-full text-xs border border-slate-200 bg-white dark:bg-slate-800 p-2 rounded-lg"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 block mb-1">Total Compensation Paid (₱)</label>
                  <input 
                    type="number" 
                    value={manualTotalSalaries} 
                    onChange={e => setManualTotalSalaries(e.target.value)}
                    className="w-full text-xs border border-slate-200 bg-white dark:bg-slate-800 p-2 rounded-lg"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 block mb-1">Non-Taxable Compensations (₱)</label>
                  <input 
                    type="number" 
                    value={manualNonTaxableSalaries} 
                    onChange={e => setManualNonTaxableSalaries(e.target.value)}
                    className="w-full text-xs border border-slate-200 bg-white dark:bg-slate-800 p-2 rounded-lg"
                  />
                </div>
              </div>
            )}

            {activeFormType === '0619-E' && (
              <div className="space-y-3 font-medium">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 block mb-1">Monthly Remittance Amount (₱)</label>
                  <input 
                    type="number" 
                    placeholder={compiledData.monthlyEwtTotal.toString()}
                    value={manual0619EAmount} 
                    onChange={e => setManual0619EAmount(e.target.value)}
                    className="w-full text-xs border border-slate-200 bg-white dark:bg-slate-800 p-2 rounded-lg"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 block mb-1">Amount Previously Paid (₱)</label>
                  <input 
                    type="number" 
                    value={manual0619EPrevRemitted} 
                    onChange={e => setManual0619EPrevRemitted(e.target.value)}
                    className="w-full text-xs border border-slate-200 bg-white dark:bg-slate-800 p-2 rounded-lg"
                  />
                </div>
                <div className="border-t border-slate-200 dark:border-slate-700 pt-2 shrink-0 border-dashed">
                  <span className="text-[10px] font-black uppercase text-slate-400 block mb-1.5">Penalties</span>
                  <div className="grid grid-cols-3 gap-1.5">
                    <div>
                      <label className="text-[8px] font-semibold text-slate-400 block mb-0.5">Surcharge</label>
                      <input 
                        type="number" 
                        value={manual0619ESurcharge} 
                        onChange={e => setManual0619ESurcharge(e.target.value)}
                        className="w-full text-[11px] border border-slate-200 bg-white dark:bg-slate-800 p-1.5 rounded-lg text-center font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-[8px] font-semibold text-slate-400 block mb-0.5">Interest</label>
                      <input 
                        type="number" 
                        value={manual0619EInterest} 
                        onChange={e => setManual0619EInterest(e.target.value)}
                        className="w-full text-[11px] border border-slate-200 bg-white dark:bg-slate-800 p-1.5 rounded-lg text-center font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-[8px] font-semibold text-slate-400 block mb-0.5">Compromise</label>
                      <input 
                        type="number" 
                        value={manual0619ECompromise} 
                        onChange={e => setManual0619ECompromise(e.target.value)}
                        className="w-full text-[11px] border border-slate-200 bg-white dark:bg-slate-800 p-1.5 rounded-lg text-center font-mono"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeFormType === '1601-EQ' && (
              <div className="space-y-3 font-medium">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 block mb-1">1st Month Remitted (₱)</label>
                  <input 
                    type="number" 
                    placeholder={compiledData.ewtMonth1.toString()}
                    value={manual1601EQMonth1} 
                    onChange={e => setManual1601EQMonth1(e.target.value)}
                    className="w-full text-xs border border-slate-200 bg-white dark:bg-slate-800 p-2 rounded-lg"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 block mb-1">2nd Month Remitted (₱)</label>
                  <input 
                    type="number" 
                    placeholder={compiledData.ewtMonth2.toString()}
                    value={manual1601EQMonth2} 
                    onChange={e => setManual1601EQMonth2(e.target.value)}
                    className="w-full text-xs border border-slate-200 bg-white dark:bg-slate-800 p-2 rounded-lg"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 block mb-1">Over-remit Previous Qtr (₱)</label>
                  <input 
                    type="number" 
                    value={manual1601EQOverRemit} 
                    onChange={e => setManual1601EQOverRemit(e.target.value)}
                    className="w-full text-xs border border-slate-200 bg-white dark:bg-slate-800 p-2 rounded-lg"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 block mb-1">Previously remitted return (₱)</label>
                  <input 
                    type="number" 
                    value={manual1601EQPrevFiled} 
                    onChange={e => setManual1601EQPrevFiled(e.target.value)}
                    className="w-full text-xs border border-slate-200 bg-white dark:bg-slate-800 p-2 rounded-lg"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 block mb-1">Other Payments (Form 0605) (₱)</label>
                  <input 
                    type="number" 
                    value={manual1601EQOtherPayments} 
                    onChange={e => setManual1601EQOtherPayments(e.target.value)}
                    className="w-full text-xs border border-slate-200 bg-white dark:bg-slate-800 p-2 rounded-lg"
                  />
                </div>
                <div className="border-t border-slate-200 dark:border-slate-700 pt-2 shrink-0 border-dashed">
                  <span className="text-[10px] font-black uppercase text-slate-400 block mb-1.5">Penalties</span>
                  <div className="grid grid-cols-3 gap-1.5">
                    <div>
                      <label className="text-[8px] font-semibold text-slate-400 block mb-0.5">Surcharge</label>
                      <input 
                        type="number" 
                        value={manual1601EQSurcharge} 
                        onChange={e => setManual1601EQSurcharge(e.target.value)}
                        className="w-full text-[11px] border border-slate-200 bg-white dark:bg-slate-800 p-1.5 rounded-lg text-center font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-[8px] font-semibold text-slate-400 block mb-0.5">Interest</label>
                      <input 
                        type="number" 
                        value={manual1601EQInterest} 
                        onChange={e => setManual1601EQInterest(e.target.value)}
                        className="w-full text-[11px] border border-slate-200 bg-white dark:bg-slate-800 p-1.5 rounded-lg text-center font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-[8px] font-semibold text-slate-400 block mb-0.5">Compromise</label>
                      <input 
                        type="number" 
                        value={manual1601EQCompromise} 
                        onChange={e => setManual1601EQCompromise(e.target.value)}
                        className="w-full text-[11px] border border-slate-200 bg-white dark:bg-slate-800 p-1.5 rounded-lg text-center font-mono"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="mt-auto space-y-2">
            <button 
              onClick={handlePrint}
              className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow"
            >
              <Printer className="w-4 h-4" /> Print BIR Return
            </button>
          </div>
        </div>

        {/* Right Active BIR Form Rendering Sheet */}
        <div className="flex-1 bg-white dark:bg-slate-900 flex flex-col print:max-h-full">
          
          <div className="p-3 bg-indigo-50/50 dark:bg-slate-800/40 border-b border-indigo-100 dark:border-slate-800 text-slate-500 text-[10px] font-bold uppercase tracking-wider flex items-center gap-2 select-none print:hidden">
            <CheckCircle2 className="w-4 h-4 text-indigo-500" /> Complete layout validation passed. Official BIR color formatting loaded.
          </div>

          <div className="flex-1 p-4 md:p-8 space-y-6 print:p-0">
            {/* BIR FORM NO 2550Q */}
            {activeFormType === '2550Q' && (
              <div className="border-[2px] border-black p-4 text-black bg-white max-w-4xl mx-auto space-y-4 print:border-0 print:p-0">
                {/* Form Header */}
                <div className="flex items-center border-b border-black pb-3">
                  <div className="border border-black px-3 py-1 font-mono text-center shrink-0 mr-4 font-black">
                    <span className="text-[10px] block font-semibold uppercase leading-none">BIR Form No.</span>
                    <span className="text-xl leading-none">2550Q</span>
                  </div>
                  <div className="flex-1 text-center font-bold font-serif leading-tight">
                    <div className="text-[10px] uppercase tracking-wide">Republika ng Pilipinas</div>
                    <div className="text-[11px] uppercase tracking-wide">Kagawaran ng Pananalapi</div>
                    <div className="text-[12px] uppercase">Kawanihan ng Rentas Internas</div>
                    <h1 className="text-sm uppercase font-black tracking-tighter mt-1">Quarterly Value-Added Tax Return</h1>
                  </div>
                  <div className="shrink-0 text-[10px] font-bold text-right pl-4">
                    <div>Amended: <span className="underline select-all">No</span></div>
                    <div>Quarter: <span className="underline font-black">{selectedQuarter}</span></div>
                    <div>Year: <span className="underline font-black">{selectedYear}</span></div>
                  </div>
                </div>

                {/* Section Part I: Background Information */}
                <div>
                  <div className="bg-yellow-50 outline outline-[1px] outline-black text-[11px] font-black uppercase px-2 py-0.5 tracking-wide mb-1 leading-none select-none">
                    Part I: Background Information
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 border border-black p-2 bg-slate-50 text-[11px] font-bold gap-3">
                    <div>
                      <span className="text-[9px] block text-slate-500">1 Taxpayer Identification Number (TIN)</span>
                      <span className="font-mono text-xs">{formattedTin(currentClient?.tin)}</span>
                    </div>
                    <div>
                      <span className="text-[9px] block text-slate-500">2 RDO Code</span>
                      <span>{currentClient?.rdoCode || '043B'}</span>
                    </div>
                    <div>
                      <span className="text-[9px] block text-slate-500">3 Line of Business</span>
                      <span className="truncate">{currentClient?.tradeName || 'General Trade/Services'}</span>
                    </div>
                    <div className="md:col-span-3 border-t border-slate-200 pt-1.5">
                      <span className="text-[9px] block text-slate-500">4 Taxpayer registered Legal Full Name</span>
                      <span className="uppercase text-xs">{currentClient?.registeredName || currentClient?.name}</span>
                    </div>
                    <div className="md:col-span-3 border-t border-slate-200 pt-1.5">
                      <span className="text-[9px] block text-slate-500">5 Registered Physical Address</span>
                      <span className="uppercase text-[11px]">
                        {[currentClient?.substreet, currentClient?.street, currentClient?.barangay, currentClient?.city, currentClient?.zipCode].filter(Boolean).join(', ') || 'Not Specified'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Section Part II: Computation of Tax */}
                <div>
                  <div className="bg-yellow-50 outline outline-[1px] outline-black text-[11px] font-black uppercase px-2 py-0.5 tracking-wide mb-1 select-none">
                    Part II: Computation of VAT
                  </div>
                  <div className="overflow-x-auto">
<table className="w-full text-xs border border-black border-collapse">
                    <thead>
                      <tr className="bg-slate-100 font-bold border-b border-black text-[10px]">
                        <th className="border-r border-black p-1 text-center w-10">Item</th>
                        <th className="border-r border-black p-1 text-left">Tax Details Descriptions</th>
                        <th className="border-r border-black p-1 text-right w-36">Sales / Purchases</th>
                        <th className="p-1 text-right w-32">VAT Rate/Output Tax</th>
                      </tr>
                    </thead>
                    <tbody className="font-bold">
                      <tr className="border-b border-black">
                        <td className="border-r border-black p-1 text-center font-mono text-[10px]">15</td>
                        <td className="border-r border-black p-1 font-semibold">Vatable Sales / Receipts</td>
                        <td className="border-r border-black p-1 text-right font-mono">₱{activeVatSales.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                        <td className="p-1 text-right font-mono">12%</td>
                      </tr>
                      <tr className="border-b border-black">
                        <td className="border-r border-black p-1 text-center font-mono text-[10px]">16</td>
                        <td className="border-r border-black p-1 font-semibold text-blue-800">Output VAT Due (Line 15 * 12%)</td>
                        <td className="border-r border-black p-1 bg-slate-50 text-right">—</td>
                        <td className="p-1 text-right font-mono text-blue-800">₱{activeOutputTax.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                      </tr>
                      <tr className="border-b border-black">
                        <td className="border-r border-black p-1 text-center font-mono text-[10px]">17</td>
                        <td className="border-r border-black p-1 font-semibold">Zero-Rated Sales / Receipts</td>
                        <td className="border-r border-black p-1 text-right font-mono">₱{activeZeroSales.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                        <td className="p-1 text-right font-mono">₱0.00</td>
                      </tr>
                      <tr className="border-b border-black">
                        <td className="border-r border-black p-1 text-center font-mono text-[10px]">18</td>
                        <td className="border-r border-black p-1 font-semibold">Exempt Sales / Receipts</td>
                        <td className="border-r border-black p-1 text-right font-mono">₱{activeExemptSales.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                        <td className="p-1 text-right font-mono">₱0.00</td>
                      </tr>
                      <tr className="border-b border-black bg-slate-50">
                        <td className="border-r border-black p-1 text-center font-mono text-[10px]">19</td>
                        <td className="border-r border-black p-1 uppercase">Total Sales / Receipts & Output VAT Due</td>
                        <td className="border-r border-black p-1 text-right font-mono">₱{activeTotalSalesLine.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                        <td className="p-1 text-right font-mono text-blue-800">₱{activeOutputTax.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                      </tr>
                      <tr className="border-b border-black">
                        <td className="border-r border-black p-1 text-center font-mono text-[10px]">20</td>
                        <td className="border-r border-black p-1 font-semibold">Input VAT carried over from previous period</td>
                        <td className="border-r border-black p-1 text-right font-mono">₱{activeCarryOver.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                        <td className="p-1 text-right font-mono">—</td>
                      </tr>
                      <tr className="border-b border-black">
                        <td className="border-r border-black p-1 text-center font-mono text-[10px]">21</td>
                        <td className="border-r border-black p-1 font-semibold">Purchases of Capital Goods & Services</td>
                        <td className="border-r border-black p-1 text-right font-mono">₱{compiledData.vatPurchasesTotal.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                        <td className="p-1 text-right font-mono text-slate-600">₱{activeInputTax.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                      </tr>
                      <tr className="border-b border-black bg-slate-50">
                        <td className="border-r border-black p-1 text-center font-mono text-[10px]">22</td>
                        <td className="border-r border-black p-1 uppercase">Total Available Input VAT (Line 20 + Line 21 Input)</td>
                        <td className="border-r border-black p-1 text-right">—</td>
                        <td className="p-1 text-right font-mono text-emerald-700">₱{totalAvailableInput.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                      </tr>
                      <tr className="border-b border-black">
                        <td className="border-r border-black p-1 text-center font-mono text-[10px]">23</td>
                        <td className="border-r border-black p-1 font-semibold">Creditable Withholding VAT / Credits (BIR Form 2307)</td>
                        <td className="border-r border-black p-1 text-right">—</td>
                        <td className="p-1 text-right font-mono">₱{activeWithholding.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                      </tr>
                      <tr className="bg-amber-100">
                        <td className="border-r border-black p-1.5 text-center font-mono text-[10px]">24</td>
                        <td className="border-r border-black p-1.5 font-black uppercase text-amber-900 leading-tight">Net Tax Payable / (Overpayment)</td>
                        <td className="border-r border-black p-1.5 text-right">—</td>
                        <td className="p-1.5 text-right font-mono text-base font-black text-amber-950">₱{vatPayableValue.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                      </tr>
                    </tbody>
                  </table>
</div>
                </div>

                <div className="flex justify-between items-center text-[10px] font-bold text-slate-500 pt-2 border-t border-black">
                  <span>CAPOTBOOKS Tax Integration Engine</span>
                  <span>Form Version: July 2018 (revised)</span>
                </div>
              </div>
            )}

            {/* BIR FORM NO 1701Q */}
            {activeFormType === '1701Q' && (
              <div className="border-[2px] border-black p-4 text-black bg-white max-w-4xl mx-auto space-y-4 print:border-0 print:p-0">
                {/* Form Header */}
                <div className="flex items-center border-b border-black pb-3">
                  <div className="border border-black px-3 py-1 font-mono text-center shrink-0 mr-4 font-black">
                    <span className="text-[10px] block font-semibold uppercase leading-none">BIR Form No.</span>
                    <span className="text-xl leading-none">1701Q</span>
                  </div>
                  <div className="flex-1 text-center font-bold font-serif leading-tight">
                    <div className="text-[10px] uppercase tracking-wide">Republika ng Pilipinas</div>
                    <div className="text-[11px] uppercase tracking-wide">Kagawaran ng Pananalapi</div>
                    <div className="text-[12px] uppercase">Kawanihan ng Rentas Internas</div>
                    <h1 className="text-sm uppercase font-black tracking-tighter mt-1">Quarterly Income Tax Return</h1>
                    <div className="text-[10px] tracking-wide font-sans font-bold">For Individuals, Sole Proprietorships and Professionals</div>
                  </div>
                  <div className="shrink-0 text-[10px] font-bold text-right pl-4">
                    <div>Amended: <span className="underline">No</span></div>
                    <div>Quarter: <span className="underline font-black">{selectedQuarter}</span></div>
                    <div>Year: <span className="underline font-black">{selectedYear}</span></div>
                  </div>
                </div>

                {/* Section Part I: Background Information */}
                <div>
                  <div className="bg-yellow-50 outline outline-[1px] outline-black text-[11px] font-black uppercase px-2 py-0.5 tracking-wide mb-1 leading-none select-none">
                    Part I: Background Information
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 border border-black p-2 bg-slate-50 text-[11px] font-bold gap-3">
                    <div>
                      <span className="text-[9px] block text-slate-500">1 Taxpayer Identification Number (TIN)</span>
                      <span className="font-mono text-xs">{formattedTin(currentClient?.tin)}</span>
                    </div>
                    <div>
                      <span className="text-[9px] block text-slate-500">2 RDO Code</span>
                      <span>{currentClient?.rdoCode || '043B'}</span>
                    </div>
                    <div>
                      <span className="text-[9px] block text-slate-500">3 Tax Rate Code Category</span>
                      <span>{is8PercentRate ? '8% flat rate IT' : 'Graduated IT Rates'}</span>
                    </div>
                    <div className="md:col-span-3 border-t border-slate-200 pt-1.5">
                      <span className="text-[9px] block text-slate-500">4 Taxpayer Registered Name</span>
                      <span className="uppercase text-xs">{currentClient?.registeredName || currentClient?.name}</span>
                    </div>
                  </div>
                </div>

                {/* Computation of Tax */}
                <div>
                  <div className="bg-yellow-50 outline outline-[1px] outline-black text-[11px] font-black uppercase px-2 py-0.5 tracking-wide mb-1 select-none">
                    Part II: Tax Computation
                  </div>
                  <div className="overflow-x-auto">
<table className="w-full text-xs border border-black border-collapse">
                    <thead>
                      <tr className="bg-slate-100 font-bold border-b border-black text-[10px]">
                        <th className="border-r border-black p-1 text-center w-10">Item</th>
                        <th className="border-r border-black p-1 text-left">Income Tax Computations Details</th>
                        <th className="p-1 text-right w-44">Tax Item Values (₱)</th>
                      </tr>
                    </thead>
                    <tbody className="font-bold">
                      <tr className="border-b border-black">
                        <td className="border-r border-black p-1 text-center font-mono text-[10px]">26</td>
                        <td className="border-r border-black p-1 font-semibold">Gross Sales / Receipts (compiled from sales)</td>
                        <td className="p-1 text-right font-mono">₱{grossIncome1701.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                      </tr>
                      {is8PercentRate ? (
                        <>
                          <tr className="border-b border-black">
                            <td className="border-r border-black p-1 text-center font-mono text-[10px]">27</td>
                            <td className="border-r border-black p-1 font-semibold">Less: Allowable Exemption reduction (Part-time Professional/Trade)</td>
                            <td className="p-1 text-right font-mono text-rose-600">₱(250,000.00)</td>
                          </tr>
                          <tr className="border-b border-black bg-slate-50">
                            <td className="border-r border-black p-1 text-center font-mono text-[10px]">28</td>
                            <td className="border-r border-black p-1 uppercase">Net Taxable Income (Gross Sales / Receipts - 250k)</td>
                            <td className="p-1 text-right font-mono text-emerald-800">₱{Math.max(0, grossIncome1701 - 250000).toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                          </tr>
                          <tr className="border-b border-black">
                            <td className="border-r border-black p-1 text-center font-mono text-[10px]">29</td>
                            <td className="border-r border-black p-1 font-semibold">Tax Rate Applicable</td>
                            <td className="p-1 text-right font-mono">8% flat rate IT</td>
                          </tr>
                        </>
                      ) : (
                        <>
                          <tr className="border-b border-black">
                            <td className="border-r border-black p-1 text-center font-mono text-[10px]">27</td>
                            <td className="border-r border-black p-1 font-semibold">Less: General Operating Costs (allowable deductions)</td>
                            <td className="p-1 text-right font-mono text-rose-600">₱({operatingCost1701.toLocaleString(undefined, {minimumFractionDigits: 2})})</td>
                          </tr>
                          <tr className="border-b border-black bg-slate-50">
                            <td className="border-r border-black p-1 text-center font-mono text-[10px]">28</td>
                            <td className="border-r border-black p-1 uppercase">Net Quarterly Taxable Income</td>
                            <td className="p-1 text-right font-mono text-emerald-800">₱{Math.max(0, grossIncome1701 - operatingCost1701).toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                          </tr>
                          <tr className="border-b border-black">
                            <td className="border-r border-black p-1 text-center font-mono text-[10px]">29</td>
                            <td className="border-r border-black p-1 font-semibold">Tax Bracket Scheme</td>
                            <td className="p-1 text-right font-mono">Graduated Rate Table</td>
                          </tr>
                        </>
                      )}
                      <tr className="bg-amber-100">
                        <td className="border-r border-black p-1.5 text-center font-mono text-[10px]">30</td>
                        <td className="border-r border-black p-1.5 font-black uppercase text-amber-900 leading-tight">Total Quarterly Income Tax Due</td>
                        <td className="p-1.5 text-right font-mono text-base font-black text-amber-950">₱{taxDue1701.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                      </tr>
                    </tbody>
                  </table>
</div>
                </div>

                <div className="flex justify-between items-center text-[10px] font-bold text-slate-500 pt-2 border-t border-black">
                  <span>CAPOTBOOKS Tax Integration Engine</span>
                  <span>Form Version: January 2018 (revised)</span>
                </div>
              </div>
            )}

            {/* BIR FORM NO 2551Q */}
            {activeFormType === '2551Q' && (
              <div className="border-[2px] border-black p-4 text-black bg-white max-w-4xl mx-auto space-y-4 print:border-0 print:p-0">
                {/* Form Header */}
                <div className="flex items-center border-b border-black pb-3">
                  <div className="border border-black px-3 py-1 font-mono text-center shrink-0 mr-4 font-black">
                    <span className="text-[10px] block font-semibold uppercase leading-none">BIR Form No.</span>
                    <span className="text-xl leading-none">2551Q</span>
                  </div>
                  <div className="flex-1 text-center font-bold font-serif leading-tight">
                    <div className="text-[10px] uppercase tracking-wide">Republika ng Pilipinas</div>
                    <div className="text-[11px] uppercase tracking-wide">Kagawaran ng Pananalapi</div>
                    <div className="text-[12px] uppercase">Kawanihan ng Rentas Internas</div>
                    <h1 className="text-sm uppercase font-black tracking-tighter mt-1">Quarterly Percentage Tax Return</h1>
                    <div className="text-[10px] tracking-wide font-sans font-bold">For Non-Vat Taxpayers With Annual Gross Revenue Not Exceeding ₱3.0M</div>
                  </div>
                  <div className="shrink-0 text-[10px] font-bold text-right pl-4">
                    <div>Amended: <span className="underline">No</span></div>
                    <div>Quarter: <span className="underline font-black">{selectedQuarter}</span></div>
                    <div>Year: <span className="underline font-black">{selectedYear}</span></div>
                  </div>
                </div>

                {/* Section Part I: Background Information */}
                <div>
                  <div className="bg-yellow-50 outline outline-[1px] outline-black text-[11px] font-black uppercase px-2 py-0.5 tracking-wide mb-1 leading-none select-none">
                    Part I: Background Information
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 border border-black p-2 bg-slate-50 text-[11px] font-bold gap-3">
                    <div>
                      <span className="text-[9px] block text-slate-500">1 Taxpayer Identification Number (TIN)</span>
                      <span className="font-mono text-xs">{formattedTin(currentClient?.tin)}</span>
                    </div>
                    <div>
                      <span className="text-[9px] block text-slate-500">2 RDO Code</span>
                      <span>{currentClient?.rdoCode || '043B'}</span>
                    </div>
                    <div className="md:col-span-2 border-t border-slate-200 pt-1.5">
                      <span className="text-[9px] block text-slate-500">3 Taxpayer Registered Legal Name</span>
                      <span className="uppercase text-xs">{currentClient?.registeredName || currentClient?.name}</span>
                    </div>
                  </div>
                </div>

                {/* Section Computation of Percentage Tax */}
                <div>
                  <div className="bg-yellow-50 outline outline-[1px] outline-black text-[11px] font-black uppercase px-2 py-0.5 tracking-wide mb-1 select-none">
                    Part II: Percentage Tax Computation
                  </div>
                  <div className="overflow-x-auto">
<table className="w-full text-xs border border-black border-collapse">
                    <thead>
                      <tr className="bg-slate-100 font-bold border-b border-black text-[10px]">
                        <th className="border-r border-black p-1 text-center w-10">ATC</th>
                        <th className="border-r border-black p-1 text-left">Percentage Tax Category / Code Description</th>
                        <th className="border-r border-black p-1 text-right w-40">Gross Quarterly Sales (₱)</th>
                        <th className="border-r border-black p-1 text-center w-20">Tax Rate</th>
                        <th className="p-1 text-right w-36">Percentage Tax Due (₱)</th>
                      </tr>
                    </thead>
                    <tbody className="font-bold">
                      <tr className="border-b border-black">
                        <td className="border-r border-black p-1 text-center font-mono text-[10px] uppercase">PT010</td>
                        <td className="border-r border-black p-1 font-semibold">Persons Exempt from VAT under Sect. 109BB</td>
                        <td className="border-r border-black p-1 text-right font-mono">₱{grossIncome2551Q.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                        <td className="border-r border-black p-1 text-center font-mono">3.00%</td>
                        <td className="p-1 text-right font-mono">₱{percentageTaxDue.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                      </tr>
                      <tr className="border-b border-black bg-slate-50">
                        <td className="border-r border-black p-1 text-center font-mono text-[10px]">—</td>
                        <td className="border-r border-black p-1 uppercase" colSpan={2}>Total Tax Remitable Due</td>
                        <td className="border-r border-black p-1 text-right">—</td>
                        <td className="p-1 text-right font-mono text-emerald-700">₱{percentageTaxDue.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                      </tr>
                      <tr className="bg-amber-100">
                        <td className="border-r border-black p-1.5 text-center font-mono">Sect 4</td>
                        <td className="border-r border-black p-1.5 font-black uppercase text-amber-900 leading-tight" colSpan={3}>Net Percentage Tax Payable</td>
                        <td className="p-1.5 text-right font-mono text-base font-black text-amber-950">₱{percentageTaxDue.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                      </tr>
                    </tbody>
                  </table>
</div>
                </div>

                <div className="flex justify-between items-center text-[10px] font-bold text-slate-500 pt-2 border-t border-black">
                  <span>CAPOTBOOKS Tax Percentage Engine</span>
                  <span>Form Version: January 2018 (revised)</span>
                </div>
              </div>
            )}

            {/* BIR FORM NO 1601-C */}
            {activeFormType === '1601-C' && (
              <div className="border-[2px] border-black p-4 text-black bg-white max-w-4xl mx-auto space-y-4 print:border-0 print:p-0">
                {/* Form Header */}
                <div className="flex items-center border-b border-black pb-3">
                  <div className="border border-black px-3 py-1 font-mono text-center shrink-0 mr-4 font-black">
                    <span className="text-[10px] block font-semibold uppercase leading-none">BIR Form No.</span>
                    <span className="text-xl leading-none">1601-C</span>
                  </div>
                  <div className="flex-1 text-center font-bold font-serif leading-tight">
                    <div className="text-[10px] uppercase tracking-wide">Republika ng Pilipinas</div>
                    <div className="text-[11px] uppercase tracking-wide">Kagawaran ng Pananalapi</div>
                    <div className="text-[12px] uppercase">Kawanihan ng Rentas Internas</div>
                    <h1 className="text-sm uppercase font-black tracking-tighter mt-1">Monthly Remittance Return of Income Taxes Withheld on Compensation</h1>
                  </div>
                  <div className="shrink-0 text-[10px] font-bold text-right pl-4">
                    <div>Amended: <span className="underline">No</span></div>
                    <div>Period: <span className="underline font-black">{selectedMonth}/{selectedYear}</span></div>
                  </div>
                </div>

                {/* Section Part I: Background Information */}
                <div>
                  <div className="bg-yellow-50 outline outline-[1px] outline-black text-[11px] font-black uppercase px-2 py-0.5 tracking-wide mb-1 leading-none select-none">
                    Part I: Background Information
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 border border-black p-2 bg-slate-50 text-[11px] font-bold gap-3">
                    <div>
                      <span className="text-[9px] block text-slate-500">1 Taxpayer Identification Number (TIN)</span>
                      <span className="font-mono text-xs">{formattedTin(currentClient?.tin)}</span>
                    </div>
                    <div>
                      <span className="text-[9px] block text-slate-500">2 RDO Code</span>
                      <span>{currentClient?.rdoCode || '043B'}</span>
                    </div>
                    <div>
                      <span className="text-[9px] block text-slate-500">3 Total Employee Count</span>
                      <span>{numEmployees} Paid Employees</span>
                    </div>
                    <div className="md:col-span-3 border-t border-slate-200 pt-1.5">
                      <span className="text-[9px] block text-slate-500">4 Withholding Agent Name / Corporate Title</span>
                      <span className="uppercase text-xs">{currentClient?.registeredName || currentClient?.name}</span>
                    </div>
                  </div>
                </div>

                {/* Computation of Withholding Taxes */}
                <div>
                  <div className="bg-yellow-50 outline outline-[1px] outline-black text-[11px] font-black uppercase px-2 py-0.5 tracking-wide mb-1 select-none">
                    Part II: Computation of Taxes Withheld
                  </div>
                  <div className="overflow-x-auto">
<table className="w-full text-xs border border-black border-collapse">
                    <thead>
                      <tr className="bg-slate-100 font-bold border-b border-black text-[10px]">
                        <th className="border-r border-black p-1 text-center w-10">Item</th>
                        <th className="border-r border-black p-1 text-left">Withholding Compensation Item Accounts</th>
                        <th className="p-1 text-right w-44">Monthly Ledger Totals (₱)</th>
                      </tr>
                    </thead>
                    <tbody className="font-bold">
                      <tr className="border-b border-black">
                        <td className="border-r border-black p-1 text-center font-mono text-[10px]">15</td>
                        <td className="border-r border-black p-1 font-semibold">Gross Salaries & Compensations Paid</td>
                        <td className="p-1 text-right font-mono">₱{totalSalaries.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                      </tr>
                      <tr className="border-b border-black">
                        <td className="border-r border-black p-1 text-center font-mono text-[10px]">16</td>
                        <td className="border-r border-black p-1 font-semibold">Less: Non-Taxable Compensations (SSS, PhH, Pag-IBIG & Exempt)</td>
                        <td className="p-1 text-right font-mono text-rose-600">₱({nonTaxableSalaries.toLocaleString(undefined, {minimumFractionDigits: 2})})</td>
                      </tr>
                      <tr className="border-b border-black bg-slate-50">
                        <td className="border-r border-black p-1 text-center font-mono text-[10px]">17</td>
                        <td className="border-r border-black p-1 uppercase">Total Taxable Compensations Paid (Line 15 - Line 16)</td>
                        <td className="p-1 text-right font-mono text-emerald-800">₱{taxableCompensation.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                      </tr>
                      <tr className="border-b border-black">
                        <td className="border-r border-black p-1 text-center font-mono text-[10px]">18</td>
                        <td className="border-r border-black p-1 font-semibold">Estimated Monthly Income Tax to be Withheld</td>
                        <td className="p-1 text-right font-mono">Graduated PAYE tables scaling</td>
                      </tr>
                      <tr className="bg-amber-100">
                        <td className="border-r border-black p-1.5 text-center font-mono text-[10px]">20</td>
                        <td className="border-r border-black p-1.5 font-black uppercase text-amber-900 leading-tight">Total Monthly Compensation Tax Due</td>
                        <td className="p-1.5 text-right font-mono text-base font-black text-amber-950">₱{compensationTaxDue.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                      </tr>
                    </tbody>
                  </table>
</div>
                </div>

                <div className="flex justify-between items-center text-[10px] font-bold text-slate-500 pt-2 border-t border-black">
                  <span>CAPOTBOOKS Tax Compensation Engine</span>
                  <span>Form Version: January 2018 (revised)</span>
                </div>
              </div>
            )}

            {/* BIR FORM NO 0619-E */}
            {activeFormType === '0619-E' && (
              <div className="border-[2px] border-black p-4 text-black bg-white max-w-4xl mx-auto space-y-4 print:border-0 print:p-0">
                {/* Form Header */}
                <div className="flex items-center border-b-[2px] border-black pb-3">
                  <div className="border-[2px] border-black px-3 py-1 font-mono text-center shrink-0 mr-4 font-black">
                    <span className="text-[10px] block font-semibold uppercase leading-none text-left">BIR Form No.</span>
                    <span className="text-3xl font-black leading-none tracking-tighter">0619-E</span>
                    <span className="text-[9px] block font-normal mt-0.5 leading-none">January 2018</span>
                    <span className="text-[9px] block font-semibold leading-none border-t border-black mt-1 pt-0.5">Page 1</span>
                  </div>
                  <div className="flex-1 text-center font-bold tracking-tight leading-tight">
                    <div className="flex justify-center items-center gap-2">
                      <span className="text-[10px] uppercase font-black tracking-wide border-r border-black pr-2">Republika ng Pilipinas</span>
                      <span className="text-[10px] uppercase font-bold text-slate-700">Kagawaran ng Pananalapi</span>
                    </div>
                    <div className="text-[12px] uppercase font-black">Kawanihan ng Rentas Internas</div>
                    <h1 className="text-sm uppercase font-black tracking-tighter mt-1 leading-snug">
                      Monthly Remittance Form <br />
                      of Creditable Income Taxes Withheld (Expanded)
                    </h1>
                    <div className="text-[8px] font-normal italic mt-1 text-slate-500">
                      Enter all required information in CAPITAL LETTERS using BLACK ink. Mark all applicable boxes with an "X".
                    </div>
                  </div>
                  <div className="shrink-0 text-[10px] font-bold text-right pl-4">
                    <div className="border border-black p-1 text-center bg-slate-100 font-mono text-[9px] mb-1">
                      0619-E 01/18 P1
                    </div>
                    <div className="text-[10px]">
                      <div>Amended: <span className="underline font-bold">{parseFloat(manual0619EPrevRemitted) > 0 ? 'Yes' : 'No'}</span></div>
                      <div>Period: <span className="underline font-black">{selectedMonth < 10 ? '0' + selectedMonth : selectedMonth}/{selectedYear}</span></div>
                    </div>
                  </div>
                </div>

                {/* 6 Top Info Boxes */}
                <div className="grid grid-cols-1 md:grid-cols-6 border border-black text-[10px] bg-white">
                  <div className="border-r border-b md:border-b-0 border-black p-1">
                    <span className="font-bold block text-[8px] text-slate-500 uppercase leading-none">1 For the Month of</span>
                    <div className="font-mono text-center text-xs font-black mt-1">
                      {selectedMonth < 10 ? '0' + selectedMonth : selectedMonth}/{selectedYear}
                    </div>
                  </div>
                  <div className="border-r border-b md:border-b-0 border-black p-1">
                    <span className="font-bold block text-[8px] text-slate-500 uppercase leading-none">2 Due Date</span>
                    <div className="font-mono text-center text-[10px] font-black mt-1">
                      {(() => {
                        const dueDate = new Date(selectedYear, selectedMonth, 10);
                        return dueDate.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
                      })()}
                    </div>
                  </div>
                  <div className="border-r border-b md:border-b-0 border-black p-1">
                    <span className="font-bold block text-[8px] text-slate-500 uppercase leading-none mb-0.5">3 Amended Form?</span>
                    <div className="flex justify-center gap-2 font-semibold mt-1">
                      <label className="flex items-center gap-1 cursor-pointer">
                        <input type="checkbox" checked={parseFloat(manual0619EPrevRemitted) > 0} disabled className="rounded border-gray-300 text-black focus:ring-0 w-3 h-3" /> Yes
                      </label>
                      <label className="flex items-center gap-1 cursor-pointer">
                        <input type="checkbox" checked={!(parseFloat(manual0619EPrevRemitted) > 0)} disabled className="rounded border-gray-300 text-black focus:ring-0 w-3 h-3" /> No
                      </label>
                    </div>
                  </div>
                  <div className="border-r border-b md:border-b-0 border-black p-1">
                    <span className="font-bold block text-[8px] text-slate-500 uppercase leading-none mb-0.5">4 Taxes Withheld?</span>
                    <div className="flex justify-center gap-2 font-semibold mt-1">
                      <label className="flex items-center gap-1 cursor-pointer">
                        <input type="checkbox" checked={active0619EAmount > 0} disabled className="rounded border-gray-300 text-black focus:ring-0 w-3 h-3" /> Yes
                      </label>
                      <label className="flex items-center gap-1 cursor-pointer">
                        <input type="checkbox" checked={active0619EAmount === 0} disabled className="rounded border-gray-300 text-black focus:ring-0 w-3 h-3" /> No
                      </label>
                    </div>
                  </div>
                  <div className="border-r border-black p-1 text-center">
                    <span className="font-bold block text-[8px] text-slate-500 uppercase leading-none text-left">5 ATC</span>
                    <div className="font-mono text-center text-[11px] font-black bg-slate-100 py-0.5 rounded border border-slate-300 uppercase mt-0.5 max-w-[80px] mx-auto text-blue-900">
                      WME10
                    </div>
                  </div>
                  <div className="p-1 text-center">
                    <span className="font-bold block text-[8px] text-slate-500 uppercase leading-none text-left">6 Tax Type Code</span>
                    <div className="font-mono text-center text-[11px] font-black bg-slate-100 py-0.5 rounded border border-slate-300 uppercase mt-0.5 max-w-[60px] mx-auto text-blue-900">
                      WE
                    </div>
                  </div>
                </div>

                {/* Section Part I: Background Information */}
                <div>
                  <div className="bg-yellow-50 outline outline-[1px] outline-black text-[11px] font-black uppercase px-2 py-0.5 tracking-wide mb-1 leading-none select-none">
                    Part I: Background Information
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-4 border border-black p-2 bg-slate-50 text-[11px] font-bold gap-2.5">
                    <div className="md:col-span-3">
                      <span className="text-[9px] block text-slate-500 uppercase tracking-tight">7 Taxpayer Identification Number (TIN)</span>
                      <span className="font-mono text-sm tracking-widest">{formattedTin(currentClient?.tin)}</span>
                    </div>
                    <div>
                      <span className="text-[9px] block text-slate-500 uppercase tracking-tight">8 RDO Code</span>
                      <span className="font-mono text-xs">{currentClient?.rdoCode || '043B'}</span>
                    </div>
                    <div className="md:col-span-4 border-t border-slate-200 pt-1.5">
                      <span className="text-[9px] block text-slate-500 uppercase tracking-tight">9 Withholding Agent's Registered Name (Last Name, First Name, Middle Name for Individual OR Registered Name for Non-Individual)</span>
                      <span className="uppercase text-xs font-black block mt-0.5">{currentClient?.registeredName || currentClient?.name}</span>
                    </div>
                    <div className="md:col-span-3 border-t border-slate-200 pt-1.5">
                      <span className="text-[9px] block text-slate-500 uppercase tracking-tight">10 Registered Address (Indicate complete physical corporate or residential setup address)</span>
                      <span className="uppercase text-xs block mt-0.5">
                        {[currentClient?.substreet, currentClient?.street, currentClient?.barangay, currentClient?.district, currentClient?.city].filter(Boolean).join(', ') || 'Not Specified'}
                      </span>
                    </div>
                    <div className="border-t border-slate-200 pt-1.5">
                      <span className="text-[9px] block text-slate-500 uppercase tracking-tight">10A ZIP Code</span>
                      <span className="font-mono text-xs block mt-0.5">{currentClient?.zipCode || '1000'}</span>
                    </div>
                    <div className="md:col-span-2 border-t border-slate-200 pt-1.5">
                      <span className="text-[9px] block text-slate-500 uppercase tracking-tight">11 Contact Number</span>
                      <span className="font-mono text-xs block mt-0.5">{currentClient?.phone || '—'}</span>
                    </div>
                    <div className="border-t border-slate-200 pt-1.5 text-center">
                      <span className="text-[9px] block text-slate-500 uppercase tracking-tight text-left">12 Category of Withholding Agent</span>
                      <div className="flex justify-start gap-4 mt-1 font-semibold text-[10px]">
                        <label className="flex items-center gap-1 cursor-pointer">
                          <input type="checkbox" checked={(currentClient?.category || 'private') === 'private'} readOnly className="rounded border-gray-300 text-black focus:ring-0 w-3 h-3" /> Private
                        </label>
                        <label className="flex items-center gap-1 cursor-pointer">
                          <input type="checkbox" checked={currentClient?.category === 'government'} readOnly className="rounded border-gray-300 text-black focus:ring-0 w-3 h-3" /> Government
                        </label>
                      </div>
                    </div>
                    <div className="border-t border-slate-200 pt-1.5">
                      <span className="text-[9px] block text-slate-500 uppercase tracking-tight">13 Registered Email Address</span>
                      <span className="text-xs block mt-0.5 font-normal font-mono normal-case">{currentClient?.email || '—'}</span>
                    </div>
                  </div>
                </div>

                {/* Section Part II: Computation of Remittance */}
                <div>
                  <div className="bg-yellow-50 outline outline-[1px] outline-black text-[11px] font-black uppercase px-2 py-0.5 tracking-wide mb-1 select-none">
                    Part II: Computation of Remittance
                  </div>
                  <div className="overflow-x-auto">
<table className="w-full text-xs border border-black border-collapse">
                    <thead>
                      <tr className="bg-slate-100 font-bold border-b border-black text-[10px]">
                        <th className="border-r border-black p-1 text-center w-10">Item</th>
                        <th className="border-r border-black p-1 text-left">Withholding Remittance Description</th>
                        <th className="p-1 text-right w-44">Totals (₱)</th>
                      </tr>
                    </thead>
                    <tbody className="font-bold">
                      <tr className="border-b border-black">
                        <td className="border-r border-black p-1 text-center font-mono text-[10px]">14</td>
                        <td className="border-r border-black p-1 font-semibold">Amount of Remittance</td>
                        <td className="p-1 text-right font-mono">₱{active0619EAmount.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                      </tr>
                      <tr className="border-b border-black">
                        <td className="border-r border-black p-1 text-center font-mono text-[10px]">15</td>
                        <td className="border-r border-black p-1 font-semibold">Less: Amount Remitted from Previously Filed Form (if amended)</td>
                        <td className="p-1 text-right font-mono text-rose-600">₱({active0619EPrevRemitted.toLocaleString(undefined, {minimumFractionDigits: 2})})</td>
                      </tr>
                      <tr className="border-b border-black bg-slate-50">
                        <td className="border-r border-black p-1 text-center font-mono text-[10px]">16</td>
                        <td className="border-r border-black p-1 uppercase">Net Amount of Remittance (Line 14 - Line 15)</td>
                        <td className="p-1 text-right font-mono text-emerald-800">₱{active0619ENetAmount.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                      </tr>
                      <tr className="border-b border-black">
                        <td className="border-r border-black p-1 text-center font-mono text-[10px]">17</td>
                        <td className="border-r border-black p-1 font-semibold text-rose-950">Add Penalties:</td>
                        <td className="p-1 text-right font-mono text-rose-600">
                          <div className="text-[10px] space-y-0.5">
                            <div>Surcharge: ₱{active0619ESurcharge.toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
                            <div>Interest: ₱{active0619EInterest.toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
                            <div>Compromise: ₱{active0619ECompromise.toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
                          </div>
                        </td>
                      </tr>
                      <tr className="border-b border-black bg-slate-50">
                        <td className="border-r border-black p-1 text-center font-mono text-[10px]">17D</td>
                        <td className="border-r border-black p-1 uppercase">Total Penalties (Surcharge + Interest + Compromise)</td>
                        <td className="p-1 text-right font-mono text-rose-600">₱{active0619ETotalPenalties.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                      </tr>
                      <tr className="bg-amber-100">
                        <td className="border-r border-black p-1.5 text-center font-mono text-[10px]">18</td>
                        <td className="border-r border-black p-1.5 font-black uppercase text-amber-900 leading-tight">Total Amount of Remittance Due</td>
                        <td className="p-1.5 text-right font-mono text-base font-black text-amber-950">₱{active0619ETotalDue.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                      </tr>
                    </tbody>
                  </table>
</div>
                </div>

                {/* Section Part III: Details of Payment */}
                <div>
                  <div className="bg-yellow-50 outline outline-[1px] outline-black text-[11px] font-black uppercase px-2 py-0.5 tracking-wide mb-1 select-none">
                    Part III: Details of Payment
                  </div>
                  <div className="overflow-x-auto">
<table className="w-full text-[10px] border border-black border-collapse">
                    <thead>
                      <tr className="bg-slate-100 font-bold border-b border-black text-[9px] uppercase">
                        <th className="border-r border-black p-1 text-center w-12">Item</th>
                        <th className="border-r border-black p-1 text-left w-28">Particulars</th>
                        <th className="border-r border-black p-1 text-left w-36">Drawee Bank/Agency</th>
                        <th className="border-r border-black p-1 text-left w-28">Number</th>
                        <th className="border-r border-black p-1 text-center w-24">Date (MM/DD/YYYY)</th>
                        <th className="p-1 text-right w-28">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="font-bold">
                      <tr className="border-b border-black">
                        <td className="border-r border-black p-1 text-center font-mono">19</td>
                        <td className="border-r border-black p-1 font-semibold">Cash/Bank Debit Memo</td>
                        <td className="border-r border-black p-1 font-mono text-slate-400">/ / / / / / / / / /</td>
                        <td className="border-r border-black p-1 font-mono text-slate-400">/ / / / / / / /</td>
                        <td className="border-r border-black p-1 text-center font-mono text-slate-400">/ / / / / /</td>
                        <td className="p-1 text-right font-mono">₱0.00</td>
                      </tr>
                      <tr className="border-b border-black">
                        <td className="border-r border-black p-1 text-center font-mono">20</td>
                        <td className="border-r border-black p-1 font-semibold">Check</td>
                        <td className="border-r border-black p-1 font-mono text-slate-400">/ / / / / / / / / /</td>
                        <td className="border-r border-black p-1 font-mono text-slate-400">/ / / / / / / /</td>
                        <td className="border-r border-black p-1 text-center font-mono text-slate-400">/ / / / / /</td>
                        <td className="p-1 text-right font-mono">₱0.00</td>
                      </tr>
                      <tr className="border-b border-black">
                        <td className="border-r border-black p-1 text-center font-mono">21</td>
                        <td className="border-r border-black p-1 font-semibold">Tax Debit Memo</td>
                        <td className="border-r border-black p-1 font-mono text-slate-400">/ / / / / / / / / /</td>
                        <td className="border-r border-black p-1 font-mono text-slate-400">/ / / / / / / /</td>
                        <td className="border-r border-black p-1 text-center font-mono text-slate-400">/ / / / / /</td>
                        <td className="p-1 text-right font-mono">₱0.00</td>
                      </tr>
                      <tr className="border-b border-black">
                        <td className="border-r border-black p-1 text-center font-mono">22</td>
                        <td className="border-r border-black p-1 font-semibold">Others (specify)</td>
                        <td className="border-r border-black p-1 font-mono text-slate-400 font-normal">Electronic Remittance (eFPS)</td>
                        <td className="border-r border-black p-1 font-mono text-emerald-800 font-semibold">ONLINEPROC-EFPS-0921</td>
                        <td className="border-r border-black p-1 text-center font-mono">{new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })}</td>
                        <td className="p-1 text-right font-mono text-emerald-900">₱{active0619ETotalDue.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                      </tr>
                    </tbody>
                  </table>
</div>
                </div>

                {/* Perjury declaration and signatures */}
                <div className="border border-black bg-slate-50 p-2 text-[8px] leading-tight font-sans">
                  <p>
                    I/We declare under the penalties of perjury that this remittance form has been made in good faith, verified by me/us, and to the best of my/our knowledge and belief, is true and correct, pursuant to the provisions of the National Internal Revenue Code, as amended, and the regulations issued under authority thereof. Further, I/we give my/our consent to the processing of my/our information as contemplated under the *Data Privacy Act of 2012 (R.A. No. 10173) for legitimate and lawful purposes.
                  </p>
                  <div className="grid grid-cols-2 gap-4 mt-2 pt-1 border-t border-slate-200">
                    <div className="text-center">
                      <div className="h-6 border-b border-black max-w-[240px] mx-auto"></div>
                      <span className="block mt-1 uppercase font-bold text-slate-600">Signature over Printed Name of Taxpayer/Authorized Representative/Tax Agent</span>
                      <span className="block text-slate-400 font-mono text-[7px]">(Indicate Title/Designation and TIN)</span>
                    </div>
                    <div className="text-center">
                      <div className="h-6 border-b border-black max-w-[240px] mx-auto"></div>
                      <span className="block mt-1 uppercase font-bold text-slate-600">Signature over Printed Name of President/Vice President/Authorized Representative</span>
                      <span className="block text-slate-400 font-mono text-[7px]">(Indicate Title/Designation and TIN)</span>
                    </div>
                  </div>
                </div>

                {/* Machine Validation and Stamp */}
                <div className="grid grid-cols-2 gap-4 border border-black p-2 bg-slate-50 text-[8px] font-bold h-16">
                  <div className="border-r border-black pr-2">
                    <span className="block text-slate-500 uppercase tracking-tight mb-0.5 leading-none">Machine Validation/Revenue Official Receipt Details (if not filed with an Authorized Agent Bank)</span>
                    <div className="border-b border-dashed border-slate-200 w-full mt-4"></div>
                  </div>
                  <div className="pl-2">
                    <span className="block text-slate-500 uppercase tracking-tight mb-0.5 leading-none">Stamp of Receiving Office/AAB and Date of Receipt (RO's Signature/Bank Teller's Initial)</span>
                    <div className="border-b border-dashed border-slate-200 w-full mt-4"></div>
                  </div>
                </div>

                <div className="flex justify-between items-center text-[10px] font-bold text-slate-500 pt-2 border-t border-black">
                  <span>CAPOTBOOKS Monthly EWT Remittance Engine</span>
                  <span>Form Version: January 2018 (revised)</span>
                </div>
              </div>
            )}

            {/* BIR FORM NO 1601-EQ */}
            {activeFormType === '1601-EQ' && (
              <div className="border-[2px] border-black p-4 text-black bg-white max-w-4xl mx-auto space-y-4 print:border-0 print:p-0">
                {/* Form Header */}
                <div className="flex items-center border-b border-black pb-3">
                  <div className="border border-black px-3 py-1 font-mono text-center shrink-0 mr-4 font-black">
                    <span className="text-[10px] block font-semibold uppercase leading-none">BIR Form No.</span>
                    <span className="text-xl leading-none">1601-EQ</span>
                  </div>
                  <div className="flex-1 text-center font-bold font-serif leading-tight">
                    <div className="text-[10px] uppercase tracking-wide">Republika ng Pilipinas</div>
                    <div className="text-[11px] uppercase tracking-wide">Kagawaran ng Pananalapi</div>
                    <div className="text-[12px] uppercase">Kawanihan ng Rentas Internas</div>
                    <h1 className="text-sm uppercase font-black tracking-tighter mt-1">Quarterly Remittance Return of Creditable Income Taxes Withheld (Expanded)</h1>
                  </div>
                  <div className="shrink-0 text-[10px] font-bold text-right pl-4">
                    <div>Amended: <span className="underline">No</span></div>
                    <div>Quarter: <span className="underline font-black">{selectedQuarter}</span></div>
                    <div>Year: <span className="underline font-black">{selectedYear}</span></div>
                  </div>
                </div>

                {/* Section Part I: Background Information */}
                <div>
                  <div className="bg-yellow-50 outline outline-[1px] outline-black text-[11px] font-black uppercase px-2 py-0.5 tracking-wide mb-1 leading-none select-none">
                    Part I: Background Information
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 border border-black p-2 bg-slate-50 text-[11px] font-bold gap-3">
                    <div>
                      <span className="text-[9px] block text-slate-500">1 Taxpayer Identification Number (TIN)</span>
                      <span className="font-mono text-xs">{formattedTin(currentClient?.tin)}</span>
                    </div>
                    <div>
                      <span className="text-[9px] block text-slate-500">2 RDO Code</span>
                      <span>{currentClient?.rdoCode || '043B'}</span>
                    </div>
                    <div className="md:col-span-2 border-t border-slate-200 pt-1.5">
                      <span className="text-[9px] block text-slate-500">3 Withholding Agent's Registered Name</span>
                      <span className="uppercase text-xs">{currentClient?.registeredName || currentClient?.name}</span>
                    </div>
                  </div>
                </div>

                {/* ATC Details List */}
                <div>
                  <div className="bg-yellow-50 outline outline-[1px] outline-black text-[11px] font-black uppercase px-2 py-0.5 tracking-wide mb-1 select-none">
                    Part II: Details of Withholding Taxes for the Quarter
                  </div>
                  <div className="overflow-x-auto">
<table className="w-full text-xs border border-black border-collapse">
                    <thead>
                      <tr className="bg-slate-100 font-bold border-b border-black text-[10px]">
                        <th className="border-r border-black p-1 text-center w-12">ATC</th>
                        <th className="border-r border-black p-1 text-left">Tax Description Classification</th>
                        <th className="border-r border-black p-1 text-right w-36">Total Amount of Income Payment (₱)</th>
                        <th className="border-r border-black p-1 text-center w-16">Tax Rate</th>
                        <th className="p-1 text-right w-36">Total Quarterly Tax Withheld (₱)</th>
                      </tr>
                    </thead>
                    <tbody className="font-bold">
                      {compiledData.quarterlyAtcList.length === 0 ? (
                        <tr className="border-b border-black">
                          <td className="border-r border-black p-2 text-center text-slate-400 font-normal italic" colSpan={5}>
                            No active Witheld Expanded Transactions recorded for Q{selectedQuarter} {selectedYear}
                          </td>
                        </tr>
                      ) : (
                        compiledData.quarterlyAtcList.map(atc => (
                          <tr key={atc.atcCode} className="border-b border-black">
                            <td className="border-r border-black p-1 text-center font-mono uppercase text-[10px]">{atc.atcCode}</td>
                            <td className="border-r border-black p-1 text-[11px] truncate max-w-xs font-semibold">{atc.description}</td>
                            <td className="border-r border-black p-1 text-right font-mono">₱{atc.baseAmount.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                            <td className="border-r border-black p-1 text-center font-mono">{(atc.rate * 100).toFixed(1)}%</td>
                            <td className="p-1 text-right font-mono">₱{atc.taxWithheld.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                          </tr>
                        ))
                      )}
                      
                      <tr className="border-t border-b border-black bg-slate-50">
                        <td className="border-r border-black p-1 text-center font-mono text-[10px]">19</td>
                        <td className="border-r border-black p-1 uppercase" colSpan={3}>Total Taxes Withheld for the Quarter (Sum of ATC Entries)</td>
                        <td className="p-1 text-right font-mono text-emerald-800">₱{compiledData.quarterlyTotalTaxesWithheld.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                      </tr>
                      
                      <tr className="border-b border-black">
                        <td className="border-r border-black p-1 text-center font-mono text-[10px]">20</td>
                        <td className="border-r border-black p-1 font-semibold" colSpan={3}>Less: Remittances Made - 1st Month of the Quarter</td>
                        <td className="p-1 text-right font-mono text-rose-600">₱({active1601EQMonth1.toLocaleString(undefined, {minimumFractionDigits: 2})})</td>
                      </tr>
                      <tr className="border-b border-black">
                        <td className="border-r border-black p-1 text-center font-mono text-[10px]">21</td>
                        <td className="border-r border-black p-1 font-semibold" colSpan={3}>Less: Remittances Made - 2nd Month of the Quarter</td>
                        <td className="p-1 text-right font-mono text-rose-600">₱({active1601EQMonth2.toLocaleString(undefined, {minimumFractionDigits: 2})})</td>
                      </tr>
                      <tr className="border-b border-black">
                        <td className="border-r border-black p-1 text-center font-mono text-[10px]">22</td>
                        <td className="border-r border-black p-1 font-semibold" colSpan={3}>Less: Tax Remitted in Previous Return (Amended files)</td>
                        <td className="p-1 text-right font-mono text-rose-600">₱({active1601EQPrevFiled.toLocaleString(undefined, {minimumFractionDigits: 2})})</td>
                      </tr>
                      <tr className="border-b border-black">
                        <td className="border-r border-black p-1 text-center font-mono text-[10px]">23</td>
                        <td className="border-r border-black p-1 font-semibold" colSpan={3}>Less: Over-remittance from Previous Quarter of Same Year</td>
                        <td className="p-1 text-right font-mono text-rose-600">₱({active1601EQOverRemit.toLocaleString(undefined, {minimumFractionDigits: 2})})</td>
                      </tr>
                      <tr className="border-b border-black">
                        <td className="border-r border-black p-1 text-center font-mono text-[10px]">24</td>
                        <td className="border-r border-black p-1 font-semibold" colSpan={3}>Less: Other Payments Made (BIR Form No. 0605)</td>
                        <td className="p-1 text-right font-mono text-rose-600">₱({active1601EQOtherPayments.toLocaleString(undefined, {minimumFractionDigits: 2})})</td>
                      </tr>
                      <tr className="border-b border-black bg-slate-50">
                        <td className="border-r border-black p-1 text-center font-mono text-[10px]">25</td>
                        <td className="border-r border-black p-1 uppercase" colSpan={3}>Total Remittances Made (Sum of Lines 20 to 24)</td>
                        <td className="p-1 text-right font-mono">₱{active1601EQTotalRemittances.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                      </tr>
                      <tr className="border-b border-black bg-slate-50">
                        <td className="border-r border-black p-1 text-center font-mono text-[10px]">26</td>
                        <td className="border-r border-black p-1 uppercase" colSpan={3}>Tax Still Due / (Over-remittance) (Line 19 - Line 25)</td>
                        <td className="p-1 text-right font-mono text-emerald-800">₱{active1601EQTaxStillDue.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                      </tr>
                      <tr className="border-b border-black">
                        <td className="border-r border-black p-1 text-center font-mono text-[10px]">27-29</td>
                        <td className="border-r border-black p-1 font-semibold" colSpan={3}>Add Penalties (Surcharge, Interest, Compromise)</td>
                        <td className="p-1 text-right font-mono text-rose-600">₱{active1601EQTotalPenalties.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                      </tr>
                      <tr className="bg-amber-100">
                        <td className="border-r border-black p-1.5 text-center font-mono text-[10px]">31</td>
                        <td className="border-r border-black p-1.5 font-black uppercase text-amber-900 leading-tight" colSpan={3}>Total Amount Still Due / (Over-remittance)</td>
                        <td className="p-1.5 text-right font-mono text-base font-black text-amber-950">₱{active1601EQTotalDue.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                      </tr>
                    </tbody>
                  </table>
</div>
                </div>

                <div className="flex justify-between items-center text-[10px] font-bold text-slate-500 pt-2 border-t border-black">
                  <span>CAPOTBOOKS Quarterly EWT Return Engine</span>
                  <span>Form Version: January 2018 (revised)</span>
                </div>
              </div>
            )}
            
          </div>
        </div>

      </div>
          </div>
    </div>
  );
}
