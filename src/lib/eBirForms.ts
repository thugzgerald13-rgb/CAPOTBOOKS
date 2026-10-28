// eBirForms.ts — CAPOTBOOKS draft export for the offline eBIRForms workflow.
// Reference data (ATC codes, form list) is based on the supplied offline package.
// XML field compatibility is reverse-engineered and must be validated in the
// exact installed BIR package before the generated return is used for filing.
import type { Client } from '../types';
import { EBIR_1702RT_FIELD_DEFAULTS } from './official1702RTSchema';
import {
  resolveBusinessWorkflow,
  computeIncomeTaxByRegime,
  computeBusinessTax,
} from './taxEngine';

export interface EwtAtcEntry { code: string; description: string; rate: number; }
export const EW_ATC_CODES: EwtAtcEntry[] = [
  { code: 'WV010', description: 'VAT WITHHOLDING ON PURCHASE OF GOODS', rate: 5.0 },
  { code: 'WV020', description: 'VAT WITHHOLDING ON PURCHASE OF SERVICES', rate: 5.0 },
  { code: 'WV030', description: 'VAT WITHHOLDING ON GOVERNMENT PUBLIC WORK CONTRACTS', rate: 5.0 },
  { code: 'WC010', description: 'PROFL TALENT FEE PD TO JURIDICL (GROSS INC &lt;= 720,000)', rate: 10.0 },
  { code: 'WC011', description: 'PROFL TALENT FEE PD TO JURIDICL (GROSS INC &gt; 720,000)', rate: 15.0 },
  { code: 'WC050', description: 'MANAGEMENT AND TECHNICAL CONSULTANTS (GROSS INC &lt;= 720,000)', rate: 10.0 },
  { code: 'WC051', description: 'MANAGEMENT AND TECHNICAL CONSULTANTS (GROSS INC &gt; 720,000)', rate: 15.0 },
  { code: 'WC100', description: 'RENTALS (CORP.)', rate: 5.0 },
  { code: 'WC110', description: 'CINEM. FILM RENTALS (CORP.)', rate: 5.0 },
  { code: 'WC120', description: 'CONTRACTORS (CORPORATE)', rate: 2.0 },
  { code: 'WC140', description: 'AMOUNTS PAID TO CERTAIN BROKERS AND AGENTS (CORP.)', rate: 10.0 },
  { code: 'WC156', description: 'CREDIT CREDIT CARD COMPANIES', rate: 0.5 },
  { code: 'WC157', description: 'PYMT BY GOVT TO LOCAL/RSDNT SUPPLIER(CORP-SERVICES)', rate: 2.0 },
  { code: 'WC158', description: 'INCOME PAYMENTS MADE BY TOP 20,000 PRIVATE CORPORATIONS TO THEIR LOCAL/RESIDENT SUPPLIERS OF GOODS OTHER THAN THOSE COVERED BY OTHER RATES OF WITHHOLDING TAX', rate: 1.0 },
  { code: 'WC160', description: 'INCOME PAYMENTS MADE BY TOP 20,000 PRIVATE CORPORATIONS TO THEIR LOCAL/RESIDENT SUPPLIERS OF SERVICES OTHER THAN THOSE COVERED BY OTHER RATES OF WITHHOLDING TAX', rate: 2.0 },
  { code: 'WC515', description: 'COMM OF INDPNT AND/OR EXCL SALES REP,MKTG AGENTS(CORP)', rate: 10.0 },
  { code: 'WC535', description: 'PYMTS MADE BY PRE-NEED CO. TO FUNERAL PARLORS(CORP)', rate: 1.0 },
  { code: 'WC540', description: 'TOLLING FEE PAID TO REFINERIES(CORPORATE)', rate: 5.0 },
  { code: 'WC610', description: 'PYMTS MADE TO SUPPLIERS OF AGRICULTURAL PRODUCTS(CORP)', rate: 1.0 },
  { code: 'WC630', description: 'PYMTS ON PURCH-MINERALS,MINERAL PROD,QUARRY RESRCS(CORP)', rate: 5.0 },
  { code: 'WC632', description: 'INCME PYMT ON PURCH OF GOLD BYBSPTO GOLDMINRS RA7076', rate: 5.0 },
  { code: 'WC640', description: 'PYMT BY GOVT TO LOCAL/RSDNT SUPPLIER(CORP-GOODS)', rate: 1.0 },
  { code: 'WC650', description: 'GROSS AMOUNT OF REFUND GIVEN BY MERALCO TO CUSTOMERS WITH ACTIVE CONTRACTS', rate: 25.0 },
  { code: 'WC651', description: 'WITHHOLDING ON GROSS AMT OF REF TO MERALCO CUS-TERMINATED', rate: 32.0 },
  { code: 'WC660', description: 'GROS OF INT RFUND OF MTER DPOSIT RESIDNTL ELECT&gt;200KW MER', rate: 10.0 },
  { code: 'WC661', description: 'GROS OF INT RFUND OF MTER DPOSIT NONRES ELECT&gt;200KW MER', rate: 10.0 },
  { code: 'WC662', description: 'GROS OF INT RFUND OF MTER DPOSIT RESIDNTL ELECT&gt;200KW DU', rate: 10.0 },
  { code: 'WC663', description: 'GROS OF INT RFUND OF MTER DPOSIT NONRES ELECT>200KW DU', rate: 20.0 },
  { code: 'WI010', description: 'PROFLS, LAWYERS,CPAS, ENGR (GROSS INC &lt;= 720,000)', rate: 10.0 },
  { code: 'WI011', description: 'PROFLS, LAWYERS,CPAS, ENGR (GROSS INC &gt; 720,000)', rate: 15.0 },
  { code: 'WI020', description: 'PROF ENTRTNR-IF CURR YR GROSS INC DOESNT EXCEED P720,000 (IND.)', rate: 10.0 },
  { code: 'WI021', description: 'PROF ENTRTAINRS-IF CURRENT YR GROSS INC EXCEEDS P720,000 (IND.)', rate: 15.0 },
  { code: 'WI030', description: 'PROF ATH-IF CURR YR GROSS INC DOESNT EXCEED P720,000 (IND.)', rate: 10.0 },
  { code: 'WI031', description: 'PROF ATHLETES-IF CURRENT YR GROSS INC EXCEEDS P720,000 (IND.)', rate: 15.0 },
  { code: 'WI040', description: 'MOVIE,STAGE,ETC-IF CURR YR GROSS INC DOESNT EXCEED P720T (IND.)', rate: 10.0 },
  { code: 'WI041', description: 'MOVIE,STAGE,ETC-IF CURRENT YR GROSS INC EXCEEDS P720,000 (IND.)', rate: 15.0 },
  { code: 'WI050', description: 'MANAGEMENT AND TECHNICAL CONSULTANTS (GROSS INC &lt;= 720,000)', rate: 10.0 },
  { code: 'WI051', description: 'MANAGEMENT AND TECHNICAL CONSULTANTS (GROSS INC &gt;720,000)', rate: 15.0 },
  { code: 'WI060', description: 'BUSINESS AND BOOKKEEPING AGENTS (GROSS INC &lt;= 720,000)', rate: 10.0 },
  { code: 'WI061', description: 'BUSINESS AND BOOKKEEPING AGENTS (GROSS INC &gt; 720,000)', rate: 15.0 },
  { code: 'WI070', description: 'INSURANCE AGENTS AND ADJUSTERS (GROSS INC &lt;= 720,000)', rate: 10.0 },
  { code: 'WI071', description: 'INSURANCE AGENTS AND ADJUSTERS (GROSS INC &gt; 720,000)', rate: 15.0 },
  { code: 'WI080', description: 'OTHER RCPNT OF TF-IF CURR YR GROSS INC DSNT EXCEED P720T (IND.)', rate: 10.0 },
  { code: 'WI081', description: 'OTHER RCPNT OF TF-IF CURR YR GROSS INC EXCEEDS P720,000 (IND.)', rate: 15.0 },
  { code: 'WI090', description: 'FEES OF DIRECTORS NOT EMPLOYEE OF COMP(GROSS INC &lt;= 720,000)', rate: 10.0 },
  { code: 'WI091', description: 'FEES OF DIRECTORS NOT EMPLOYEE OF COMP(GROSS INC &gt; 720,000)', rate: 15.0 },
  { code: 'WI100', description: 'RENTALS (INDIVIDUAL)', rate: 5.0 },
  { code: 'WI110', description: 'CINEM. FILM RENTALS -(INDIVIDUAL)', rate: 5.0 },
  { code: 'WI120', description: 'CONTRACTORS (INDIVIDUAL)', rate: 2.0 },
  { code: 'WI130', description: 'INCOME DISTRIBUTION TO BENEFICIARIES (IND.)', rate: 15.0 },
  { code: 'WI140', description: 'AMOUNTS PAID TO CERTAIN BROKERS AND AGENTS (IND.)', rate: 10.0 },
  { code: 'WI141', description: 'PYMTS FOR MED PRACTITIONRS THRU A DULY REG PROF PRTNRSHP (INC. &lt;= 720,000)', rate: 10.0 },
  { code: 'WI142', description: 'PAYMENTS FOR MED PRACTITIONERS THRU A DULY REG PROF PARTNERSHIP (INC &gt;720,000)', rate: 15.0 },
  { code: 'WI150', description: 'PYMT TO MED PRACTNRS THRU HOSP/CLINICS(GROSS INC &gt;720,000)', rate: 15.0 },
  { code: 'WI151', description: 'PYMT TO MED PRACTNRS THRU HOSP/CLINICS(GROSS INC &lt;= 720,000)', rate: 10.0 },
  { code: 'WI152', description: 'PYMT TO PARTNERS IN PROF PARTNERSHIP (GROSS INC &lt;= 720,000)', rate: 10.0 },
  { code: 'WI153', description: 'PYMT TO PARTNERS IN PROF PRTNSHIP (GROSS INC &gt; 720,000)', rate: 15.0 },
  { code: 'WI156', description: 'PAYMENTS MADE BY CREDIT CARD COMPANIES TO INDIVIDUALS', rate: 0.5 },
  { code: 'WI157', description: 'PYMT BY GOVT TO LOCAL/RSDNT SUPPLIER(INDIV-SERVICES)', rate: 2.0 },
  { code: 'WI158', description: 'INCOME PAYMENTS MADE BY TOP 20,000 PRIVATE CORPORATIONS TO THEIR LOCAL/RESIDENT SUPPLIERS OF GOODS OTHER THAN THOSE COVERED BY OTHER RATES OF WITHHOLDING TAX', rate: 1.0 },
  { code: 'WI159', description: 'ADDL PAYMENTS TO GOVT PERSONNEL FROM IMPORTERS,SHIPPING', rate: 15.0 },
  { code: 'WI160', description: 'INCOME PAYMENTS MADE BY TOP 20,000 PRIVATE CORPORATIONS TO THEIR LOCAL/RESIDENT SUPPLIERS OF SERVICES OTHER THAN THOSE COVERED BY OTHER RATES OF WITHHOLDING TAX', rate: 2.0 },
  { code: 'WI515', description: 'COMM OF INDPNT AND/OR EXCL SALES REP,MKTG AGENTS OF CO.', rate: 10.0 },
  { code: 'WI530', description: 'GROSS PYMTS TO EMBALMERS BY FUNERAL COMPANIES', rate: 1.0 },
  { code: 'WI535', description: 'PYMTS MADE BY PRE-NEED CO. TO FUNERAL PARLORS', rate: 1.0 },
  { code: 'WI540', description: 'TOLLING FEE PAID TO REFINERIES', rate: 5.0 },
  { code: 'WI610', description: 'PYMTS MADE TO SUPPLIERS OF AGRICULTURAL PRODUCTS', rate: 1.0 },
  { code: 'WI630', description: 'PYMTS ON PURCH-MINERALS,MINERAL PROD,QUARRY RESOURCES', rate: 5.0 },
  { code: 'WI632', description: 'INCM PYMT ON PURCH OF GOLD BYBSPTO GOLDMINRS RA7076 IND', rate: 5.0 },
  { code: 'WI640', description: 'PYMT BY GOVT TO LOCAL/RSDNT SUPPLIER(INDIV-GOODS)', rate: 1.0 },
  { code: 'WI650', description: 'GROSS AMOUNT OF REFUND GIVEN BY MERALCO TO CUSTOMERS WITH ACTIVE CONTRACTS', rate: 25.0 },
  { code: 'WI651', description: 'WITHHOLDING ON GROSS AMT OF REF TO MERALCO CUS-TERMINATED', rate: 32.0 },
  { code: 'WI660', description: 'GROS OF INT RFUND OF MTER DPOSIT RESID ELECT&gt;200KW MER IND', rate: 10.0 },
  { code: 'WI661', description: 'GROS OF INT RFUND OF MTER DPOSIT NONRS ELECT&gt;200KW MER IND', rate: 10.0 },
  { code: 'WI662', description: 'GROS OF INT RFUND OF MTER DPOSIT RESID ELECT&gt;200KW DU IND', rate: 10.0 },
  { code: 'WI663', description: 'GROS OF INT RFUND OF MTER DPOSIT NONRS ELECT&gt;200KW DU IND', rate: 20.0 },
  { code: 'WC180', description: 'FINAL TAX -INTEREST ON FOREIGN CURRENCY PAYABLE TO NON-RESIDENT FOREIGN CORPORATION', rate: 20.0 },
  { code: 'WC190', description: 'FINAL TAX -INTEREST ON FOREIGN CURRENCY PAYABLE TO OFFSHORE BANKING UNIT/FOREIGN CURRENCY DEP. UNIT', rate: 10.0 },
  { code: 'WC191', description: 'WITHOLDING TAX ON INCOME PAYMENT TO FCDUS', rate: 10.0 },
  { code: 'WC212', description: 'CASH DIVIDEND PAYMENTS BY DOMESTIC CORPORATION TO CITIZENS AND RESIDENT ALIENS/NRFCs', rate: 30.0 },
];



