// Multi-entity client service (Run 022 / T022): per-client branding + tax-setup
// helpers. Branding persisted per client in localStorage; tax defaults from BIR utils.

export interface ClientBranding {
  logoUrl: string;
  accentColor: string;
  invoiceFooter: string;
}

export const DEFAULT_BRANDING: ClientBranding = { logoUrl: '', accentColor: '#0891b2', invoiceFooter: 'Thank you for your business.' };

const brandingKey = (clientId: string) => `capot.branding.${clientId}`;

export function getClientBranding(clientId: string): ClientBranding {
  try { return { ...DEFAULT_BRANDING, ...JSON.parse(localStorage.getItem(brandingKey(clientId)) || '{}') }; }
  catch { return DEFAULT_BRANDING; }
}

export function saveClientBranding(clientId: string, branding: Partial<ClientBranding>): ClientBranding {
  const next = { ...getClientBranding(clientId), ...branding };
  try { localStorage.setItem(brandingKey(clientId), JSON.stringify(next)); } catch { /* ignore quota */ }
  return next;
}

/** BIR tax-setup defaults for a new entity (PH). */
export const TAX_SETUP_DEFAULTS = {
  taxType: 'VAT Registered',
  vatRate: 0.12,
  withholding: true,
  fiscalYearEnd: 'December',
  rdoCode: '',
  tin: '',
};

export type TaxSetup = typeof TAX_SETUP_DEFAULTS;

const taxKey = (clientId: string) => `capot.taxSetup.${clientId}`;

export function getTaxSetup(clientId: string): TaxSetup {
  try { return { ...TAX_SETUP_DEFAULTS, ...JSON.parse(localStorage.getItem(taxKey(clientId)) || '{}') }; }
  catch { return TAX_SETUP_DEFAULTS; }
}

export function saveTaxSetup(clientId: string, setup: Partial<TaxSetup>): TaxSetup {
  const next = { ...getTaxSetup(clientId), ...setup };
  try { localStorage.setItem(taxKey(clientId), JSON.stringify(next)); } catch { /* ignore */ }
  return next;
}
