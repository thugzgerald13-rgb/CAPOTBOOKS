// Chart of Accounts category hierarchy for the COA upload.
//
// The hierarchy is NOT hard-coded: it is read from COA-CATEGORY.txt (same folder),
// which is the default format used when editing an uploaded COA. Edit that text
// file to change the categories — indentation (3 spaces per level) defines the
// parent/child relationship, and the `*NON-INDIVIDUAL*` / `*INDIVIDUAL*` lines
// start each taxpayer-classification section.
//
// Uploaded postable accounts are categorised under one of these nodes; the user
// can pick a different node for each account in the upload review step.
import coaCategoryText from './COA-CATEGORY.txt?raw';

export type CoaTaxpayerClassification = 'Individual' | 'Non-Individual';
export type CoaBusinessType = 'Service' | 'Retail' | 'Manufacturing' | 'Construction/Fabrication/Contracting';

export interface CoaCategoryNode {
  /** Title exactly as written in COA-CATEGORY.txt (spelling retained). */
  title: string;
  /** 0 = statement section (ASSETS, REVENUE, ...), 1 = classification, 2 = account group, ... */
  depth: number;
  /** Account type of the statement section this node sits in. */
  type: string;
}

// The cost section that applies to each business type. The prefixes are the
// leading words of the cost-section titles in COA-CATEGORY.txt.
const COST_SECTION_PREFIX: Record<CoaBusinessType, string> = {
  Service: 'COST OF REVENUE',
  Retail: 'COST OF SALES',
  Manufacturing: 'COST OF GOODS MANUFACTURED AND SOLD',
  'Construction/Fabrication/Contracting': 'COST OF CONTRACTS',
};

const INDENT_WIDTH = 3;

const tokenOf = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Account type implied by a statement-section (depth 0) title. */
function sectionType(title: string): string {
  const t = tokenOf(title);
  if (t === 'assets') return 'Asset';
  if (t === 'liabilties' || t === 'liabilities') return 'Liabilities';
  if (t === 'equity') return 'Equity';
  if (t === 'capital') return 'Capital';
  if (t === 'revenue') return 'Revenue';
  if (t.startsWith('costof')) return 'Costs';
  if (t === 'operatingexpenses') return 'Expense';
  if (t === 'otherincomeexpenses') return 'Other Income';
  return '';
}

type ParsedSections = Record<CoaTaxpayerClassification, CoaCategoryNode[]>;

function parseCoaCategoryText(text: string): ParsedSections {
  const sections: ParsedSections = { 'Non-Individual': [], Individual: [] };
  let current: CoaTaxpayerClassification | null = null;
  let currentType = '';
  for (const rawLine of text.split(/\r?\n/)) {
    if (!rawLine.trim()) continue;
    const marker = rawLine.trim().match(/^\*(.+)\*$/);
    if (marker) {
      const name = tokenOf(marker[1]);
      current = name === 'nonindividual' ? 'Non-Individual' : name === 'individual' ? 'Individual' : null;
      continue;
    }
    if (!current) continue;
    const indent = rawLine.length - rawLine.trimStart().length;
    const depth = Math.floor(indent / INDENT_WIDTH);
    const title = rawLine.trim();
    if (depth === 0) currentType = sectionType(title);
    sections[current].push({ title, depth, type: currentType });
  }
  return sections;
}

const PARSED = parseCoaCategoryText(coaCategoryText);

/** Every title written in COA-CATEGORY.txt (both taxpayer sections). */
export function allCoaCategoryTitles(): string[] {
  return Array.from(new Set([...PARSED['Non-Individual'], ...PARSED.Individual].map(node => node.title)));
}

/**
 * The category hierarchy for a taxpayer classification and business type, in file
 * order. Only the cost section that belongs to the business type is returned.
 */
export function getCoaCategoryNodes(
  classification: CoaTaxpayerClassification,
  businessType: CoaBusinessType
): CoaCategoryNode[] {
  const out: CoaCategoryNode[] = [];
  let skipping = false;
  for (const node of PARSED[classification]) {
    if (node.depth === 0) {
      skipping = node.type === 'Costs' && !node.title.toUpperCase().startsWith(COST_SECTION_PREFIX[businessType]);
    }
    if (!skipping) out.push(node);
  }
  return out;
}

/**
 * Comparison key for matching a category title to an account title. Spelling
 * variants between the txt and the stored COA are tolerated (EQUIPMENTS /
 * EQUIPMENT, LIABILTIES / LIABLITIES / LIABILITIES), and a "COST OF ..." title is
 * keyed by the words before " - " because the suffix differs between the txt and
 * the stored cost-section headers.
 */
export function categoryTitleKey(title: string): string {
  const head = /^cost of/i.test(title.trim()) ? title.split(' - ')[0] : title;
  return tokenOf(head).replace(/equipments/g, 'equipment').replace(/liabilties|liablities/g, 'liabilities');
}

export interface CoaCategoryOption {
  /** Account id of the category in the Chart of Accounts. */
  id: string;
  title: string;
  depth: number;
  type: string;
}

/**
 * Resolve each category node to its account in the given Chart of Accounts.
 * Nodes that have no matching account are left out (they cannot be a parent).
 */
export function getCoaCategoryOptions(
  classification: CoaTaxpayerClassification,
  businessType: CoaBusinessType,
  accounts: Array<{ id: string; name: string }>
): CoaCategoryOption[] {
  const byKey = new Map<string, string>();
  for (const account of accounts) {
    const key = categoryTitleKey(account.name);
    if (!byKey.has(key)) byKey.set(key, account.id);
  }
  const options: CoaCategoryOption[] = [];
  for (const node of getCoaCategoryNodes(classification, businessType)) {
    const id = byKey.get(categoryTitleKey(node.title));
    if (id) options.push({ id, title: node.title, depth: node.depth, type: node.type });
  }
  return options;
}

/** Find the account that corresponds to a category title (spelling tolerant). */
export function findCategoryAccountId(title: string, accounts: Array<{ id: string; name: string }>): string | undefined {
  const key = categoryTitleKey(title);
  return accounts.find(account => categoryTitleKey(account.name) === key)?.id;
}

const ownershipGroup = (type: string) => (type === 'Equity' || type === 'Capital' ? 'Equity/Capital' : type);
const otherGroup = (type: string) => (type === 'Other Income' || type === 'Other Expense' ? 'Other' : ownershipGroup(type));

/** True when an account of `accountType` belongs in the statement section of a category node of `nodeType`. */
export function categoryAcceptsType(nodeType: string, accountType: string): boolean {
  return otherGroup(nodeType) === otherGroup(accountType);
}