// Official eBIRForms tax-rate cell map — extracted from Offline eBIRForms Package
// v7.9.6.2 xml/taxRate.xml. Each key is the official cell ID used by the form's
// tax-rate-helper.js (frm{FORM}:{FIELD}); value is divided by 100 at runtime.
export const TAX_RATE_CELLS: Record<string, { value: string; text: string }> = {
  "frm1602Q:fntSched1TaxRate1": { value: "20", text: "20%" },
  "frm1602Q:fntSched1TaxRate2": { value: "20", text: "20%" },
  "frm1602Q:fntSched1TaxRate3": { value: "20", text: "20%" },
  "frm1602Q:fntSched1TaxRate4": { value: "20", text: "20%" },
  "frm1602Q:fntSched1TaxRate5": { value: "20", text: "20%" },
  "frm1602Q:fntSched1TaxRate6": { value: "20", text: "20%" },
  "frm1602Q:fntSched1TaxRate7": { value: "20", text: "20%" },
  "frm1602Q:fntSched1TaxRate8": { value: "20", text: "20%" },
  "frm1602Q:fntSched1TaxRate9": { value: "20", text: "20%" },
  "frm1602Q:fntSched1TaxRate10": { value: "12", text: "12%" },
  "frm1602Q:fntSched1TaxRate11": { value: "5", text: "5%" },
  "frm1602Q:fntSched1TaxRate12": { value: "20", text: "20%" },
  "frm1602Q:txtSched1TaxRate13": { value: "0.00", text: "0%" },
  "frm1602Q:txtSched1TaxRate14": { value: "0.00", text: "0%" },
  "frm1602Q:txtSched1TaxRate15": { value: "6", text: "6%" },
  "frm1603Q:Sched1:txtDivisor1": { value: "65%", text: "65%" },
  "frm1603Q:Sched1:txtTaxRate1": { value: "35%", text: "35%" },
  "frm1603Q:Sched1:txtDivisor2": { value: "75%", text: "75%" },
  "frm1603Q:Sched1:txtTaxRate2": { value: "25%", text: "25%" },
  "frm1621:txtTaxRate": { value: "6.0%", text: "6.0%" },
  "frm1702EX:txtPg2Pt4I40TaxRate": { value: "0", text: "0" },
  "frm1702RT:Pg2Pt4I40IncomeTaxRate": { value: "30%", text: "0" },
  "frm1702q:Sched1:txtTax10A": { value: "10.00", text: "0.00" },
  "frm1707Av2021:txtI16ApplicableTaxRate": { value: "15", text: "15" },
  "taxClassIndiv": { value: "", text: "15%" },
  "taxClassCorpDomestic": { value: "", text: "15%" },
  "taxClassCorpForeign": { value: "", text: "15%" },
  "appDonorsTaxRate": { value: "0.06", text: "                          6%" },
  "lessExemptGift": { value: "250000", text: "                   250,000.00" },
  "frm1801v2018:txtTaxRate": { value: "0.06", text: "" },
  "frm2200Av2020:txtSched1_1A_2020_ATR": { value: "0.20", text: "20%" },
  "frm2200Av2020:txtSched1_1A_2020B_ATR": { value: "0.21", text: "21%" },
  "frm2200Av2020:txtSched1_1A_2021_ATR": { value: "0.22", text: "22%" },
  "frm2200Av2020:txtSched1_1A_2022_ATR": { value: "0.22", text: "22%" },
  "frm2200Av2020:txtSched1_1A_2023_ATR": { value: "0.22", text: "22%" },
  "frm2200Av2020:txtSched1_1A_2024_ATR": { value: "0.22", text: "22%" },
  "frm2200Av2020:txtSched1_1B_2020_ATR": { value: "24.34", text: "24.34" },
  "frm2200Av2020:txtSched1_1B_2020B_ATR": { value: "42.00", text: "42.00" },
  "frm2200Av2020:txtSched1_1B_2021_ATR": { value: "47.00", text: "47.00" },
  "frm2200Av2020:txtSched1_1B_2022_ATR": { value: "52.00", text: "52.00" },
  "frm2200Av2020:txtSched1_1B_2023_ATR": { value: "59.00", text: "59.00" },
  "frm2200Av2020:txtSched1_1B_2024_ATR": { value: "66.00", text: "66.00" },
  "frm2200Av2020:txtSched1_2A_2020_ATR": { value: "328.98", text: "328.98" },
  "frm2200Av2020:txtSched1_2A_2020B_ATR": { value: "50.00", text: "50.00" },
  "frm2200Av2020:txtSched1_2A_2021_ATR": { value: "53.00", text: "53.00" },
  "frm2200Av2020:txtSched1_2A_2022_ATR": { value: "56.18", text: "56.18" },
  "frm2200Av2020:txtSched1_2A_2023_ATR": { value: "59.55", text: "59.55" },
  "frm2200Av2020:txtSched1_2A_2024_ATR": { value: "63.12", text: "63.12" },
  "frm2200Av2020:txtSched1_2A_2020A_ATR": { value: "921.15", text: "921.15" },
  "frm2200Av2020:txtSched1_2A_2020B2_ATR": { value: "50.00", text: "50.00" },
  "frm2200Av2020:txtSched1_2A_2021B_ATR": { value: "53.00", text: "53.00" },
  "frm2200Av2020:txtSched1_2A_2022B_ATR": { value: "56.18", text: "56.18" },
  "frm2200Av2020:txtSched1_2A_2023B_ATR": { value: "59.55", text: "59.55" },
  "frm2200Av2020:txtSched1_2A_2024B_ATR": { value: "63.12", text: "63.12" },
  "frm2200Av2020:txtSched1_2B_2020_ATR": { value: "39.48", text: "39.48" },
  "frm2200Av2020:txtSched1_2B_2020B_ATR": { value: "50.00", text: "50.00" },
  "frm2200Av2020:txtSched1_2B_2021_ATR": { value: "53.00", text: "53.00" },
  "frm2200Av2020:txtSched1_2B_2022_ATR": { value: "56.18", text: "56.18" },
  "frm2200Av2020:txtSched1_2B_2023_ATR": { value: "59.55", text: "59.55" },
  "frm2200Av2020:txtSched1_2B_2024_ATR": { value: "63.12", text: "63.12" },
  "frm2200Av2020:txtSched1_2C_2020_ATR": { value: "78.96", text: "78.96" },
  "frm2200Av2020:txtSched1_2C_2020B_ATR": { value: "50.00", text: "50.00" },
  "frm2200Av2020:txtSched1_2C_2021_ATR": { value: "53.00", text: "53.00" },
  "frm2200Av2020:txtSched1_2C_2022_ATR": { value: "56.18", text: "56.18" },
  "frm2200Av2020:txtSched1_2C_2023_ATR": { value: "59.55", text: "59.55" },
  "frm2200Av2020:txtSched1_2C_2024_ATR": { value: "63.12", text: "63.12" },
  "frm2200Av2020:txtSched1_2D_2020_ATR": { value: "0.0", text: "Taxed as distilled spirits" },
  "frm2200Av2020:txtSched1_2D_2020B_ATR": { value: "50.00", text: "50.00" },
  "frm2200Av2020:txtSched1_2D_2021_ATR": { value: "53.00", text: "53.00" },
  "frm2200Av2020:txtSched1_2D_2022_ATR": { value: "56.18", text: "56.18" },
  "frm2200Av2020:txtSched1_2D_2023_ATR": { value: "59.55", text: "59.55" },
  "frm2200Av2020:txtSched1_2D_2024_ATR": { value: "63.12", text: "63.12" },
  "frm2200Av2020:txtSched1_3A_2020_ATR": { value: "26.43", text: "26.43" },
  "frm2200Av2020:txtSched1_3A_2020B_ATR": { value: "35.00", text: "35.00" },
  "frm2200Av2020:txtSched1_3A_2021_ATR": { value: "37.00", text: "37.00" },
  "frm2200Av2020:txtSched1_3A_2022_ATR": { value: "39.00", text: "39.00" },
  "frm2200Av2020:txtSched1_3A_2023_ATR": { value: "41.00", text: "41.00" },
  "frm2200Av2020:txtSched1_3A_2024_ATR": { value: "43.00", text: "43.00" },
  "frm2200Av2020:txtSched1_3A_2020A_ATR": { value: "26.43", text: "26.43" },
  "frm2200Av2020:txtSched1_3B_2020B2_ATR": { value: "35.00", text: "35.00" },
  "frm2200Av2020:txtSched1_3A_2021B_ATR": { value: "37.00", text: "37.00" },
  "frm2200Av2020:txtSched1_3A_2022B_ATR": { value: "39.00", text: "39.00" },
  "frm2200Av2020:txtSched1_3A_2023B_ATR": { value: "41.00", text: "41.00" },
  "frm2200Av2020:txtSched1_3A_2024B_ATR": { value: "43.00", text: "43.00" },
  "frm2200Av2020:txtSched1_3B_2020_ATR": { value: "36.85", text: "36.85" },
  "frm2200Av2020:txtSched1_3B_2020B_ATR": { value: "35.00", text: "35.00" },
  "frm2200Av2020:txtSched1_3B_2021_ATR": { value: "37.00", text: "37.00" },
  "frm2200Av2020:txtSched1_3B_2022_ATR": { value: "39.00", text: "39.00" },
  "frm2200Av2020:txtSched1_3B_2023_ATR": { value: "41.00", text: "41.00" },
  "frm2200Av2020:txtSched1_3B_2024_ATR": { value: "43.00", text: "43.00" },
  "exciseTaxColumnH": { value: "0.05", text: "5%" },
  "vatColumnI": { value: "0.12", text: "12%" },
  "frm2550ds:vatRate": { value: "12.00%", text: "" },
  "frm2550qv2024:hiddenVatRate": { value: "12.0", text: "" },
};

export interface EBirFormEligibility {
  /** VAT-registered only (2550 series). */
  requiresVat?: boolean;
  /** Non-VAT only; also hidden when taxpayer is on the 8% flat income tax (exempt from percentage tax). */
  requiresNonVat?: boolean;
  /** Hide for 8% flat income taxpayers (percentage-tax forms). */
  exemptIf8Percent?: boolean;
  /** Restrict to individual / non-individual taxpayers. */
  taxpayerType?: 'individual' | 'corporation' | 'any';
  /** Only when the business has employees (compensation withholding / fringe benefit). */
  requiresEmployees?: boolean;
  /** Only for Top Withholding Agents (or corporations, which are routinely required to withhold). */
  requiresWithholding?: boolean;
  /** EOPT Act (RA 11976) Micro-tier only (Form 1701MS). */
  requiresMicroTier?: boolean;
  /** Only for excisable industries (alcohol, tobacco, fuel, mining, automobiles, etc.). */
  requiresExciseIndustry?: boolean;
  /** Situational forms shown in an "Others (as applicable)" group rather than the main list. */
  adhoc?: boolean;
  /** Corporate income-tax regimes this annual form applies to. */
  corporateRegime?: Array<string>;
}

export interface EBirFormOption {
  id: string;
  title: string;
  period: 'monthly' | 'quarterly' | 'annual' | 'adhoc';
  category: 'vat' | 'percentage' | 'withholding' | 'income' | 'payment' | 'excise' | 'capital' | 'transfer';
  /** Eligibility rules used to filter the dropdown by the active business profile. */
  eligibility?: EBirFormEligibility;
  /** Short reason shown when a form is filtered out (for debugging / "show all" tooltip). */
  hiddenReason?: string;
}

/**
 * Full eBIRForms v7.9.6.2 form catalog (84 form variants) with eligibility metadata
 * derived from each form's BIR applicability. Filter with getApplicableEBirForms().
 */
export const EBIR_FORMS: EBirFormOption[] = [
  // ---- Payment (always available) ----
  { id: '0605', title: 'BIR Form 0605 — Payment Form', period: 'adhoc', category: 'payment' },

  // ---- VAT (VAT-registered only; latest 2550Q v2024 — monthly 2550M discontinued) ----
  { id: '2550Q', title: 'BIR Form 2550Q — Quarterly Value-Added Tax Return', period: 'quarterly', category: 'vat', eligibility: { requiresVat: true }, hiddenReason: 'Requires VAT registration' },

  // ---- Percentage Tax (non-VAT, not on 8% flat; monthly 2551M discontinued) ----
  { id: '2551Q', title: 'BIR Form 2551Q — Quarterly Percentage Tax Return', period: 'quarterly', category: 'percentage', eligibility: { requiresNonVat: true, exemptIf8Percent: true }, hiddenReason: 'Non-VAT only; 8% flat taxpayers are exempt' },

  // ---- Individual Income Tax (latest v2018 / EOPT MS) ----
  { id: '1701Q', title: 'BIR Form 1701Q — Quarterly Income Tax Return (Individual)', period: 'quarterly', category: 'income', eligibility: { taxpayerType: 'individual', exemptIf8Percent: true }, hiddenReason: 'Individual; 8% flat taxpayers file annual only' },
  { id: '1701', title: 'BIR Form 1701 — Annual Income Tax Return (Individual / Mixed Income, Itemized)', period: 'annual', category: 'income', eligibility: { taxpayerType: 'individual' }, hiddenReason: 'Individual taxpayers only' },
  { id: '1701A', title: 'BIR Form 1701A — Annual Income Tax Return (Individual Purely Business/Profession, OSD or 8%)', period: 'annual', category: 'income', eligibility: { taxpayerType: 'individual' }, hiddenReason: 'Individual taxpayers only' },
  { id: '1701MS', title: 'BIR Form 1701MS — Annual Income Tax Return for Micro-Taxpayers (EOPT Act RA 11976)', period: 'annual', category: 'income', eligibility: { taxpayerType: 'individual', requiresMicroTier: true }, hiddenReason: 'EOPT Micro-tier taxpayers only' },

  // ---- Corporate Income Tax (latest v2018C) ----
  { id: '1702Q', title: 'BIR Form 1702Q — Quarterly Income Tax Return (Corporation/Partnership)', period: 'quarterly', category: 'income', eligibility: { taxpayerType: 'corporation' }, hiddenReason: 'Corporations/partnerships only' },
  { id: '1702RT', title: 'BIR Form 1702-RT — Annual Income Tax Return (Regular Rate: 20% MSME / 25% RCIT)', period: 'annual', category: 'income', eligibility: { taxpayerType: 'corporation', corporateRegime: ['corp_20_msme', 'corp_20_osd', 'corp_25_regular', 'corp_25_osd'] }, hiddenReason: 'Regular-rate corporations only' },
  { id: '1702EX', title: 'BIR Form 1702-EX — Annual Income Tax Return (Exempt Corporation / GPP / Cooperative)', period: 'annual', category: 'income', eligibility: { taxpayerType: 'corporation', corporateRegime: ['corp_gpp_exempt'] }, hiddenReason: 'Exempt corporations / GPP only' },
  { id: '1702MX', title: 'BIR Form 1702-MX — Annual Income Tax Return (Mixed Income / Special Rates: 5% GIE, EOPT 15%)', period: 'annual', category: 'income', eligibility: { taxpayerType: 'corporation', corporateRegime: ['corp_special_5'] }, hiddenReason: 'Special-rate / mixed-income corporations only' },

  // ---- Compensation Withholding (latest 1601-C v2018 / 1604-C) ----
  { id: '1601-C', title: 'BIR Form 1601-C — Monthly Remittance of Withholding Tax on Compensation', period: 'monthly', category: 'withholding', eligibility: { requiresEmployees: true }, hiddenReason: 'Requires employees' },
  { id: '1604-C', title: 'BIR Form 1604-C — Annual Information Return of Income Taxes Withheld on Compensation', period: 'annual', category: 'withholding', eligibility: { requiresEmployees: true }, hiddenReason: 'Requires employees' },

  // ---- Expanded Withholding (latest 0619-E / 1601-EQ / 1604-E v2018) ----
  { id: '0619-E', title: 'BIR Form 0619-E — Monthly Remittance of Creditable/Expanded Withholding Tax', period: 'monthly', category: 'withholding', eligibility: { requiresWithholding: true }, hiddenReason: 'Required for Top Withholding Agents / corporations' },
  { id: '1601-EQ', title: 'BIR Form 1601-EQ — Quarterly Remittance of Creditable/Expanded Withholding Tax', period: 'quarterly', category: 'withholding', eligibility: { requiresWithholding: true }, hiddenReason: 'Required for Top Withholding Agents / corporations' },
  { id: '1604-E', title: 'BIR Form 1604-E — Annual Information Return of Creditable Income Taxes Withheld (Expanded)', period: 'annual', category: 'withholding', eligibility: { requiresWithholding: true }, hiddenReason: 'Required for Top Withholding Agents / corporations' },

  // ---- Fringe Benefit Tax (corporations with managerial/supervisory employees) ----
  { id: '1603', title: 'BIR Form 1603 — Quarterly Remittance of Fringe Benefits Tax Withheld', period: 'quarterly', category: 'withholding', eligibility: { taxpayerType: 'corporation', requiresEmployees: true }, hiddenReason: 'Corporations with managerial employees' },
];


/** Normalize a VAT registration value from either Client.vatType or BusinessProfile.vatRegistrationType. */
function isVatRegistered(profile: { vatRegistrationType?: string; vatType?: string } | null | undefined): boolean {
  const v = (profile?.vatRegistrationType || profile?.vatType || '').toString().toLowerCase();
  return v === 'vat' || v === 'vatable' || v.startsWith('vat');
}

/** True when the taxpayer is an individual on the 8% flat income tax (exempt from percentage tax & quarterly ITR). */
function is8PercentFlat(profile: { incomeTaxRegime?: string; deductionMethod?: string } | null | undefined): boolean {
  return profile?.incomeTaxRegime === '8_percent_flat' || profile?.deductionMethod === 'none_8_percent';
}

function normalizedTaxpayerClass(profile: { taxpayerClassification?: string } | null | undefined): 'individual' | 'non-individual' | 'unknown' {
  const c = String(profile?.taxpayerClassification || '').trim().toLowerCase().replace(/[ _]+/g, '-');
  if (!c) return 'unknown';
  if (c.startsWith('non-individual') || c.includes('corporation') || c.includes('partnership') || c.includes('cooperative') || c === 'nonindividual') return 'non-individual';
  if (c === 'individual' || c.startsWith('individual-') || c.startsWith('individual ')) return 'individual';
  return 'unknown';
}

function isIndividual(profile: { taxpayerClassification?: string; taxpayerSubClassification?: string } | null | undefined): boolean {
  const classification = normalizedTaxpayerClass(profile);
  if (classification !== 'unknown') return classification === 'individual';
  return ['sole_proprietor', 'professional', 'mixed_income'].includes(String(profile?.taxpayerSubClassification || '').trim().toLowerCase());
}

function isCorporation(profile: { taxpayerClassification?: string; taxpayerSubClassification?: string } | null | undefined): boolean {
  const classification = normalizedTaxpayerClass(profile);
  if (classification !== 'unknown') return classification === 'non-individual';
  return ['corporation_regular', 'corporation_msme', 'domestic_corp', 'msme_corp', 'opc', 'partnership', 'gpp', 'cooperative'].includes(String(profile?.taxpayerSubClassification || '').trim().toLowerCase());
}

const EXCISE_INDUSTRIES = ['alcohol', 'tobacco', 'cigarette', 'petroleum', 'fuel', 'mining', 'mineral', 'automobile', 'car', 'sweetened', 'beverage', 'excise', 'distillery', 'brewery'];

function isExciseIndustry(profile: { industry?: string } | null | undefined): boolean {
  const ind = (profile?.industry || '').toString().toLowerCase();
  return EXCISE_INDUSTRIES.some(k => ind.includes(k));
}

export interface ApplicableFormsResult {
  /** Forms routinely required for this business profile (main dropdown group). */
  routine: EBirFormOption[];
  /** Situational forms shown in an "Others (as applicable)" group. */
  adhoc: EBirFormOption[];
  /** Forms hidden by the filter (with reason), for "show all" / debugging. */
  hidden: Array<{ form: EBirFormOption; reason: string }>;
}

/**
 * Filter the full eBIRForms catalog by the active business profile:
 * VAT type, income-tax regime (8% flat vs graduated vs corporate), EOPT tier
 * (Micro → 1701MS), employees (compensation withholding), Top Withholding
 * Agent status (expanded/final withholding), and excise industry.
 */
export function getApplicableEBirForms(
  profile: {
    vatRegistrationType?: string;
    vatType?: string;
    taxpayerClassification?: string;
    taxpayerSubClassification?: string;
    incomeTaxRegime?: string;
    taxpayerTier?: string;
    hasEmployees?: boolean;
    isTopWithholdingAgent?: boolean;
    industry?: string;
    additionalBirForms?: string[];
    deductionMethod?: string;
  } | null | undefined,
  options: { includeAdhoc?: boolean } = {}
): ApplicableFormsResult {
  const vat = isVatRegistered(profile);
  const flat8 = is8PercentFlat(profile);
  const individual = isIndividual(profile);
  const corporation = isCorporation(profile);
  const hasEmployees = !!profile?.hasEmployees;
  const topWTA = !!profile?.isTopWithholdingAgent;
  const microTier = profile?.taxpayerTier === 'micro';
  const excise = isExciseIndustry(profile);
  // Withholding forms: routinely required for Top WTAs, corporations, or any business with employees.
  const requiresWithholding = topWTA || corporation || hasEmployees;
  const subClass = String(profile?.taxpayerSubClassification || '').toLowerCase();
  // Infer a corporate regime from the selected classification/subtype when the
  // more specific income-tax regime has not been set in Client/Business Info.
  const inferredRegimeBySubClass: Record<string, string> = {
    corporation_msme: 'corp_20_msme',
    msme_corp: 'corp_20_msme',
    corporation_regular: 'corp_25_regular',
    domestic_corp: 'corp_25_regular',
    gpp: 'corp_gpp_exempt',
    cooperative: 'corp_gpp_exempt',
  };
  const regime = profile?.incomeTaxRegime || inferredRegimeBySubClass[subClass] || '';

  const routine: EBirFormOption[] = [];
  const adhoc: EBirFormOption[] = [];
  const hidden: Array<{ form: EBirFormOption; reason: string }> = [];

  for (const form of EBIR_FORMS) {
    const e = form.eligibility || {};
    let reason = '';
    if (e.requiresVat && !vat) reason = form.hiddenReason || 'Requires VAT registration';
    else if (e.requiresNonVat && vat) reason = form.hiddenReason || 'Non-VAT businesses only';
    else if (e.exemptIf8Percent && flat8) reason = form.hiddenReason || '8% flat taxpayers are exempt from this form';
    else if (e.taxpayerType === 'individual' && !individual) reason = form.hiddenReason || 'Individual taxpayers only';
    else if (e.taxpayerType === 'corporation' && !corporation) reason = form.hiddenReason || 'Corporations/partnerships only';
    else if (e.requiresEmployees && !hasEmployees) reason = form.hiddenReason || 'Requires employees';
    else if (e.requiresWithholding && !requiresWithholding) reason = form.hiddenReason || 'Required for Top Withholding Agents / corporations';
    else if (e.requiresMicroTier && !microTier) reason = form.hiddenReason || 'EOPT Micro-tier only';
    else if (e.requiresExciseIndustry && !excise) reason = form.hiddenReason || 'Excisable-industry only';
    else if (e.corporateRegime && e.corporateRegime.length > 0 && regime && !e.corporateRegime.includes(regime)) reason = form.hiddenReason || 'Does not match selected corporate income-tax regime';

    if (reason) {
      hidden.push({ form, reason });
    } else if (e.adhoc && !options.includeAdhoc) {
      adhoc.push(form);
    } else {
      routine.push(form);
    }
  }

  // Stable ordering: routine by category, then adhoc.
  const order: Record<string, number> = { income: 0, vat: 1, percentage: 2, withholding: 3, payment: 4, excise: 5, capital: 6, transfer: 7 };
  routine.sort((a, b) => (order[a.category] ?? 9) - (order[b.category] ?? 9) || a.id.localeCompare(b.id));
  adhoc.sort((a, b) => (order[a.category] ?? 9) - (order[b.category] ?? 9) || a.id.localeCompare(b.id));

  // Select the annual individual return based on the client’s subtype and regime.
  if (individual) {
    const pureBusinessOrProfession = ['sole_proprietor', 'professional'].includes(subClass);
    const mixedIncome = subClass === 'mixed_income';
    const deductionMethod = String(profile?.deductionMethod || '').toLowerCase();
    const usesOsdOrEightPercent = ['graduated_osd', '8_percent_flat'].includes(regime)
      || ['osd', 'osd_40', 'none_8_percent'].includes(deductionMethod);
    const hasIndividualReturnClues = Boolean(subClass || regime || deductionMethod);
    if (hasIndividualReturnClues) {
      const keep1701A = pureBusinessOrProfession ? usesOsdOrEightPercent
        : mixedIncome ? false
        : usesOsdOrEightPercent;
      const keep1701 = mixedIncome ? true
        : pureBusinessOrProfession ? !usesOsdOrEightPercent
        : !usesOsdOrEightPercent;
      for (let i = routine.length - 1; i >= 0; i--) {
        if (routine[i].id === '1701A' && !keep1701A) routine.splice(i, 1);
        if (routine[i].id === '1701' && !keep1701) routine.splice(i, 1);
      }
    }
  }

  // User-added additional BIR forms (from Client / Business Information page)
  // always appear as applicable — even if the eligibility filter would hide them.
  const extraCodes = (profile?.additionalBirForms || []).map(c => String(c).trim().toUpperCase()).filter(Boolean);
  if (extraCodes.length) {
    const extraSet = new Set(extraCodes);
    const inRoutine = new Set(routine.map(f => f.id.toUpperCase()));
    const individualOnlyCodes = new Set(['1701', '1701A', '1701Q', '1701MS']);
    const corporateOnlyCodes = new Set(['1702Q', '1702RT', '1702-RT', '1702EX', '1702-EX', '1702MX', '1702-MX']);
    const allowedByTaxpayerType = (code: string) => {
      const normalized = code.toUpperCase();
      if (individualOnlyCodes.has(normalized) && !individual) return false;
      if (corporateOnlyCodes.has(normalized) && !corporation) return false;
      return true;
    };
    for (const f of EBIR_FORMS) {
      if (extraSet.has(f.id.toUpperCase()) && !inRoutine.has(f.id.toUpperCase()) && allowedByTaxpayerType(f.id)) {
        routine.push(f);
        inRoutine.add(f.id.toUpperCase());
      }
    }
    for (const code of extraCodes) {
      if (!inRoutine.has(code) && allowedByTaxpayerType(code)) {
        routine.push({ id: code, title: `BIR Form ${code} (user-added)`, period: 'adhoc', category: 'payment' });
        inRoutine.add(code);
      }
    }
    routine.sort((a, b) => (order[a.category] ?? 9) - (order[b.category] ?? 9) || a.id.localeCompare(b.id));
  }

  return { routine, adhoc, hidden };
}

export interface EBirLedgerData {
  salesTotal: number;
  vatableSales: number;
  zeroRatedSales: number;
  exemptSales: number;
  outputTax: number;
  purchasesTotal: number;
  vatablePurchases: number;
  inputTax: number;
  capitalGoodsInputTax: number;
  servicesInputTax: number;
  goodsInputTax: number;
  ewtTotal: number;
  ewtByAtc: Array<{ atcCode: string; baseAmount: number; rate: number; taxWithheld: number }>;
  compensationWithholding: number;
  expensesTotal: number;
}

export interface EBirFormValues {
  formType: string;
  year: number;
  month?: number;
  quarter?: number;
  tin: string;
  rdoCode: string;
  registeredName: string;
  tradeName: string;
  address: string;
  lineItems: Array<{ label: string; value: number; itemNo: string }>;
  totalTaxPayable: number;
  currency: 'PHP';
}

const fmt2 = (n: number) => (Number(n) || 0).toFixed(2);
const esc = (s: any) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Compute the key numeric line items for a BIR form from ledger data and client workflow profile. */
export function computeEBirFormValues(
  formType: string,
  period: { year: number; month?: number; quarter?: number },
  client: Partial<Client>,
  ledger: EBirLedgerData,
): EBirFormValues {
  const wf = resolveBusinessWorkflow(client);
  const normalizedFormType = formType.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const tin = String(client.tin || '').replace(/\D/g, '').slice(0, 9).padStart(9, '0');
  const lineItems: EBirFormValues['lineItems'] = [];
  let totalTaxPayable = 0;

  if (formType === '2550M' || formType === '2550Q') {
    const isVat = wf.vatRegistrationType === 'vat';
    const isZeroRated = wf.vatRegistrationType === 'zero-rated';
    const outputTax = isVat ? ledger.outputTax : 0;
    const inputTax = isVat || isZeroRated ? ledger.inputTax : 0;
    lineItems.push({ itemNo: '14', label: `Output Tax (${isVat ? '12% on taxable sales' : wf.vatLabel})`, value: outputTax });
    lineItems.push({ itemNo: '18A', label: 'Input Tax on Purchases of Goods', value: isVat || isZeroRated ? ledger.goodsInputTax : 0 });
    lineItems.push({ itemNo: '18B', label: 'Input Tax on Purchases of Services', value: isVat || isZeroRated ? ledger.servicesInputTax : 0 });
    lineItems.push({ itemNo: '18C', label: 'Input Tax on Capital Goods', value: isVat || isZeroRated ? ledger.capitalGoodsInputTax : 0 });
    lineItems.push({ itemNo: '20', label: 'Total Allowable Input Tax', value: inputTax });
    totalTaxPayable = Math.max(0, outputTax - inputTax);
    lineItems.push({ itemNo: '21', label: 'VAT Payable / (Overpayment)', value: totalTaxPayable });
  } else if (formType === '2551Q') {
    const busTax = computeBusinessTax({
      grossSales: ledger.salesTotal,
      vatRegistrationType: wf.vatRegistrationType,
      incomeTaxRegime: wf.incomeTaxRegime,
      percentageTaxRate: wf.percentageTaxRate,
    });
    const pctRateDisplay = +(busTax.percentageTaxRate * 100).toFixed(2);
    lineItems.push({ itemNo: '15', label: 'Taxable Amount (Gross Receipts)', value: ledger.salesTotal });
    lineItems.push({ itemNo: '16', label: `Tax Rate ${pctRateDisplay}%`, value: pctRateDisplay });
    lineItems.push({ itemNo: '17', label: 'Tax Due', value: busTax.percentageTaxDue });
    totalTaxPayable = busTax.percentageTaxDue;
  } else if (formType === '0619-E' || formType === '1601-EQ') {
    let total = 0;
    for (const e of ledger.ewtByAtc) {
      lineItems.push({ itemNo: e.atcCode, label: e.atcCode + ' — base ' + fmt2(e.baseAmount) + ' @ ' + e.rate + '%', value: e.taxWithheld });
      total += e.taxWithheld;
    }
    totalTaxPayable = total;
    lineItems.push({ itemNo: 'TOTAL', label: 'Total Taxes Withheld', value: total });
  } else if (formType === '1601-C') {
    lineItems.push({ itemNo: '16', label: 'Total Compensation Withholding Tax', value: ledger.compensationWithholding });
    totalTaxPayable = ledger.compensationWithholding;
  } else if (
    formType === '1701Q' ||
    formType === '1701' ||
    formType === '1701A' ||
    formType === '1702Q' ||
    normalizedFormType === '1702RT' ||
    normalizedFormType === '1702EX' ||
    normalizedFormType === '1702MX'
  ) {
    const isCorporateForm = formType.startsWith('1702');
    const itr = computeIncomeTaxByRegime({
      grossSalesOrReceipts: ledger.salesTotal,
      costOfSalesOrServices: ledger.purchasesTotal,
      itemizedOperatingExpenses: ledger.expensesTotal,
      taxpayerClassification: isCorporateForm ? 'Non-Individual' : wf.classification,
      taxpayerSubClassification:
        normalizedFormType === '1702EX'
          ? 'gpp'
          : isCorporateForm && wf.classification === 'Individual'
            ? 'corporation_msme'
            : wf.subClassification,
      vatRegistrationType: wf.vatRegistrationType,
      incomeTaxRegime:
        normalizedFormType === '1702EX'
          ? 'corp_gpp_exempt'
          : normalizedFormType === '1702MX'
            ? 'corp_special_5'
            : isCorporateForm && !wf.incomeTaxRegime.startsWith('corp_')
              ? wf.deductionMethod === 'osd_40'
                ? 'corp_20_osd'
                : 'corp_20_msme'
              : wf.incomeTaxRegime,
      deductionMethod: wf.deductionMethod,
      totalAssetsExcludingLand: client.totalAssetsExcludingLand,
      yearsOfOperation: client.yearsOfOperation,
    });

    lineItems.push({ itemNo: '19', label: 'Gross Sales / Receipts', value: itr.grossSalesOrReceipts });
    lineItems.push({ itemNo: '20', label: wf.costSectionLabel, value: itr.costOfSalesOrServices });
    lineItems.push({
      itemNo: '25',
      label:
        itr.deductionMethod === 'osd_40'
          ? 'Optional Standard Deduction (40% OSD)'
          : itr.deductionMethod === 'none_8_percent'
            ? 'Exempt Threshold (8% Flat Regime)'
            : 'Total Allowable Itemized Deductions',
      value:
        itr.deductionMethod === 'none_8_percent'
          ? itr.exemptThresholdApplied
          : itr.allowableDeduction,
    });
    lineItems.push({ itemNo: '26', label: 'Net Taxable Income', value: itr.netTaxableIncome });
    totalTaxPayable = itr.netIncomeTaxPayable;
    const regimeDesc =
      itr.regime === '8_percent_flat'
        ? '8% Flat Income Tax'
        : itr.regime === 'graduated_osd'
          ? 'TRAIN Graduated + 40% OSD'
          : itr.regime === 'graduated_itemized'
            ? 'TRAIN Graduated + Itemized'
            : itr.regime === 'corp_gpp_exempt'
              ? '0% Exempt / GPP'
              : itr.regime === 'corp_special_5'
                ? '5% Special GIE'
                : itr.mcitApplied
                  ? `MCIT (exceeds ${(itr.effectiveTaxRate * 100).toFixed(0)}% RCIT)`
                  : `${(itr.effectiveTaxRate * 100).toFixed(0)}% Corporate Income Tax`;
    lineItems.push({ itemNo: '27', label: `Income Tax Due (${regimeDesc})`, value: totalTaxPayable });
  }

  return {
    formType,
    year: period.year,
    month: period.month,
    quarter: period.quarter,
    tin,
    rdoCode: String(client.rdoCode || ''),
    registeredName: client.registeredName || client.name || '',
    tradeName: client.tradeName || client.name || '',
    address: client.address || '',
    lineItems,
    totalTaxPayable,
    currency: 'PHP',
  };
}

/** Official VAT rate cells (from taxRate.xml) — used by 2550M/2550Q. */
export const EBIR_VAT_RATE = Number(TAX_RATE_CELLS['frm2550qv2024:hiddenVatRate']?.value || 12) / 100; // 0.12

/** Build the official cell-ID list for a form (subset of TAX_RATE_CELLS for that form). */
export function taxRateCellsForForm(formId: string) {
  const prefix = 'frm' + formId.toLowerCase();
  return Object.entries(TAX_RATE_CELLS).filter(([k]) => k.toLowerCase().startsWith(prefix));
}

/** Official form versions (from generated sample: 2550Qv2024). */
export const EBIR_FORM_VERSIONS: Record<string, string> = {
  '2550Q': 'v2024', '2550M': 'v2024', '2551Q': 'v2018', '0619-E': 'v2018',
  '1601-EQ': 'v2018', '1601-C': 'v2018', '1701Q': 'v2018', '1701': 'v2018', '1701A': 'v2018',
  '1702Q': 'v2018C', '1702RT': 'v2018C', '1702-RT': 'v2018C', '1702EX': 'v2018C', '1702-EX': 'v2018C', '1702MX': 'v2018C', '1702-MX': 'v2018C', '0605': '',
};
/** Official eBIRForms cell-ID prefix: frm{formLower}{version}, e.g. frm2550qv2024. */
export function ebirCellPrefix(formType: string): string {
  // The 1702-RT v2018C save-file uses the legacy case-sensitive field prefix
  // `frm1702RT` (without the version suffix), as confirmed by the supplied
  // eBIRForms v7.9.6.2 saved-return samples.
  const normalized = formType.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (normalized === '1702RT') return 'frm1702RT';
  const v = EBIR_FORM_VERSIONS[formType] || EBIR_FORM_VERSIONS[normalized] || 'v2018';
  return 'frm' + formType.toLowerCase().replace(/[^a-z0-9]/g, '') + v;
}

const urlEnc = (s: any) => encodeURIComponent(String(s ?? '')).replace(/'/g, '%27');
const numFmt = (n: number) => (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const birWholePeso = (n: number) => Math.round(Number(n) || 0).toLocaleString('en-US');
const xmlText = (value: string) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Build the first-pass 1702-RT v2018C payload using the exact case-sensitive
 * cell IDs present in the supplied offline eBIRForms v7.9.6.2 sample files.
 * This form is deliberately conservative: aggregate ledger expenses are shown
 * as a review-required "Others" line, while unavailable tax credits/MCIT are
 * left at zero. It is a draft export and must be reconciled in eBIRForms.
 */
function build1702RTSaveFields(values: EBirFormValues, ledger: EBirLedgerData, currentClient?: any): Array<{ cellId: string; value: string }> {
  const fields = EBIR_1702RT_FIELD_DEFAULTS.map(field => ({ ...field }));
  const byId = new Map(fields.map(field => [field.cellId, field]));
  const set = (cellId: string, value: any) => {
    const field = byId.get(cellId);
    if (field) field.value = String(value ?? '');
  };
  const clientTin = String(currentClient?.tin || values.tin || '').replace(/\D/g, '');
  const tin = clientTin.slice(0, 9).padStart(9, '0');
  const branchCode = (clientTin.length > 9 ? clientTin.slice(9, 12) : String(currentClient?.branchCode || '000')).replace(/\D/g, '').slice(0, 3).padStart(3, '0');
  const name = String(values.registeredName || '');
  const address = String(values.address || '');
  const fiscal = String(currentClient?.accountingType || '').toLowerCase() === 'fiscal';
  const monthRaw = currentClient?.fiscalYearEndMonth ?? currentClient?.yearEndMonth ?? currentClient?.accountingYearEndMonth ?? 12;
  const month = Math.min(12, Math.max(1, Number(monthRaw) || 12));
  const workflow = resolveBusinessWorkflow(currentClient);
  const isOsd = workflow.deductionMethod === 'osd_40';
  const sales = Number(ledger.salesTotal) || 0;
  const cost = Number(ledger.purchasesTotal) || 0;
  const grossIncome = sales - cost;
  const otherTaxable = 0;
  const totalGross = grossIncome + otherTaxable;
  const bookExpenses = Math.max(0, Number(ledger.expensesTotal) || 0);
  const itemizedExpenses = isOsd ? 0 : bookExpenses;
  const specialAllowable = 0;
  const nolco = 0;
  const osd = isOsd ? Math.max(0, grossIncome) * 0.4 : 0;
  const totalDeductions = itemizedExpenses + specialAllowable + nolco + osd;
  const netTaxable = Math.max(0, totalGross - totalDeductions);
  const taxDue = Math.max(0, Number(values.totalTaxPayable) || 0);
  const taxRate = String(workflow.incomeTaxRegime || '').includes('20') ? '20' : '25';
  const rdo = String(values.rdoCode || currentClient?.rdoCode || '');
  const phone = String(currentClient?.phone || currentClient?.contactNumber || '');
  const email = String(currentClient?.email || '');
  const registrationDate = String(currentClient?.incorporationDate || currentClient?.dateOfRegistration || currentClient?.registrationDate || '');

  // Period and taxpayer identity. TIN is stored in three 3-digit groups plus
  // the 3-digit branch code, matching the actual saved-file field names.
  set('frm1702RT:rdoPg1I1Calendar', String(!fiscal));
  set('frm1702RT:rdoPg1I1Fiscal', String(fiscal));
  set('frm1702RT:ddlPg1I2Month', String(month));
  set('frm1702RT:txtPg1I2Year', String(values.year % 100).padStart(2, '0'));
  set('frm1702RT:rdoPg1I3AmmendYes', 'false');
  set('frm1702RT:rdoPg1I3AmmendNo', 'true');
  set('frm1702RT:rdoPg1I4ShortPeriodYes', 'false');
  set('frm1702RT:rdoPg1I4ShortPeriodNo', 'true');
  set('frm1702RT:rdoPg1I5Atc', 'true');
  set('frm1702RT:drpPg1I5AtcOther', String(currentClient?.incomeTaxAtc || currentClient?.atcCode || 'IC010'));
  set('frm1702RT:rdoPg1I5AtcOther', 'true');
  set('frm1702RT:txtPg1Pt1I6TIN1', tin.slice(0, 3));
  set('frm1702RT:txtPg1Pt1I6TIN2', tin.slice(3, 6));
  set('frm1702RT:txtPg1Pt1I6TIN3', tin.slice(6, 9));
  set('frm1702RT:txtPg1Pt1I6TIN4', branchCode);
  set('BranchMaskP1', '00000');
  set('frm1702RT:txtRDO', rdo);
  set('frm1702RT:drpPg1Pt1I7RDOCode', rdo);
  set('frm1702RT:txtPg1Pt1I8Name1', urlEnc(name));
  set('frm1702RT:txtPg1Pt1I8Name2', '');
  set('frm1702RT:txtPg1Pt1I8Name3', '');
  set('frm1702RT:txtPg1Pt1I9Address1', urlEnc(address));
  set('frm1702RT:txtPg1Pt1I9Address2', '');
  set('frm1702RT:txtPg1Pt1I9Address3', '');
  set('frm1702RT:txtZIP', String(currentClient?.zipCode || currentClient?.zip || ''));
  set('frm1702RT:txtPg1Pt1I10', registrationDate);
  set('frm1702RT:txtPg1Pt1I11Contact', phone);
  set('frm1702RT:txtPg1Pt1I12Email', email);
  set('frm1702RT:rdoPg1Pt1I13ItemizedDeduction', String(!isOsd));
  set('frm1702RT:rdoPg1Pt1I13OptionalStandard', String(isOsd));

  // Main return totals. Credits, penalties, and carryovers remain zero because
  // the current CAPOTBOOKS ledger interface does not provide those schedules.
  set('frm1702RT:txtPg1Pt2I14IncomeTax', birWholePeso(taxDue));
  set('frm1702RT:txtPg1Pt2I15TotalTaxCredits', '0');
  set('frm1702RT:txtPg1Pt2I16NetTax', birWholePeso(taxDue));
  set('frm1702RT:txtPg1Pt2I17Surcharge', '0');
  set('frm1702RT:txtPg1Pt2I18Interest', '0');
  set('frm1702RT:txtPg1Pt2I19Compromise', '0');
  set('frm1702RT:txtPg1Pt2I20TotalPenalties', '0');
  set('frm1702RT:txtPg1Pt2I21TotalAmount', birWholePeso(taxDue));
  set('frm1702RT:rdoPg1Pt2I21OverpaymentRefunded', 'false');
  set('frm1702RT:rdoPg1Pt2I21OverpaymentIssued', 'false');
  set('frm1702RT:rdoPg1Pt2I21OverpaymentCarried', 'false');
  set('frm1702RT:txtPg1Pt2PagesFilled', '000');
  set('frm1702RT:txtPg2TIN1', tin.slice(0, 3));
  set('frm1702RT:txtPg2TIN2', tin.slice(3, 6));
  set('frm1702RT:txtPg2TIN3', tin.slice(6, 9));
  set('frm1702RT:txtPg2TIN4', branchCode);
  set('txtBranchMaskP2', '00000');
  set('frm1702RT:txtPg2RegisteredName', name);

  // Income computation. The app's current ledger interface has aggregate
  // purchases/expenses only, so no unsupported line-item breakdown is invented.
  set('frm1702RT:txtPg2Pt4I27Sales', birWholePeso(sales));
  set('frm1702RT:txtPg2Pt4I28LessSales', '0');
  set('frm1702RT:txtPg2Pt4I29NetSales', birWholePeso(sales));
  set('frm1702RT:txtPg2Pt4I30LessCost', birWholePeso(cost));
  set('frm1702RT:txtPg2Pt4I31GrossIncome', birWholePeso(grossIncome));
  set('frm1702RT:txtPg2Pt4I32AddOtherTaxable', '0');
  set('frm1702RT:txtPg2Pt4I33TotalGross', birWholePeso(totalGross));
  set('frm1702RT:txtPg2Pt4I34OrdinaryAllowable', birWholePeso(itemizedExpenses));
  set('frm1702RT:txtPg2Pt4I35SpecialAllowable', birWholePeso(specialAllowable));
  set('frm1702RT:txtPg2Pt4I36Nolco', birWholePeso(nolco));
  set('frm1702RT:txtPg2Pt4I37TotalItemized', birWholePeso(itemizedExpenses + specialAllowable + nolco));
  set('frm1702RT:txtPg2Pt4I38OptionalStandard', birWholePeso(osd));
  set('frm1702RT:txtPg2Pt4I39NetTaxable', birWholePeso(netTaxable));
  set('frm1702RT:Pg2Pt4I40IncomeTaxRate', taxRate);
  set('frm1702RT:txtPg2Pt4I41IncomeTaxDue', birWholePeso(taxDue));
  set('frm1702RT:txtPg2Pt4I42MinimumCorporate', '0');
  set('frm1702RT:txtPg2Pt4I43TotalIncomeTax', birWholePeso(taxDue));
  for (const id of [
    'txtPg2Pt4I44ExcessCredits', 'txtPg2Pt4I45IncomeTaxPaymentUnderMCIT',
    'txtPg2Pt4I46IncomeTaxUnderRegular', 'txtPg2Pt4I47ExcessMCIT',
    'txtPg2Pt4I48CreditableTaxWithheldFromPrevious', 'txtPg2Pt4I49CreditableTaxWithheldFor4thQuarter',
    'txtPg2Pt4I50ForeignTaxCredits', 'txtPg2Pt4I51TaxPaidInReturn', 'txtPg2Pt452SpecialTaxCredits',
    'txtPg2Pt4I53C2', 'txtPg2Pt4I54C2', 'txtPg2Pt4I55TotalTaxCredits'
  ]) set(`frm1702RT:${id}`, '0');
  set('frm1702RT:txtPg2Pt4I56NetTax', birWholePeso(taxDue));
  set('frm1702RT:txtPg2Pt4I54CtrModal', '0');
  set('frm1702RT:txtPg2Pt4I54Subtotal', '0');

  // Itemized deductions are not categorized in the available ledger summary.
  // Place the aggregate in a clearly labelled review-required "Others" line.
  // This preserves totals for reconciliation without pretending to know the
  // tax category of each expense transaction.
  set('frm1702RT:txtPg3TIN1', tin.slice(0, 3));
  set('frm1702RT:txtPg3TIN2', tin.slice(3, 6));
  set('frm1702RT:txtPg3TIN3', tin.slice(6, 9));
  set('frm1702RT:txtPg3TIN4', branchCode);
  set('txtBranchMaskP3', '00000');
  set('frm1702RT:txtPg3RegisteredName', name);
  set('frm1702RT:txtPg3Sc1I17iC1', itemizedExpenses > 0 ? 'CAPOTBOOKS EXPENSES - REVIEW CLASSIFICATION' : '');
  set('frm1702RT:txtPg3Sc1I17iC2', birWholePeso(itemizedExpenses));
  set('frm1702RT:txtPg3Sc1I17iSubtotal', birWholePeso(itemizedExpenses));
  set('frm1702RT:txtPg3Sc1I18TotalOrdinaryAllowable', birWholePeso(itemizedExpenses));
  set('frm1702RT:txtPg3Sc1I17i.1C1', '');
  set('frm1702RT:txtPg3Sc1I17i.1C2', '0');
  set('frm1702RT:txtPg3Sc1I17i.2C1', '');
  set('frm1702RT:txtPg3Sc1I17i.2C2', '0');
  set('frm1702RT:txtPg3Sc1I17i.3C1', '');
  set('frm1702RT:txtPg3Sc1I17i.3C2', '0');
  set('frm1702RT:txtPg3Sc1I17iCtrModal', '0');
  set('frm1702RT:txtPg3Sc2I5TotalSpecialAllowable', '0');

  set('frm1702RT:txtPg4TIN1', tin.slice(0, 3));
  set('frm1702RT:txtPg4TIN2', tin.slice(3, 6));
  set('frm1702RT:txtPg4TIN3', tin.slice(6, 9));
  set('frm1702RT:txtPg4TIN4', branchCode);
  set('txtBranchMaskP4', '00000');
  set('frm1702RT:txtPg4RegisteredName', name);
  // Leave the NOLCO schedule at neutral defaults: CAPOTBOOKS does not yet
  // track vintage-by-vintage loss carryovers or the required book/tax bridge.
  set('frm1702RT:txtPg4Sc5I1NetIncome', birWholePeso(grossIncome - bookExpenses));
  set('frm1702RT:txtPg4Sc5I4Total', birWholePeso(grossIncome - bookExpenses));
  set('frm1702RT:txtPg4Sc5I9Total', '0');
  set('frm1702RT:txtPg4Sc5I10NetTaxableIncome', birWholePeso(netTaxable));
  set('frm1702RT:txtCurrentPage', '1');
  set('frm1702RT:txtMaxPage', '4');
  set('txtFinalFlag', '0');
  set('txtEnroll', 'N');
  return fields;
}

/** Build the official field list (cellId -> value) for a form, in savefile order. */
export function buildOfficialSaveFields(values: EBirFormValues, ledger: EBirLedgerData, currentClient?: any): Array<{ cellId: string; value: string }> {
  if (values.formType.toUpperCase().replace(/[^A-Z0-9]/g, '') === '1702RT') {
    return build1702RTSaveFields(values, ledger, currentClient);
  }
  const p = ebirCellPrefix(values.formType);
  const tin = values.tin || '000000000';
  const tin1 = tin.slice(0, 3), tin2 = tin.slice(3, 6), tin3 = tin.slice(6, 9);
  const branch = '00000'.slice(0, 5) || '00000';
  const f: Array<{ cellId: string; value: string }> = [];
  const add = (id: string, v: any) => f.push({ cellId: `${p}:${id}`, value: String(v ?? '') });

  // --- Period / amendment flags (common) ---
  if (values.quarter) {
    add('OptQuarter1', values.quarter === 1 ? 'true' : 'false');
    add('OptQuarter2', values.quarter === 2 ? 'true' : 'false');
    add('OptQuarter3', values.quarter === 3 ? 'true' : 'false');
    add('OptQuarter4', values.quarter === 4 ? 'true' : 'false');
  } else if (values.month) {
    add('RtnMonth', String(values.month));
    add('txtMonth', String(values.month));
  }
  add('txtYear', String(values.year));
  add('txtSheets', '1');
  add('AmendedRtn_1', 'false');
  add('AmendedRtn_2', 'true');

  // --- Taxpayer block (field names vary slightly by form; emit both variants) ---
  add('txtTIN1', tin1); add('txtTIN2', tin2); add('txtTIN3', tin3);
  add('txtTin1', tin1); add('txtTin2', tin2); add('txtTin3', tin3);
  add('txtBranchCode', branch);
  add('txtRDOCode', values.rdoCode);
  add('txtRdoCode', values.rdoCode);
  add('txtTaxpayerName', urlEnc(values.registeredName));
  add('txtTaxPayerName', urlEnc(values.registeredName));
  add('txtTaxpayerName1', urlEnc(values.registeredName));
  add('txtAddress', urlEnc(values.address));
  add('txtTaxPayerAdd', urlEnc(values.address));
  const wf = resolveBusinessWorkflow(currentClient);
  const industryLabel =
    wf.industry === 'retail'
      ? 'RETAIL AND MERCHANDISING'
      : wf.industry === 'manufacturing'
        ? 'MANUFACTURING'
        : wf.industry === 'construction'
          ? 'CONSTRUCTION'
          : 'GENERAL SERVICES';
  add('txtZipCode', String(currentClient?.zipCode || ''));
  add('txtTaxPayerZip', String(currentClient?.zipCode || ''));
  add('txtTelNum', String(currentClient?.phone || ''));
  add('txtLineBus', urlEnc(industryLabel));
  add('txtDescription', urlEnc(industryLabel));

  // --- Form-specific line items ---
  if (values.formType.startsWith('2550')) {
    const isVat = wf.vatRegistrationType === 'vat';
    const isZeroRated = wf.vatRegistrationType === 'zero-rated';
    const outputTax = isVat ? ledger.outputTax : 0;
    const inputTax = isVat || isZeroRated ? ledger.inputTax : 0;
    const netVat = Math.max(0, outputTax - inputTax);
    add('calendarNo1', currentClient?.accountingType === 'Fiscal' ? 'false' : 'true');
    add('fiscalNo1', currentClient?.accountingType === 'Fiscal' ? 'true' : 'false');
    if (values.month) add('selectedMonthNo2', String(values.month));
    add('txtYearNo2', String(values.year));
    if (values.quarter) {
      add('OptQuarter1', values.quarter === 1 ? 'true' : 'false');
      add('OptQuarter2', values.quarter === 2 ? 'true' : 'false');
      add('OptQuarter3', values.quarter === 3 ? 'true' : 'false');
      add('OptQuarter4', values.quarter === 4 ? 'true' : 'false');
      const qm = values.quarter * 3; const fromM = qm - 2;
      const lastDay = new Date(Date.UTC(values.year, qm, 0)).getUTCDate();
      add('RtnPeriodFromNo4', `${fromM}/01/${values.year}`);
      add('RtnPeriodToNo4', `${qm}/${lastDay}/${values.year}`);
    }
    add('amendedReturnYesNo5', 'false'); add('amendedReturnNo5', 'true');
    add('OptShortPrd1', 'false'); add('OptShortPrd2', 'true');
    add('taxPayerClassification1', wf.sizeTier === 'micro' ? 'true' : 'false');
    add('taxPayerClassification2', wf.sizeTier === 'small' ? 'true' : 'false');
    add('taxPayerClassification3', wf.sizeTier === 'medium' ? 'true' : 'false');
    add('taxPayerClassification4', wf.sizeTier === 'large' ? 'true' : 'false');
    add('internationalTreatyYn', 'false'); add('specialRateYn', 'false');
    add('taxpayerName', urlEnc(values.registeredName));
    add('taxpayerAddress', urlEnc(values.address));
    add('taxpayerZip', String(currentClient?.zipCode || ''));
    add('taxpayerContactNumber', String(currentClient?.phone || ''));
    add('taxpayerEmailAddress', urlEnc((currentClient && (currentClient as any).email) || ''));
    add('vatableSales', numFmt(isVat ? (ledger.vatableSales || ledger.salesTotal) : 0));
    add('outputVatSales', numFmt(outputTax));
    add('zeroRatedSales', numFmt(isZeroRated ? (ledger.zeroRatedSales || ledger.salesTotal) : ledger.zeroRatedSales));
    add('exemptSales', numFmt(wf.vatRegistrationType === 'exempt' ? (ledger.exemptSales || ledger.salesTotal) : ledger.exemptSales));
    add('totalSales', numFmt(ledger.salesTotal));
    add('outputTaxDue', numFmt(outputTax));
    add('lessOutputVat', '0.00'); add('addOutputVat', '0.00');
    add('totalAdjOutput', numFmt(outputTax));
    add('domesticPurchase', numFmt(ledger.goodsInputTax > 0 ? ledger.goodsInputTax / 0.12 : (ledger.vatablePurchases || ledger.purchasesTotal)));
    add('domesticInputTax', numFmt(ledger.goodsInputTax || inputTax));
    add('servicesPurchase', numFmt(ledger.servicesInputTax > 0 ? ledger.servicesInputTax / 0.12 : 0));
    add('serviceInputTax', numFmt(ledger.servicesInputTax));
    add('importPurchase', '0.00'); add('importInputTax', '0.00');
    add('totalCurPurchase', numFmt(ledger.purchasesTotal));
    add('totalCurInputTax', numFmt(inputTax));
    add('totalAvailInputTax', numFmt(inputTax));
    add('totalDeductions', '0.00'); add('addInputVat', '0.00'); add('adjDeductions', '0.00');
    add('totalAllowInputTax', numFmt(inputTax));
    add('netVatPayable', numFmt(netVat));
    add('excessInputTax', '0.00'); add('creditableVat', '0.00'); add('advVatPayment', '0.00'); add('vatPaidReturn', '0.00');
    add('otherCreditsNo19', '0.00'); add('totalTaxCredits', '0.00'); add('excessCredits', '0.00');
    add('surcharge', '0.00'); add('interest', '0.00'); add('compromise', '0.00'); add('penalties', '0.00');
    add('totalPayable', numFmt(netVat));
    add('txtCurrentPage', '1'); add('txtMaxPage', '2');
    f.push({ cellId: 'txtFinalFlag', value: '1' });
    f.push({ cellId: 'txtEnroll', value: 'Y' });
  } else if (values.formType === '2551Q') {
    add('txt15', numFmt(ledger.salesTotal));
    add('txt16', String(+(wf.percentageTaxRate * 100).toFixed(2)));
    add('txt17', numFmt(values.totalTaxPayable));
  } else if (values.formType === '0619-E' || values.formType === '1601-EQ') {
    add('txtAtc', ledger.ewtByAtc.map(e => e.atcCode).join(' '));
    add('txtTaxTypeCode', 'WE');
    for (let idx = 0; idx < Math.min(ledger.ewtByAtc.length, 10); idx++) {
      const e = ledger.ewtByAtc[idx];
      add(`txtAtc${idx + 1}`, e.atcCode);
      add(`txtBase${idx + 1}`, numFmt(e.baseAmount));
      add(`txtRate${idx + 1}`, String(e.rate));
      add(`txtWht${idx + 1}`, numFmt(e.taxWithheld));
    }
    add('txtTotalTaxWithheld', numFmt(values.totalTaxPayable));
  } else if (values.formType === '1601-C') {
    add('txt16', numFmt(ledger.compensationWithholding));
  } else if (values.formType === '0605') {
    add('txtATC', 'MC350');
    add('txtTaxTypeCode', 'MA');
    add('txt18A', numFmt(values.totalTaxPayable));
  } else {
    // 1701Q / 1702Q — income tax
    add('txt16C', numFmt(ledger.salesTotal));
    add('txt20C', numFmt(ledger.purchasesTotal + ledger.expensesTotal));
    add('txt26B', numFmt(Math.max(0, ledger.salesTotal - ledger.purchasesTotal - ledger.expensesTotal)));
    add('txt30', numFmt(values.totalTaxPayable));
  }
  return f;
}

/** Build the observed eBIRForms filename for a form and return period. */
export function buildEBirFormXmlFilename(values: EBirFormValues, currentClient?: any): string {
  const normalizedForm = String(values.formType || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const ver = EBIR_FORM_VERSIONS[values.formType] || EBIR_FORM_VERSIONS[normalizedForm] || 'v2018';
  const yearEndMonth = String((values as any).yearEndMonth || currentClient?.fiscalYearEndMonth || currentClient?.yearEndMonth || currentClient?.accountingYearEndMonth || 12).padStart(2, '0');
  const is1702 = normalizedForm.startsWith('1702');
  const is1702RT = normalizedForm === '1702RT';

  // eBIRForms' 1702 save files use a 12-digit filename TIN: 9-digit TIN +
  // 3-digit branch code. Most CAPOTBOOKS client profiles store only the 9-digit
  // TIN, so append the requested/default head-office branch suffix `000`.
  // If a complete 12-digit TIN is already saved, preserve its actual suffix.
  const rawTin = String(currentClient?.tin || values.tin || '').replace(/\D/g, '');
  const tin9 = rawTin.slice(0, 9).padStart(9, '0');
  const branch3 = rawTin.length >= 12
    ? rawTin.slice(9, 12)
    : String(currentClient?.branchCode || '').replace(/\D/g, '').length === 3
      ? String(currentClient.branchCode).replace(/\D/g, '').slice(0, 3)
      : '000';
  const filenameTin = is1702 ? `${tin9}${branch3}` : String(values.tin || '').replace(/\D/g, '') || tin9;
  const filenameForm = is1702 ? normalizedForm : values.formType;

  // Sampled official 1702-RT v2018C files use MMYYYY, e.g. 122024.
  // Keep the form's official no-hyphen identifier in the filename.
  const periodStr = values.quarter
    ? `${yearEndMonth}${values.year}Q${values.quarter}`
    : values.month
      ? `${String(values.month).padStart(2, '0')}${values.year}`
      : is1702RT
        ? `${yearEndMonth}${values.year}`
        : String(values.year);
  return `${filenameTin}-${filenameForm}${ver}-${periodStr}.xml`;
}

/**
 * Generate a CAPOTBOOKS XML draft using a reverse-engineered save-file shape.
 * The exact 1702-RT field IDs and field order are based on the user-supplied
 * eBIRForms v7.9.6.2 sample for 1702RTv2018C. This generator emits the actual
 * `frm1702RT:` cell IDs (not the generic `frm1702RTv2018C:` prefix). Direct
 * import still needs validation in the installed Windows application.
 */
export function downloadEBirFormXml(values: EBirFormValues, ledger?: EBirLedgerData, currentClient?: any) {
  const led: EBirLedgerData = ledger || { salesTotal:0, vatableSales:0, zeroRatedSales:0, exemptSales:0, outputTax:0, purchasesTotal:0, vatablePurchases:0, inputTax:0, capitalGoodsInputTax:0, servicesInputTax:0, goodsInputTax:0, ewtTotal:0, ewtByAtc:[], compensationWithholding:0, expensesTotal:0 };
  const fields = buildOfficialSaveFields(values, led, currentClient);
  const lines: string[] = ["<?xml version='1.0'?>"];
  for (const { cellId, value } of fields) {
    lines.push(`            <div>${cellId}=${xmlText(value)}${cellId}=</div>`);
  }
  lines.push("        All Rights Reserved BIR 2012.0");
  const xml = lines.join('\n');
  const blob = new Blob([xml], { type: 'application/xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = buildEBirFormXmlFilename(values, currentClient);
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return xml;
}

/** Open a printable BIR form (HTML) in a new window, populated with values. */
export function printEBirForm(values: EBirFormValues) {
  const period = values.quarter ? `Quarter ${values.quarter} — ${values.year}` : (values.month ? `${String(values.month).padStart(2,'0')} / ${values.year}` : String(values.year));
  const rows = values.lineItems.map(it => `
    <tr><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-family:monospace;color:#64748b">${esc(it.itemNo)}</td>
    <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0">${esc(it.label)}</td>
    <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;text-align:right;font-family:monospace">${fmt2(it.value)}</td></tr>`).join('');
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>BIR Form ${esc(values.formType)}</title>
  <style>body{font-family:Arial,Helvetica,sans-serif;margin:40px;color:#0f172a}
  .hdr{background:#1e40af;color:#fff;padding:18px 24px;border-radius:6px}
  .hdr h1{margin:0;font-size:18px}.hdr p{margin:4px 0 0;font-size:12px;opacity:.9}
  .tp{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:18px 0;font-size:13px}
  .tp div{padding:6px 10px;background:#f1f5f9;border-radius:4px}
  table{width:100%;border-collapse:collapse;margin-top:12px;font-size:12.5px}
  th{background:#1e40af;color:#fff;padding:8px 10px;text-align:left;font-size:11px}
  .total{margin-top:16px;text-align:right;font-size:15px;font-weight:bold;padding:10px;background:#fef3c7;border-radius:4px}
  .foot{margin-top:30px;font-size:10px;color:#94a3b8}
  @media print{.no-print{display:none}}</style></head><body>
  <div class="hdr"><h1>Republic of the Philippines — Bureau of Internal Revenue</h1>
  <p>BIR Form ${esc(values.formType)} &nbsp;·&nbsp; Period: ${esc(period)} &nbsp;·&nbsp; Generated by CAPOT Books (eBIRForms-compatible)</p></div>
  <div class="tp">
    <div><b>TIN:</b> ${esc(values.tin)}</div><div><b>RDO Code:</b> ${esc(values.rdoCode)}</div>
    <div><b>Registered Name:</b> ${esc(values.registeredName)}</div><div><b>Trade Name:</b> ${esc(values.tradeName)}</div>
    <div style="grid-column:1/3"><b>Address:</b> ${esc(values.address)}</div>
  </div>
  <table><thead><tr><th style="width:80px">Item No.</th><th>Description</th><th style="width:160px;text-align:right">Amount (PHP)</th></tr></thead>
  <tbody>${rows}</tbody></table>
  <div class="total">TOTAL TAX PAYABLE: PHP ${fmt2(values.totalTaxPayable)}</div>
  <p class="foot">This printable form mirrors the eBIRForms Offline Package v7.9.6.2 field layout. Import the companion XML into the official eBIRForms offline app for final validation and submission.</p>
  <button class="no-print" onclick="window.print()" style="margin-top:16px;padding:10px 20px;background:#1e40af;color:#fff;border:none;border-radius:6px;cursor:pointer">Print / Save as PDF</button>
  </body></html>`;
  const w = window.open('', '_blank', 'width=900,height=700');
  if (w) { w.document.write(html); w.document.close(); }
  return html;
}
