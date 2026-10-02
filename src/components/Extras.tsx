import { useState, useEffect, useMemo, useRef } from 'react';
import { PageHeader } from './ui/PageHeader';
import { useAccounting } from '../context/AccountingContext';
import { usePermission } from '../lib/teamPermissions';
import { useAuth } from '../context/AuthContext';
import { Users, TrendingUp, Key, Lightbulb, BookOpen, BookText, LineChart, Scale, Plus, Building2, Save, X, RotateCcw, Library, FileText, Receipt, ShoppingCart, Banknote, Wallet, CreditCard, Trash2, Pencil, Upload, Loader2, CheckCircle2, AlertTriangle, FileImage } from 'lucide-react';
import { Client, BusinessProfile, ClientIndustry } from '../types';
import { RDO_CODES } from '../lib/utils';
import { supabase } from '../lib/supabase';
import { formatAccountAmount, glAccountBalanceBefore, getAccountBalances } from '../lib/accountingBalances';
import { findAccountByLabel, syncGeneralLedger } from '../lib/glPosting';
import { DEFAULT_ACCOUNTS, DEFAULT_ACCOUNTS_ALPHA, getNormalSide } from './ChartOfAccounts';
import { DEFAULT_INDUSTRY, INDUSTRY_OPTIONS, getDefaultAccountsForIndustry } from '../lib/journalDefaults';
import { parseBirCorDocument, BirCorExtractionResult } from '../lib/birCorParser';

export function Extras() {
  const canManageSettings = usePermission('manage_settings');

  const { 
    clients, 
    currentClientId, 
    setCurrentClientId, 
    navigateToPage, 
    currentClient, 
    activePage, 
    deleteClient,
    businessProfile,
    saveBusinessProfile,
    saveClientProfile,
    ownerClientId,
    showToast,
    saveFile,
  } = useAccounting();
  const { userRole } = useAuth();
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [trialBalances, setTrialBalances] = useState<any[]>([]);
  const [trialBalanceError, setTrialBalanceError] = useState<string | null>(null);
  const trialBalanceYear = new Date().getFullYear();
  // Rebuild the General Ledger (auto-postings from all journals) once per
  // client so the Trial Balance's Debit/Credit columns can be summed from the
  // ledger entries instead of trusting the server RPC's period totals.
  const glClientTb = useMemo(
    () => (currentClient ? syncGeneralLedger(currentClient) : null),
    [currentClient]
  );

  useEffect(() => {
    let cancelled = false;
    if (activePage !== 'trialbalance' || !currentClientId) return;
    setTrialBalanceError(null);
    Promise.resolve(supabase.rpc('get_server_account_balances', {
      p_client_id: currentClientId,
      p_start_date: `${trialBalanceYear}-01-01`,
      p_end_date: `${trialBalanceYear + 1}-01-01`,
    }))
      .then(({ data, error }) => {
        if (error) throw error;
        if (!cancelled) setTrialBalances((data || []).map((row:any) => ({
          account_id: String(row.account_id), account_name: String(row.account_name || ''),
          account_type: String(row.account_type || ''), balance: Number(row.balance || 0),
          period_debit: Number(row.period_debit || 0), period_credit: Number(row.period_credit || 0),
          period_balance: Number(row.period_balance || 0),
        })));
      })
      .catch(err => { if (!cancelled) setTrialBalanceError(err?.message || 'Unable to load trial balance.'); });
    return () => { cancelled = true; };
  }, [activePage, currentClientId, currentClient, trialBalanceYear]);
  // Once a profile is saved, its fields lock (gray out/disabled) until the
  // Edit button is pressed again.
  const [isClientLocked, setIsClientLocked] = useState(false);
  const [isNewClient, setIsNewClient] = useState(false);
  const [birCorFile, setBirCorFile] = useState<File | null>(null);
  const [birCorExtraction, setBirCorExtraction] = useState<BirCorExtractionResult | null>(null);
  const [birCorStatus, setBirCorStatus] = useState<string | null>(null);
  const [birCorError, setBirCorError] = useState<string | null>(null);
  const isBirCorBusy = !!birCorStatus && (birCorStatus.includes('Starting') || birCorStatus.includes('Reading') || birCorStatus.includes('Preparing') || birCorStatus.includes('%') || birCorStatus.includes('switching to OCR'));
  const birCorInputRef = useRef<HTMLInputElement | null>(null);

  // Dedicated management state for own business profile
  const [editingBusiness, setEditingBusiness] = useState<BusinessProfile | null>(null);
  const [newBusinessName, setNewBusinessName] = useState('');
  const [isBusinessLocked, setIsBusinessLocked] = useState(false);

  // Onboarding gate: TIN, Taxpayer Classification, Trade Name, Address (any
  // address line) and RDO Code are required before the user can start.
  const missingBusinessFields = (p: BusinessProfile | null): string[] => {
    if (!p) return ['Business profile'];
    const missing: string[] = [];
    if (!String(p.tin || '').trim()) missing.push('TIN');
    if (!String(p.taxpayerClassification || '').trim()) missing.push('Taxpayer Classification');
    if (!String(p.tradeName || '').trim()) missing.push('Trade Name');
    if (![p.substreet, p.street, p.barangay, p.district, p.city].some(v => String(v || '').trim())) missing.push('Address');
    if (!String(p.rdoCode || '').trim()) missing.push('RDO Code');
    return missing;
  };
  const missingBusinessRequired = missingBusinessFields(editingBusiness);

  // Synchronize when the business profile page opens/updates
  useEffect(() => {
    if (activePage === 'business') {
      if (businessProfile) {
        setEditingBusiness({ ...businessProfile });
        setIsBusinessLocked(true);
      } else {
        setEditingBusiness(null);
        setIsBusinessLocked(false);
      }
    }
  }, [activePage, businessProfile]);

  useEffect(() => {
    if (activePage === null) {
      setEditingClient(null);
      setEditingBusiness(null);
      setIsClientLocked(false);
      setIsNewClient(false);
      setIsBusinessLocked(false);
      setBirCorFile(null);
      setBirCorExtraction(null);
      setBirCorStatus(null);
      setBirCorError(null);
    }
  }, [activePage]);

  const handleEditClient = (client: Client) => {
    setEditingClient({ ...client });
    setIsNewClient(false);
    setBirCorFile(null);
    setBirCorExtraction(null);
    setBirCorStatus(null);
    setBirCorError(null);
    // Existing profiles open read-only; the accountant must press Edit to change them.
    setIsClientLocked(true);
  };

  const countExtractedFields = (fields: BirCorExtractionResult['fields']) =>
    Object.values(fields).filter((value) => String(value || '').trim()).length;

  const handleBirCorUpload = async (file: File | undefined) => {
    if (!file) return;
    if (!isNewClient) return;

    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    const isImage = file.type.startsWith('image/') || /\.(jpe?g|png|gif|webp|bmp|tiff?|heic|heif)$/i.test(file.name);
    if (!isPdf && !isImage) {
      setBirCorError('Please choose a PDF or an image file.');
      setBirCorStatus(null);
      return;
    }

    setBirCorFile(file);
    setBirCorExtraction(null);
    setBirCorError(null);
    setBirCorStatus('Starting document extraction…');

    try {
      const result = await parseBirCorDocument(file, (message) => setBirCorStatus(message));
      const extractedCount = countExtractedFields(result.fields);
      setBirCorExtraction(result);

      setEditingClient((current) => {
        if (!current) return current;
        const next = { ...current } as Client;
        const fields = result.fields;
        for (const [key, value] of Object.entries(fields)) {
          if (value && String(value).trim()) {
            (next as any)[key] = value;
          }
        }
        next.name = fields.registeredName || fields.tradeName || fields.name || next.name;
        return next;
      });

      setBirCorStatus(
        extractedCount > 0
          ? `Extracted ${extractedCount} field(s). Please review them before saving.`
          : 'The document was read, but no client fields were detected. Please review the form manually.'
      );
      showToast(extractedCount > 0 ? 'COR / 2303 data populated into the client form.' : 'COR / 2303 uploaded, but fields could not be detected automatically.');
    } catch (error: any) {
      console.error('BIR COR extraction failed:', error);
      setBirCorExtraction(null);
      setBirCorStatus(null);
      setBirCorError(error?.message || 'Unable to read this document. Please try another PDF or image.');
      showToast('Unable to extract the COR / 2303 data. You can still enter the details manually.');
    }
  };

  const uploadBirCorAttachment = async (clientId: string, file: File, folderId?: string) => {
    const id = 'file_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    const safeName = (file.name.trim() || 'BIR-COR-2303').replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `${clientId}/registration/${id}/${safeName}`;

    const { error: uploadError } = await supabase.storage.from('client-files').upload(storagePath, file, {
      contentType: file.type || 'application/octet-stream',
      cacheControl: 'public, max-age=31536000, immutable',
      upsert: false,
    });
    if (uploadError) throw uploadError;

    try {
      await saveFile({
        id,
        name: file.name,
        type: file.type || 'application/octet-stream',
        size: file.size,
        uploadedAt: new Date().toISOString(),
        folderId: folderId || '',
        storagePath,
        description: 'BIR Certificate of Registration (COR / BIR Form 2303) used to populate client profile',
      });
    } catch (error) {
      await supabase.storage.from('client-files').remove([storagePath]);
      throw error;
    }
  };

  const handleSaveProfile = async () => {
    if (!editingClient) return;
    const wasNewClient = isNewClient;
    const fileToAttach = birCorFile;
    try {
      await saveClientProfile(editingClient.id, editingClient);
      if (wasNewClient && fileToAttach) {
        setBirCorStatus('Saving the COR / 2303 with the client record…');
        try {
          const registrationFolderId = editingClient.folders?.find((folder) => folder.name === 'BIR Registration')?.id;
          await uploadBirCorAttachment(editingClient.id, fileToAttach, registrationFolderId);
          setBirCorStatus('COR / 2303 saved with this client.');
        } catch (attachmentError) {
          console.error('BIR COR attachment upload failed:', attachmentError);
          setBirCorError('Client was saved, but the COR / 2303 file could not be attached.');
          setBirCorStatus(null);
          showToast('Client saved, but the COR / 2303 attachment failed to upload.');
        }
      }
      // Stay on the form (grayed out) only after Supabase confirms the save.
      setIsNewClient(false);
      setIsClientLocked(true);
    } catch (error) {
      console.error('Client profile save failed:', error);
    }
  };

  const handleSaveBusinessProfile = () => {
    if (!editingBusiness) return;
    const missing = missingBusinessFields(editingBusiness);
    if (missing.length > 0) {
      showToast(`Please complete required fields first: ${missing.join(', ')}.`);
      return;
    }
    saveBusinessProfile(editingBusiness);
    setIsBusinessLocked(true);
    showToast('Business profile saved. Welcome aboard!');
    navigateToPage(null);
  };

  const handleCreateBusinessProfile = () => {
    if (newBusinessName.trim()) {
      const newBiz: BusinessProfile = {
        id: 'biz_' + Date.now(),
        name: newBusinessName.trim(),
        tin: '',
        taxpayerClassification: '',
        registeredName: newBusinessName.trim(),
        lastName: '',
        firstName: '',
        middleName: '',
        tradeName: '',
        substreet: '',
        street: '',
        barangay: '',
        district: '',
        city: '',
        zipCode: '',
        rdoCode: '',
        accountingType: 'Calendar',
        fiscalMonthEnd: 12
      };
      saveBusinessProfile(newBiz);
      setEditingBusiness(newBiz);
      setIsBusinessLocked(true);
      setNewBusinessName('');
    }
  };

  const handleAddClient = () => {
    const existingCount = Object.values(clients).filter((client: Client) => client.id !== ownerClientId).length;
    const nextName = `New Client ${existingCount + 1}`;
    const draftId = 'client_draft_' + Date.now();

    // Keep the new client entirely in the form until Save is clicked.
    // No database write or client-map entry is created here.
    const draft: Client = {
      id: draftId,
      name: nextName,
      userId: undefined,
      tinLibrary: { customers: [], suppliers: [] },
      sales: [],
      purchases: [],
      expenses: [],
      folders: [
        { id: 'folder_revenue', name: 'Revenue', isDefault: true, type: 'revenue' },
        { id: 'folder_expense', name: 'Expense', isDefault: true, type: 'expense' },
        { id: `${draftId}_registration`, name: 'BIR Registration', isDefault: true, type: 'custom' },
      ],
      files: [],
    } as Client;

    setEditingClient(draft);
    setIsNewClient(true);
    setIsClientLocked(false);
    setBirCorFile(null);
    setBirCorExtraction(null);
    setBirCorStatus(null);
    setBirCorError(null);
  };

  const salesTotal = currentClient?.sales.reduce((s,i)=>s+i.amount,0) || 0;
  const purchasesTotal = currentClient?.purchases.reduce((s,i)=>s+i.amount,0) || 0;
  const totalIpTax = currentClient?.purchases.reduce((s,i)=>s+(i.inputTax||0),0) || 0;
  const gp = salesTotal - purchasesTotal;
  const gm = salesTotal ? ((gp/salesTotal)*100).toFixed(2) : 0;

  // Sales Journal: income entries posted with Credit Card or On Account payment types
  const creditSalesEntries = (currentClient?.sales || []).filter(
    s => s.paymentType === 'Credit Card' || s.paymentType === 'On Account'
  );
  const creditSalesTotal = creditSalesEntries.reduce((s, i) => s + i.amount, 0);
  
  return (
    <>
      {activePage === 'clients' && (
        <div className="w-full flex flex-col">
          <PageHeader
            title="Client Profiles"
            icon={<Users className="text-blue-500" />}
            actions={
              !editingClient ? (
                <button onClick={handleAddClient} className="bg-blue-600 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 hover:bg-blue-700 text-sm">
                  <Plus className="w-4 h-4" /> Add New Client
                </button>
              ) : undefined
            }
          />
          <div className="p-4 md:p-6 flex-1">
        {editingClient ? (
          <div className="bg-slate-100 dark:bg-slate-900 -m-6 p-6 h-full min-h-[600px] flex flex-col font-sans">
            {/* Form Header */}
            <div className="bg-slate-300 dark:bg-slate-800 p-2 border-b border-slate-400 dark:border-slate-700 flex justify-between items-center mb-4">
              <span className="text-sm font-bold text-slate-700 dark:text-slate-300">Client's Information</span>
              <button 
                onClick={() => {
                  setEditingClient(null);
                  setIsNewClient(false);
                  setBirCorFile(null);
                  setBirCorExtraction(null);
                  setBirCorStatus(null);
                  setBirCorError(null);
                }}
                className="hover:bg-slate-400 dark:hover:bg-slate-700 rounded p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {isNewClient && (
              <div className="mx-4 mb-4 rounded-xl border border-blue-200 dark:border-blue-900/70 bg-blue-50/70 dark:bg-blue-950/20 p-4">
                <input
                  ref={birCorInputRef}
                  type="file"
                  className="hidden"
                  accept="application/pdf,image/*,.pdf,.jpg,.jpeg,.png,.gif,.webp,.bmp,.tif,.tiff,.heic,.heif"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    void handleBirCorUpload(file);
                    e.target.value = '';
                  }}
                />
                <div className="flex flex-col lg:flex-row lg:items-center gap-3 justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-100">
                      <FileText className="w-4 h-4 text-blue-600" />
                      BIR Certificate of Registration (COR / 2303)
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                      Upload a PDF or any image. The document is read locally and detected details are placed into the form for review.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => birCorInputRef.current?.click()}
                    disabled={isBirCorBusy}
                    className="shrink-0 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 text-white font-bold px-4 py-2 rounded-lg flex items-center justify-center gap-2 text-sm"
                  >
                    {isBirCorBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    Upload COR / 2303
                  </button>
                </div>

                {birCorFile && (
                  <div className="mt-3 flex items-center gap-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2">
                    <div className="w-8 h-8 rounded-md bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                      {birCorFile.type.startsWith('image/') ? <FileImage className="w-4 h-4 text-slate-600" /> : <FileText className="w-4 h-4 text-slate-600" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold truncate text-slate-800 dark:text-slate-200">{birCorFile.name}</div>
                      <div className="text-[10px] text-slate-500">{Math.max(1, Math.round(birCorFile.size / 1024))} KB</div>
                    </div>
                    {birCorExtraction ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 shrink-0">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {countExtractedFields(birCorExtraction.fields)} fields found
                      </span>
                    ) : null}
                  </div>
                )}

                {birCorStatus && (
                  <div className="mt-3 text-xs font-medium text-blue-700 dark:text-blue-300 flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{birCorStatus}</span>
                  </div>
                )}
                {birCorError && (
                  <div className="mt-3 text-xs font-medium text-amber-700 dark:text-amber-300 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{birCorError}</span>
                  </div>
                )}
              </div>
            )}

            <fieldset disabled={isClientLocked} className="flex-1 overflow-y-auto px-4 border-0 m-0 p-0 disabled:opacity-60 transition-opacity">
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 mb-4">
                <div className="sm:col-span-5">
                  <label className="form-label">Tin:</label>
                  <div className="flex items-center gap-1">
                    <input 
                      type="text" 
                      maxLength={3}
                      value={(editingClient.tin || '').split('-')[0] || ''} 
                      onChange={e => {
                        const val = e.target.value.replace(/\D/g, '');
                        const parts = (editingClient.tin || '').split('-');
                        parts[0] = val;
                        setEditingClient({...editingClient, tin: parts.join('-')});
                      }}
                      className="w-16 px-2 py-1.5 border border-slate-400 dark:border-slate-600 rounded bg-white dark:bg-slate-800 text-center font-mono"
                    />
                    <span>-</span>
                    <input 
                      type="text" 
                      maxLength={3}
                      value={(editingClient.tin || '').split('-')[1] || ''} 
                      onChange={e => {
                        const val = e.target.value.replace(/\D/g, '');
                        const parts = (editingClient.tin || '').split('-');
                        parts[1] = val;
                        setEditingClient({...editingClient, tin: parts.join('-')});
                      }}
                      className="w-16 px-2 py-1.5 border border-slate-400 dark:border-slate-600 rounded bg-white dark:bg-slate-800 text-center font-mono"
                    />
                    <span>-</span>
                    <input 
                      type="text" 
                      maxLength={3}
                      value={(editingClient.tin || '').split('-')[2] || ''} 
                      onChange={e => {
                        const val = e.target.value.replace(/\D/g, '');
                        const parts = (editingClient.tin || '').split('-');
                        parts[2] = val;
                        setEditingClient({...editingClient, tin: parts.join('-')});
                      }}
                      className="w-16 px-2 py-1.5 border border-slate-400 dark:border-slate-600 rounded bg-white dark:bg-slate-800 text-center font-mono"
                    />
                    <span>-</span>
                    <input 
                      type="text" 
                      maxLength={3}
                      value={(editingClient.tin || '').split('-')[3] || ''} 
                      onChange={e => {
                        const val = e.target.value.replace(/\D/g, '');
                        const parts = (editingClient.tin || '').split('-');
                        while (parts.length < 4) parts.push('');
                        parts[3] = val;
                        setEditingClient({...editingClient, tin: parts.join('-')});
                      }}
                      className="w-16 px-2 py-1.5 border border-slate-400 dark:border-slate-600 rounded bg-white dark:bg-slate-800 text-center font-mono"
                    />
                  </div>
                </div>
                <div className="sm:col-span-7">
                  <label className="form-label">Taxpayer Classification:</label>
                  <select 
                    value={editingClient.taxpayerClassification || ''}
                    onChange={e => setEditingClient({...editingClient, taxpayerClassification: e.target.value})}
                    className="form-input"
                  >
                    <option value="">Select Classification</option>
                    <option value="Individual">Individual</option>
                    <option value="Non-Individual">Non-Individual</option>
                  </select>
                </div>
              </div>

              <div className="mb-4">
                <label className="form-label">Industry / Business Type:</label>
                <select
                  value={editingClient.industry || DEFAULT_INDUSTRY}
                  onChange={e => {
                    const industry = e.target.value as ClientIndustry;
                    setEditingClient(current => {
                      if (!current) return current;
                      const next = { ...current, industry };
                      // During creation the selected industry determines the starter COA.
                      // Existing clients keep their saved COA when their profile industry changes.
                      if (isNewClient) {
                        next.accounts = getDefaultAccountsForIndustry(
                          industry,
                          next.coaFormat === 'alphanumeric' ? 'alphanumeric' : 'numeric'
                        );
                      }
                      return next;
                    });
                  }}
                  disabled={!isNewClient && isClientLocked}
                  className="form-input"
                >
                  {INDUSTRY_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                  New clients receive the selected industry's Philippine SME starter Chart of Accounts.
                </p>
              </div>

              <div className="mb-4">
                <label className="form-label">Registered Name:</label>
                <input 
                  type="text" 
                  disabled={editingClient.taxpayerClassification === 'Individual'}
                  value={editingClient.registeredName || ''} 
                  onChange={e => {
                    const val = e.target.value;
                    setEditingClient({...editingClient, registeredName: val, name: val || editingClient.name});
                  }}
                  className="form-input border-slate-400 dark:border-slate-600 disabled:opacity-50"
                />
              </div>

              <div className="mb-4">
                <label className="form-label">Taxpayer Name:</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div className="flex flex-col items-center">
                    <input 
                      type="text" 
                      disabled={editingClient.taxpayerClassification === 'Non-Individual'}
                      value={editingClient.lastName || ''} 
                      onChange={e => setEditingClient({...editingClient, lastName: e.target.value})}
                      className="form-input border-slate-400 dark:border-slate-600 disabled:opacity-50"
                    />
                    <span className="text-[10px] text-slate-500 mt-1 uppercase font-bold">Last Name</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <input 
                      type="text" 
                      disabled={editingClient.taxpayerClassification === 'Non-Individual'}
                      value={editingClient.firstName || ''} 
                      onChange={e => setEditingClient({...editingClient, firstName: e.target.value})}
                      className="form-input border-slate-400 dark:border-slate-600 disabled:opacity-50"
                    />
                    <span className="text-[10px] text-slate-500 mt-1 uppercase font-bold">First Name</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <input 
                      type="text" 
                      disabled={editingClient.taxpayerClassification === 'Non-Individual'}
                      value={editingClient.middleName || ''} 
                      onChange={e => setEditingClient({...editingClient, middleName: e.target.value})}
                      className="form-input border-slate-400 dark:border-slate-600 disabled:opacity-50"
                    />
                    <span className="text-[10px] text-slate-500 mt-1 uppercase font-bold">Middle Name</span>
                  </div>
                </div>
              </div>

              <div className="mb-4">
                <label className="form-label">Trade Name:</label>
                <input 
                  type="text" 
                  value={editingClient.tradeName || ''} 
                  onChange={e => setEditingClient({...editingClient, tradeName: e.target.value})}
                  className="form-input border-slate-400 dark:border-slate-600"
                />
              </div>

              <div className="bg-slate-200 dark:bg-slate-800/80 p-4 rounded border border-slate-300 dark:border-slate-700 mb-4">
                <label className="form-label text-slate-800 dark:text-slate-300 mb-3 font-bold">Registered/Business Address:</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4">
                  <div className="flex flex-col items-center">
                    <input 
                      value={editingClient.substreet || ''} 
                      onChange={e => setEditingClient({...editingClient, substreet: e.target.value})}
                      className="form-input border-slate-400"
                    />
                    <span className="text-[10px] text-slate-500 mt-1 uppercase font-bold text-center">Substreet</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <input 
                      value={editingClient.street || ''} 
                      onChange={e => setEditingClient({...editingClient, street: e.target.value})}
                      className="form-input border-slate-400"
                    />
                    <span className="text-[10px] text-slate-500 mt-1 uppercase font-bold text-center">Street</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <input 
                      value={editingClient.barangay || ''} 
                      onChange={e => setEditingClient({...editingClient, barangay: e.target.value})}
                      className="form-input border-slate-400"
                    />
                    <span className="text-[10px] text-slate-500 mt-1 uppercase font-bold text-center">Barangay</span>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div className="flex flex-col items-center">
                    <input 
                      value={editingClient.district || ''} 
                      onChange={e => setEditingClient({...editingClient, district: e.target.value})}
                      className="form-input border-slate-400"
                    />
                    <span className="text-[10px] text-slate-500 mt-1 uppercase font-bold text-center leading-tight">District/Municipality</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <input 
                      value={editingClient.city || ''} 
                      onChange={e => setEditingClient({...editingClient, city: e.target.value})}
                      className="form-input border-slate-400"
                    />
                    <span className="text-[10px] text-slate-500 mt-1 uppercase font-bold text-center leading-tight">City/Province</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <input 
                      value={editingClient.zipCode || ''} 
                      onChange={e => setEditingClient({...editingClient, zipCode: e.target.value})}
                      className="form-input border-slate-400"
                    />
                    <span className="text-[10px] text-slate-500 mt-1 uppercase font-bold text-center">Zip Code</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-end mb-6">
                <div className="sm:col-span-4">
                  <label className="form-label">Contact Number:</label>
                  <input
                    type="text"
                    value={editingClient.phone || ''}
                    onChange={e => setEditingClient({...editingClient, phone: e.target.value})}
                    className="form-input border-slate-400 dark:border-slate-600"
                  />
                </div>
                <div className="sm:col-span-5">
                  <label className="form-label">Registered Email Address:</label>
                  <input
                    type="email"
                    value={editingClient.email || ''}
                    onChange={e => setEditingClient({...editingClient, email: e.target.value})}
                    className="form-input border-slate-400 dark:border-slate-600"
                  />
                </div>
                <div className="sm:col-span-3 flex items-center gap-4 py-3">
                  <label className="flex items-center gap-2 cursor-pointer group">
                    <input
                      type="radio"
                      className="w-4 h-4"
                      name="clientCategory"
                      checked={(editingClient.category || 'private') === 'private'}
                      onChange={() => setEditingClient({...editingClient, category: 'private'})}
                    />
                    <span className="text-xs font-bold uppercase tracking-tight">Private</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer group">
                    <input
                      type="radio"
                      className="w-4 h-4"
                      name="clientCategory"
                      checked={editingClient.category === 'government'}
                      onChange={() => setEditingClient({...editingClient, category: 'government'})}
                    />
                    <span className="text-xs font-bold uppercase tracking-tight">Government</span>
                  </label>
                </div>
                <div className="sm:col-span-12 -mt-2 mb-2">
                  <label className="flex items-center gap-2 cursor-pointer group w-max">
                    <input
                      type="checkbox"
                      className="w-4 h-4 rounded"
                      checked={editingClient.hasMultipleBusinessLines || false}
                      onChange={e => setEditingClient({...editingClient, hasMultipleBusinessLines: e.target.checked})}
                    />
                    <span className="text-xs font-bold text-slate-600 dark:text-slate-400">Multiple lines of business (e.g. sale of goods and services)</span>
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-end mb-6">
                <div className="sm:col-span-3">
                  <label className="form-label">RDO Code:</label>
                  <select 
                    value={editingClient.rdoCode || ''}
                    onChange={e => setEditingClient({...editingClient, rdoCode: e.target.value})}
                    className="form-input border-slate-400"
                  >
                    <option value="">Select RDO</option>
                    {RDO_CODES.map(code => (
                      <option key={code} value={code.split(' - ')[0]}>{code}</option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-5 flex items-center gap-6 py-3 px-2">
                  <label className="flex items-center gap-2 cursor-pointer group">
                    <input 
                      type="radio" 
                      className="w-4 h-4"
                      name="accountingType" 
                      checked={editingClient.accountingType === 'Calendar'}
                      onChange={() => setEditingClient({...editingClient, accountingType: 'Calendar'})}
                    />
                    <span className="text-xs font-bold uppercase tracking-tight">Calendar</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer group">
                    <input 
                      type="radio" 
                      className="w-4 h-4"
                      name="accountingType" 
                      checked={editingClient.accountingType === 'Fiscal'}
                      onChange={() => setEditingClient({...editingClient, accountingType: 'Fiscal'})}
                    />
                    <span className="text-xs font-bold uppercase tracking-tight">Fiscal</span>
                  </label>
                </div>
                <div className="sm:col-span-4">
                  <label className="form-label">Fiscal Month End:</label>
                  <select 
                    disabled={editingClient.accountingType !== 'Fiscal'}
                    value={editingClient.fiscalMonthEnd || 12}
                    onChange={e => setEditingClient({...editingClient, fiscalMonthEnd: parseInt(e.target.value)})}
                    className="form-input disabled:opacity-50 border-slate-400"
                  >
                    {Array.from({length: 12}, (_, i) => (
                      <option key={i+1} value={i+1}>{i+1}</option>
                    ))}
                  </select>
                </div>
              </div>
            </fieldset>

            {/* Form Footer */}
            <div className="border-t border-slate-300 dark:border-slate-700 pt-4 flex justify-end gap-3 px-4">
              <button 
                onClick={handleSaveProfile}
                disabled={isClientLocked}
                className="bg-slate-200 dark:bg-slate-700 font-bold px-6 py-2 rounded border border-slate-400 dark:border-slate-600 shadow-sm hover:bg-slate-300 dark:hover:bg-slate-600 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Save className="w-4 h-4" /> Save
              </button>
              <button
                onClick={() => setIsClientLocked(false)}
                disabled={!isClientLocked}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-6 py-2 rounded shadow-sm flex items-center gap-2 transition disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:dark:bg-slate-700 disabled:text-slate-700 disabled:dark:text-slate-300"
              >
                <Pencil className="w-4 h-4" /> Edit
              </button>
              <button 
                onClick={() => {
                  if (isNewClient) {
                    setEditingClient(null);
                    setIsNewClient(false);
                    setIsClientLocked(false);
                    setBirCorFile(null);
                    setBirCorExtraction(null);
                    setBirCorStatus(null);
                    setBirCorError(null);
                    return;
                  }
                  setEditingClient({...clients[editingClient.id]});
                  setIsClientLocked(true);
                }}
                disabled={isClientLocked}
                className="bg-slate-200 dark:bg-slate-700 font-bold px-6 py-2 rounded border border-slate-400 dark:border-slate-600 shadow-sm hover:bg-slate-300 dark:hover:bg-slate-600 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RotateCcw className="w-4 h-4" /> {isNewClient ? 'Discard' : 'Revert'}
              </button>
              <button 
                onClick={() => {
                  setEditingClient(null);
                  setIsNewClient(false);
                  setIsClientLocked(false);
                  setBirCorFile(null);
                  setBirCorExtraction(null);
                  setBirCorStatus(null);
                  setBirCorError(null);
                }}
                className="bg-slate-200 dark:bg-slate-700 font-bold px-6 py-2 rounded border border-slate-400 dark:border-slate-600 shadow-sm hover:bg-slate-300 dark:hover:bg-slate-600 flex items-center gap-2"
              >
                Close
              </button>
            </div>
          </div>
        ) : (
          <>
             <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {Object.values(clients)
                .filter((client: Client) => {
                  if (client.id === ownerClientId) return false;
                  // Defensive guard: also hide any stray entry that duplicates the
                  // accountant's own business profile by name, in case cleanup hasn't
                  // synced yet.
                  const bizName = businessProfile?.name?.trim().toLowerCase();
                  if (bizName && client.name?.trim().toLowerCase() === bizName) return false;
                  return true;
                })
                .map((client: Client) => (
                <div
                  key={client.id}
                  className={`p-4 rounded-xl border text-left transition-all ${currentClientId === client.id ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 shadow-md ring-2 ring-blue-500/20' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-blue-400'}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 shrink-0">
                        <span className="font-bold text-slate-800 dark:text-slate-100 truncate">{client.name}</span>
                        <button 
                          onClick={() => handleEditClient(client)}
                          className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-blue-600 dark:text-blue-400 shrink-0"
                          title="Edit Profile"
                        >
                          <Building2 className="w-4 h-4" />
                        </button>
                      </span>
                      <span className="text-xs text-slate-500 dark:text-slate-400 font-medium shrink-0">
                        {client.sales.length} Sales | {client.purchases.length} Purchases
                      </span>
                      <button
                        onClick={() => {
                          setCurrentClientId(client.id);
                          navigateToPage(null);
                        }}
                        className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline shrink-0"
                      >
                        Select as Active
                      </button>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {deleteConfirmId === client.id ? (
                        <div className="flex items-center gap-1 shrink-0">
                          <button 
                            onClick={async () => {
                              await deleteClient(client.id);
                              setDeleteConfirmId(null);
                            }}
                            className="bg-red-600 hover:bg-red-700 text-white text-[10px] px-1.5 py-1 rounded font-bold uppercase transition"
                            title="Confirm delete"
                          >
                            Delete
                          </button>
                          <button 
                            onClick={() => setDeleteConfirmId(null)}
                            className="bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-[10px] px-1.5 py-1 rounded font-bold uppercase"
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <button 
                          onClick={() => setDeleteConfirmId(client.id)}
                          disabled={!canManageSettings}
                          className="p-1.5 hover:bg-red-50 dark:hover:bg-red-950/25 rounded-lg text-red-500 hover:text-red-700 transition disabled:opacity-40 disabled:grayscale disabled:cursor-not-allowed"
                          title={canManageSettings ? 'Delete Profile' : 'Manage Settings permission not granted'}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
        </div>
      )}

      {activePage === 'business' && (
        <div className="w-full flex flex-col">
          <PageHeader
            title="Business Profiles"
            icon={<Building2 className="text-blue-500" />}
            actions={
              editingBusiness ? (
                ownerClientId && currentClientId === ownerClientId ? (
                  <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    Currently Active
                  </span>
                ) : (
                  <button
                    onClick={() => {
                      if (ownerClientId) {
                        setCurrentClientId(ownerClientId);
                        navigateToPage(null);
                      }
                    }}
                    disabled={!ownerClientId}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2 rounded shadow-sm flex items-center gap-2 transition disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                    title="Make this business profile the active working context"
                  >
                    Set as Active
                  </button>
                )
              ) : undefined
            }
          />
          <div className="p-4 md:p-6 flex-1">
        {editingBusiness ? (
          <div className="bg-slate-100 dark:bg-slate-900 -m-6 p-6 h-full min-h-[600px] flex flex-col font-sans">
            <fieldset disabled={isBusinessLocked} className="flex-1 overflow-y-auto px-4 border-0 m-0 p-0 disabled:opacity-60 transition-opacity">
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 mb-4">
                <div className="sm:col-span-5">
                  <label className="form-label">Tin:</label>
                  <div className="flex items-center gap-1">
                    <input 
                      type="text" 
                      maxLength={3}
                      value={(editingBusiness.tin || '').split('-')[0] || ''} 
                      onChange={e => {
                        const val = e.target.value.replace(/\D/g, '');
                        const parts = (editingBusiness.tin || '').split('-');
                        parts[0] = val;
                        setEditingBusiness({...editingBusiness, tin: parts.join('-')});
                      }}
                      className="w-16 px-2 py-1.5 border border-slate-400 dark:border-slate-600 rounded bg-white dark:bg-slate-800 text-center font-mono"
                    />
                    <span>-</span>
                    <input 
                      type="text" 
                      maxLength={3}
                      value={(editingBusiness.tin || '').split('-')[1] || ''} 
                      onChange={e => {
                        const val = e.target.value.replace(/\D/g, '');
                        const parts = (editingBusiness.tin || '').split('-');
                        parts[1] = val;
                        setEditingBusiness({...editingBusiness, tin: parts.join('-')});
                      }}
                      className="w-16 px-2 py-1.5 border border-slate-400 dark:border-slate-600 rounded bg-white dark:bg-slate-800 text-center font-mono"
                    />
                    <span>-</span>
                    <input 
                      type="text" 
                      maxLength={3}
                      value={(editingBusiness.tin || '').split('-')[2] || ''} 
                      onChange={e => {
                        const val = e.target.value.replace(/\D/g, '');
                        const parts = (editingBusiness.tin || '').split('-');
                        parts[2] = val;
                        setEditingBusiness({...editingBusiness, tin: parts.join('-')});
                      }}
                      className="w-16 px-2 py-1.5 border border-slate-400 dark:border-slate-600 rounded bg-white dark:bg-slate-800 text-center font-mono"
                    />
                  </div>
                </div>
                <div className="sm:col-span-7">
                  <label className="form-label">Taxpayer Classification:</label>
                  <select 
                    value={editingBusiness.taxpayerClassification || ''}
                    onChange={e => setEditingBusiness({...editingBusiness, taxpayerClassification: e.target.value})}
                    className="form-input"
                  >
                    <option value="">Select Classification</option>
                    <option value="Individual">Individual</option>
                    <option value="Non-Individual">Non-Individual</option>
                  </select>
                </div>
              </div>

              <div className="mb-4">
                <label className="form-label">Registered Name:</label>
                <input 
                  type="text" 
                  disabled={editingBusiness.taxpayerClassification === 'Individual'}
                  value={editingBusiness.registeredName || ''} 
                  onChange={e => {
                    const val = e.target.value;
                    setEditingBusiness({...editingBusiness, registeredName: val, name: val || editingBusiness.name});
                  }}
                  className="form-input border-slate-400 dark:border-slate-600 disabled:opacity-50"
                />
              </div>

              <div className="mb-4">
                <label className="form-label">Taxpayer Name:</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div className="flex flex-col items-center">
                    <input 
                      type="text" 
                      disabled={editingBusiness.taxpayerClassification === 'Non-Individual'}
                      value={editingBusiness.lastName || ''} 
                      onChange={e => setEditingBusiness({...editingBusiness, lastName: e.target.value})}
                      className="form-input border-slate-400 dark:border-slate-600 disabled:opacity-50"
                    />
                    <span className="text-[10px] text-slate-500 mt-1 uppercase font-bold">Last Name</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <input 
                      type="text" 
                      disabled={editingBusiness.taxpayerClassification === 'Non-Individual'}
                      value={editingBusiness.firstName || ''} 
                      onChange={e => setEditingBusiness({...editingBusiness, firstName: e.target.value})}
                      className="form-input border-slate-400 dark:border-slate-600 disabled:opacity-50"
                    />
                    <span className="text-[10px] text-slate-500 mt-1 uppercase font-bold">First Name</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <input 
                      type="text" 
                      disabled={editingBusiness.taxpayerClassification === 'Non-Individual'}
                      value={editingBusiness.middleName || ''} 
                      onChange={e => setEditingBusiness({...editingBusiness, middleName: e.target.value})}
                      className="form-input border-slate-400 dark:border-slate-600 disabled:opacity-50"
                    />
                    <span className="text-[10px] text-slate-500 mt-1 uppercase font-bold">Middle Name</span>
                  </div>
                </div>
              </div>

              <div className="mb-4">
                <label className="form-label">Trade Name:</label>
                <input 
                  type="text" 
                  value={editingBusiness.tradeName || ''} 
                  onChange={e => setEditingBusiness({...editingBusiness, tradeName: e.target.value})}
                  className="form-input border-slate-400 dark:border-slate-600"
                />
              </div>

              <div className="bg-slate-200 dark:bg-slate-800/80 p-4 rounded border border-slate-300 dark:border-slate-700 mb-4">
                <label className="form-label text-slate-800 dark:text-slate-300 mb-3 font-bold">Registered/Business Address:</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4">
                  <div className="flex flex-col items-center">
                    <input 
                      value={editingBusiness.substreet || ''} 
                      onChange={e => setEditingBusiness({...editingBusiness, substreet: e.target.value})}
                      className="form-input border-slate-400"
                    />
                    <span className="text-[10px] text-slate-500 mt-1 uppercase font-bold text-center">Substreet</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <input 
                      value={editingBusiness.street || ''} 
                      onChange={e => setEditingBusiness({...editingBusiness, street: e.target.value})}
                      className="form-input border-slate-400"
                    />
                    <span className="text-[10px] text-slate-500 mt-1 uppercase font-bold text-center">Street</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <input 
                      value={editingBusiness.barangay || ''} 
                      onChange={e => setEditingBusiness({...editingBusiness, barangay: e.target.value})}
                      className="form-input border-slate-400"
                    />
                    <span className="text-[10px] text-slate-500 mt-1 uppercase font-bold text-center">Barangay</span>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div className="flex flex-col items-center">
                    <input 
                      value={editingBusiness.district || ''} 
                      onChange={e => setEditingBusiness({...editingBusiness, district: e.target.value})}
                      className="form-input border-slate-400"
                    />
                    <span className="text-[10px] text-slate-500 mt-1 uppercase font-bold text-center leading-tight">District/Municipality</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <input 
                      value={editingBusiness.city || ''} 
                      onChange={e => setEditingBusiness({...editingBusiness, city: e.target.value})}
                      className="form-input border-slate-400"
                    />
                    <span className="text-[10px] text-slate-500 mt-1 uppercase font-bold text-center leading-tight">City/Province</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <input 
                      value={editingBusiness.zipCode || ''} 
                      onChange={e => setEditingBusiness({...editingBusiness, zipCode: e.target.value})}
                      className="form-input border-slate-400"
                    />
                    <span className="text-[10px] text-slate-500 mt-1 uppercase font-bold text-center">Zip Code</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-end mb-6">
                <div className="sm:col-span-4">
                  <label className="form-label">Contact Number:</label>
                  <input
                    type="text"
                    value={editingBusiness.phone || ''}
                    onChange={e => setEditingBusiness({...editingBusiness, phone: e.target.value})}
                    className="form-input border-slate-400 dark:border-slate-600"
                  />
                </div>
                <div className="sm:col-span-5">
                  <label className="form-label">Registered Email Address:</label>
                  <input
                    type="email"
                    value={editingBusiness.email || ''}
                    onChange={e => setEditingBusiness({...editingBusiness, email: e.target.value})}
                    className="form-input border-slate-400 dark:border-slate-600"
                  />
                </div>
                <div className="sm:col-span-3 flex items-center gap-4 py-3">
                  <label className="flex items-center gap-2 cursor-pointer group">
                    <input
                      type="radio"
                      className="w-4 h-4"
                      name="businessCategory"
                      checked={(editingBusiness.category || 'private') === 'private'}
                      onChange={() => setEditingBusiness({...editingBusiness, category: 'private'})}
                    />
                    <span className="text-xs font-bold uppercase tracking-tight">Private</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer group">
                    <input
                      type="radio"
                      className="w-4 h-4"
                      name="businessCategory"
                      checked={editingBusiness.category === 'government'}
                      onChange={() => setEditingBusiness({...editingBusiness, category: 'government'})}
                    />
                    <span className="text-xs font-bold uppercase tracking-tight">Government</span>
                  </label>
                </div>
                <div className="sm:col-span-12 -mt-2 mb-2">
                  <label className="flex items-center gap-2 cursor-pointer group w-max">
                    <input
                      type="checkbox"
                      className="w-4 h-4 rounded"
                      checked={editingBusiness.hasMultipleBusinessLines || false}
                      onChange={e => setEditingBusiness({...editingBusiness, hasMultipleBusinessLines: e.target.checked})}
                    />
                    <span className="text-xs font-bold text-slate-600 dark:text-slate-400">Multiple lines of business (e.g. sale of goods and services)</span>
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-end mb-6">
                <div className="sm:col-span-3">
                  <label className="form-label">RDO Code:</label>
                  <select 
                    value={editingBusiness.rdoCode || ''}
                    onChange={e => setEditingBusiness({...editingBusiness, rdoCode: e.target.value})}
                    className="form-input border-slate-400"
                  >
                    <option value="">Select RDO</option>
                    {RDO_CODES.map(code => (
                      <option key={code} value={code.split(' - ')[0]}>{code}</option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-5 flex items-center gap-6 py-3 px-2">
                  <label className="flex items-center gap-2 cursor-pointer group">
                     <input 
                       type="radio" 
                       className="w-4 h-4"
                       name="accountingTypeBusinessMode" 
                       checked={editingBusiness.accountingType === 'Calendar'}
                       onChange={() => setEditingBusiness({...editingBusiness, accountingType: 'Calendar'})}
                     />
                     <span className="text-xs font-bold uppercase tracking-tight">Calendar</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer group">
                     <input 
                       type="radio" 
                       className="w-4 h-4"
                       name="accountingTypeBusinessMode" 
                       checked={editingBusiness.accountingType === 'Fiscal'}
                       onChange={() => setEditingBusiness({...editingBusiness, accountingType: 'Fiscal'})}
                     />
                     <span className="text-xs font-bold uppercase tracking-tight">Fiscal</span>
                  </label>
                </div>
                <div className="sm:col-span-4">
                  <label className="form-label">Fiscal Month End:</label>
                  <select 
                    disabled={editingBusiness.accountingType !== 'Fiscal'}
                    value={editingBusiness.fiscalMonthEnd || 12}
                    onChange={e => setEditingBusiness({...editingBusiness, fiscalMonthEnd: parseInt(e.target.value)})}
                    className="form-input disabled:opacity-50 border-slate-400"
                  >
                    {Array.from({length: 12}, (_, i) => (
                      <option key={i+1} value={i+1}>{i+1}</option>
                    ))}
                  </select>
                </div>
              </div>
            </fieldset>

            {/* Form Footer */}
            {!isBusinessLocked && missingBusinessRequired.length > 0 && (
              <p className="px-4 pb-2 text-xs font-semibold text-red-500">
                Complete all required fields to start: {missingBusinessRequired.join(', ')}.
              </p>
            )}
            <div className="border-t border-slate-300 dark:border-slate-700 pt-4 flex justify-end items-center gap-3 px-4">
              <div className="flex gap-3">
                <button 
                  onClick={handleSaveBusinessProfile}
                  disabled={isBusinessLocked || missingBusinessRequired.length > 0}
                  title={missingBusinessRequired.length > 0 ? `Missing: ${missingBusinessRequired.join(', ')}` : 'Save business profile'}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-6 py-2 rounded shadow-sm flex items-center gap-2 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Save className="w-4 h-4" /> Save
                </button>
                <button
                  onClick={() => setIsBusinessLocked(false)}
                  disabled={!isBusinessLocked}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-6 py-2 rounded shadow-sm flex items-center gap-2 transition disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:dark:bg-slate-700 disabled:text-slate-700 disabled:dark:text-slate-300"
                >
                  <Pencil className="w-4 h-4" /> Edit
                </button>
                <button 
                  onClick={() => {
                    if (businessProfile) {
                      setEditingBusiness({ ...businessProfile });
                      setIsBusinessLocked(true);
                    }
                  }}
                  disabled={isBusinessLocked}
                  className="bg-slate-200 dark:bg-slate-700 font-bold px-6 py-2 rounded border border-slate-400 dark:border-slate-600 shadow-sm hover:bg-slate-300 dark:hover:bg-slate-600 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <RotateCcw className="w-4 h-4" /> Revert
                </button>
                <button 
                  onClick={() => {
                    navigateToPage(null);
                    setIsBusinessLocked(false);
                  }}
                  className="bg-slate-200 dark:bg-slate-700 font-bold px-6 py-2 rounded border border-slate-400 dark:border-slate-600 shadow-sm hover:bg-slate-300 dark:hover:bg-slate-600 flex items-center gap-2"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <Building2 className="w-16 h-16 text-slate-300 mb-4" />
            <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-2">My Business Profile</h2>
            <p className="text-slate-500 dark:text-slate-400 max-w-sm mb-6">Create your own business/firm profile to track your corporate identity, configuration, and tax info separately from your client profiles.</p>
            
            <div className="flex flex-col sm:flex-row gap-2 w-full max-w-md bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
              <input 
                type="text" 
                placeholder="Business / Firm Name" 
                value={newBusinessName}
                onChange={e => setNewBusinessName(e.target.value)}
                className="form-input flex-1"
              />
              <button 
                onClick={handleCreateBusinessProfile} 
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 transition active:scale-95 shrink-0 shadow-md"
              >
                <Plus className="w-5 h-5" /> Let's Go
              </button>
            </div>
          </div>
        )}
      </div>
        </div>
      )}

      {activePage === 'reports' && (
        <div className="w-full flex flex-col">
          <PageHeader title="Accounting Reports" icon={<TrendingUp className="text-indigo-500" />} />
          <div className="p-4 md:p-6 flex-1">
         <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
           <button 
             onClick={() => navigateToPage('pl')}
             className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800 p-6 rounded-2xl text-left hover:bg-indigo-100 transition-colors"
           >
             <div className="flex items-center gap-3 mb-2">
               <TrendingUp className="text-indigo-600 w-5 h-5" />
               <div className="text-sm font-bold text-indigo-500 uppercase tracking-wide">Profit & Loss</div>
             </div>
             <p className="text-xs text-slate-600 dark:text-slate-400">View your income, expenses, and net profit results for a specific period.</p>
           </button>
           <button 
             onClick={() => navigateToPage('trialbalance')}
             className="bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 p-6 rounded-2xl text-left hover:bg-slate-100 transition-colors"
           >
             <div className="flex items-center gap-3 mb-2">
               <Scale className="text-slate-600 w-5 h-5" />
               <div className="text-sm font-bold text-slate-500 uppercase tracking-wide">Trial Balance</div>
             </div>
             <p className="text-xs text-slate-600 dark:text-slate-400">Check the equality of your debits and credits across all accounts.</p>
           </button>
           <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800 p-6 rounded-2xl opacity-50">
             <div className="text-sm font-bold text-amber-600 mb-2 uppercase tracking-wide">Balance Sheet</div>
             <p className="text-xs text-slate-600 dark:text-slate-400 italic">Coming soon: View your assets, liabilities, and equity status.</p>
           </div>
           <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 p-6 rounded-2xl opacity-50">
             <div className="text-sm font-bold text-blue-600 mb-2 uppercase tracking-wide">Cash Flow</div>
             <p className="text-xs text-slate-600 dark:text-slate-400 italic">Coming soon: Track the flow of cash in and out of your business.</p>
           </div>
         </div>
      </div>
        </div>
      )}

      {activePage === 'books' && (
        <div className="w-full flex flex-col">
          <PageHeader title="Accounting Books" icon={<Library className="text-cyan-500" />} />
          <div className="p-4 md:p-6 flex-1">
         <div className="grid grid-cols-1 gap-4">
           <button 
             onClick={() => navigateToPage('journal')}
             className="flex items-center justify-between p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:border-cyan-500 transition-all group"
           >
             <div className="flex items-center gap-4">
               <div className="p-2 bg-cyan-50 dark:bg-cyan-900/30 rounded-lg">
                 <BookText className="text-cyan-600 w-5 h-5" />
               </div>
               <div className="text-left">
                 <div className="font-bold text-slate-800 dark:text-slate-200">General Journal</div>
                 <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Book of Original Entry</div>
               </div>
             </div>
             <span className="text-cyan-600 opacity-0 group-hover:opacity-100 transition-opacity">Open →</span>
           </button>

           <button 
             onClick={() => navigateToPage('ledger')}
             className="flex items-center justify-between p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:border-cyan-500 transition-all group"
           >
             <div className="flex items-center gap-4">
               <div className="p-2 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg">
                 <LineChart className="text-indigo-600 w-5 h-5" />
               </div>
               <div className="text-left">
                 <div className="font-bold text-slate-800 dark:text-slate-200">General Ledger</div>
                 <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Book of Final Entry</div>
               </div>
             </div>
             <span className="text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity">Open →</span>
           </button>
           <button 
             onClick={() => navigateToPage('sales-journal')}
             className="flex items-center justify-between p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:border-emerald-500 transition-all group"
           >
             <div className="flex items-center gap-4">
               <div className="p-2 bg-emerald-50 dark:bg-emerald-900/30 rounded-lg">
                 <Receipt className="text-emerald-600 w-5 h-5" />
               </div>
               <div className="text-left">
                 <div className="font-bold text-slate-800 dark:text-slate-200">Sales Journal</div>
                 <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Special Journal — Credit/On-Account Sales</div>
               </div>
             </div>
             <span className="text-emerald-600 opacity-0 group-hover:opacity-100 transition-opacity">Open →</span>
           </button>

           <button 
             onClick={() => navigateToPage('purchase-journal')}
             className="flex items-center justify-between p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:border-orange-500 transition-all group"
           >
             <div className="flex items-center gap-4">
               <div className="p-2 bg-orange-50 dark:bg-orange-900/30 rounded-lg">
                 <ShoppingCart className="text-orange-600 w-5 h-5" />
               </div>
               <div className="text-left">
                 <div className="font-bold text-slate-800 dark:text-slate-200">Purchases Journal</div>
                 <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Special Journal — Purchases on Account</div>
               </div>
             </div>
             <span className="text-orange-600 opacity-0 group-hover:opacity-100 transition-opacity">Open →</span>
           </button>

           <button 
             onClick={() => navigateToPage('cash-receipt')}
             className="flex items-center justify-between p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:border-blue-500 transition-all group"
           >
             <div className="flex items-center gap-4">
               <div className="p-2 bg-blue-50 dark:bg-blue-900/30 rounded-lg">
                 <Wallet className="text-blue-600 w-5 h-5" />
               </div>
               <div className="text-left">
                 <div className="font-bold text-slate-800 dark:text-slate-200">Cash Receipts Journal</div>
                 <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Special Journal — Cash Inflows</div>
               </div>
             </div>
             <span className="text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity">Open →</span>
           </button>

           <button 
             onClick={() => navigateToPage('cash-disbursement')}
             className="flex items-center justify-between p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:border-rose-500 transition-all group"
           >
             <div className="flex items-center gap-4">
               <div className="p-2 bg-rose-50 dark:bg-rose-900/30 rounded-lg">
                 <CreditCard className="text-rose-600 w-5 h-5" />
               </div>
               <div className="text-left">
                 <div className="font-bold text-slate-800 dark:text-slate-200">Cash Disbursements Journal</div>
                 <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Special Journal — Cash Outflows</div>
               </div>
             </div>
             <span className="text-rose-600 opacity-0 group-hover:opacity-100 transition-opacity">Open →</span>
           </button>

           <div className="p-6 text-center bg-slate-50 dark:bg-slate-800/30 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700">
             <BookOpen className="w-8 h-8 mx-auto mb-2 text-slate-300" />
             <p className="text-xs text-slate-500 font-medium italic">Subsidiary ledgers (e.g. Accounts Receivable, Accounts Payable) will appear here as you expand your accounting system.</p>
           </div>
         </div>
      </div>
        </div>
      )}

      {activePage === 'taxnotes' && (
        <div className="w-full flex flex-col">
          <PageHeader title="Tax Notes & Estimates" icon={<Lightbulb className="text-yellow-500" />} />
          <div className="p-4 md:p-6 flex-1">
         <div className="bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-800 p-6 rounded-2xl flex flex-col gap-4">
            <div className="flex justify-between items-center bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm">
               <span className="font-semibold text-slate-700 dark:text-slate-300">Estimated Income Tax (25% based on Gross)</span>
               <span className="font-extrabold text-lg text-red-600">₱{(gp > 0 ? gp * 0.25 : 0).toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm">
               <span className="font-semibold text-slate-700 dark:text-slate-300">Available Input VAT (from current DAT)</span>
               <span className="font-extrabold text-lg text-blue-600">₱{totalIpTax.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
            </div>
         </div>
      </div>
        </div>
      )}

      {/* Placeholders for deep accounting features that were blank in the original HTML */}
      {activePage === 'trialbalance' && (
        <div className="w-full flex flex-col">
          <PageHeader title="Trial Balance" icon={<Scale />} centered />
          <div className="p-4 md:p-6 flex-1">
            {currentClient ? (() => {
              const balances = [...trialBalances];
              // Chart of Accounts is the single source of truth for the account
              // title and the opening (beginning) balance — the server RPC
              // doesn't reliably return the title, so look both up locally.
              // Use the full, unfiltered account list (not getCoaAccounts, which
              // drops hidden accounts) so every account's opening balance is
              // found even if it's since been hidden in the Chart of Accounts.
              const coaAccounts = currentClient.accounts && currentClient.accounts.length > 0
                ? currentClient.accounts
                : (currentClient.coaFormat === 'alphanumeric' ? DEFAULT_ACCOUNTS_ALPHA : DEFAULT_ACCOUNTS);
              const coaById = new Map(coaAccounts.map(a => [String(a.id), a]));
              // The server RPC groups special-journal postings by account name
              // (stored inside journal_entries.values jsonb), so its
              // account_id often does not match a coa_accounts.id. Resolve
              // each row's Chart of Accounts entry by id first, then by name,
              // so the opening (beginning) balance — which lives only on the
              // CoA entry — is always found instead of silently falling back
              // to 0.
              const resolveCoaAccount = (row: { account_id: string; account_name?: string }) => {
                const byId = coaById.get(String(row.account_id));
                if (byId) return byId;
                if (row.account_name) {
                  const byName = findAccountByLabel(String(row.account_name), coaAccounts);
                  if (byName) return byName;
                }
                return undefined;
              };
              // The General Ledger is the recorded source for each account's
              // beginning balance: its opening balance (from the Chart of
              // Accounts) rolled forward through every entry posted before
              // the trial balance year — the same formula the General Ledger
              // page itself uses for its "Beginning Balance" row.
              const glById = new Map((currentClient.glAccounts || []).map(g => [String(g.accountId ?? g.id), g]));
              const yearStart = `${trialBalanceYear}-01-01`;
              const getBeginningBalance = (row: { account_id: string; account_name?: string }) => {
                const coaAccount = resolveCoaAccount(row);
                const glAccount = glById.get(String(row.account_id));
                return glAccountBalanceBefore({
                  id: String(row.account_id),
                  accountTitle: coaAccount?.name || '',
                  entries: glAccount?.entries || [],
                  openingBalance: coaAccount?.openingBalance ?? glAccount?.openingBalance ?? 0,
                  normalSide: coaAccount?.normalSide || glAccount?.normalSide || getNormalSide(coaAccount?.type || ''),
                }, yearStart);
              };
              // (Missing-account merge happens below, after yearBalances is built.)
              // Debit & Credit columns come straight from the General Ledger:
              // each account's ledger Debit / Credit entries for the trial
              // balance year. The beginning balance is stored on the ledger
              // account (not as an entry), so summing entries excludes it.
              const glClient = glClientTb ?? currentClient;
              const yearBalances = new Map(
                getAccountBalances(glClient, trialBalanceYear).map(b => [String(b.account.id), b])
              );
              // Per-account year Debit / Credit, summed from the General
              // Ledger (beginning balance excluded — it is not an entry).
              // Used by both the row cells and the TOTAL row so they agree.
              const rowYearDebit = (x: any) => {
                const yb = yearBalances.get(String(resolveCoaAccount(x)?.id ?? x.account_id));
                return yb ? yb.currentYearDebit : Number(x.period_debit || 0);
              };
              const rowYearCredit = (x: any) => {
                const yb = yearBalances.get(String(resolveCoaAccount(x)?.id ?? x.account_id));
                return yb ? yb.currentYearCredit : Number(x.period_credit || 0);
              };
              // Merge in any CoA account missing from the server RPC result —
              // including revenue/expense accounts (Sales, Expenses), which
              // usually have zero opening balance but carry year activity.
              const representedIds = new Set(balances.map(x => String(resolveCoaAccount(x)?.id ?? x.account_id)));
              coaAccounts.forEach(a => {
                if (representedIds.has(String(a.id))) return;
                const opening = Number(a.openingBalance) || 0;
                const yb = yearBalances.get(String(a.id));
                const yearDr = yb?.currentYearDebit || 0;
                const yearCr = yb?.currentYearCredit || 0;
                if (opening === 0 && yearDr === 0 && yearCr === 0) return;
                const normal = a.normalSide || getNormalSide(a.type || '');
                const signedOpening = normal === 'credit' ? -Math.abs(opening) : Math.abs(opening);
                balances.push({
                  account_id: String(a.id),
                  account_name: a.name,
                  account_type: a.type,
                  balance: signedOpening + yearDr - yearCr,
                  period_debit: yearDr,
                  period_credit: yearCr,
                  period_balance: yearDr - yearCr,
                });
              });
              // Sort by account code (natural order, so 1010 < 1020 < 10100
              // and sub-accounts stay under their parent) using the resolved
              // Chart of Accounts code, falling back to the RPC account_id.
              balances.sort((a, b) => {
                const ca = resolveCoaAccount(a);
                const cb = resolveCoaAccount(b);
                const codeA = String(ca?.id ?? a.account_id ?? '');
                const codeB = String(cb?.id ?? b.account_id ?? '');
                return codeA.localeCompare(codeB, undefined, { numeric: true, sensitivity: 'base' });
              });
              const totalDebit = balances.reduce((n, x) => n + rowYearDebit(x), 0);
              const totalCredit = balances.reduce((n, x) => n + rowYearCredit(x), 0);
              const totalBeginning = balances.reduce((n, x) => n + getBeginningBalance(x), 0);
              const totalEnding = totalBeginning + totalDebit - totalCredit;
              return (
                <div className="max-w-4xl mx-auto">
                  {trialBalanceError && <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm">{trialBalanceError}</div>}
                  {!trialBalanceError && balances.length === 0 && <div className="mb-4 text-center text-sm text-slate-400">Loading server-calculated balances…</div>}
                  <div className="text-center mb-6">
                    <h2 className="font-bold text-lg uppercase">{currentClient.tradeName || currentClient.name}</h2>
                    <p className="text-sm text-slate-500">Trial Balance — Current Year {trialBalanceYear}</p>
                  </div>
                  <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-slate-800/60 font-bold">
                          <th className="px-4 py-3 text-left">Account</th>
                          <th className="px-4 py-3 text-right">Beginning Balance</th>
                          <th className="px-4 py-3 text-right">Debit</th>
                          <th className="px-4 py-3 text-right">Credit</th>
                          <th className="px-4 py-3 text-right">Ending Balance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {balances.map(x => {
                          const coaAccount = resolveCoaAccount(x);
                          const accountCode = coaAccount?.id || x.account_id;
                          const accountTitle = coaAccount?.name || x.account_name;
                          const beginningBalance = getBeginningBalance(x);
                          const debit = rowYearDebit(x);
                          const credit = rowYearCredit(x);
                          // Ending Balance = Beginning + period Debits − period Credits
                          // (beginning is signed: debit-normal positive, credit-normal negative)
                          const endingBalance = beginningBalance + debit - credit;
                          return (
                            <tr key={x.account_id} className="border-t border-slate-100 dark:border-slate-800">
                              <td className="px-4 py-2">{accountCode} — {accountTitle}</td>
                              <td className="px-4 py-2 text-right font-mono">{beginningBalance ? formatAccountAmount(beginningBalance) : ''}</td>
                              <td className="px-4 py-2 text-right font-mono">{debit ? formatAccountAmount(debit) : ''}</td>
                              <td className="px-4 py-2 text-right font-mono">{credit ? formatAccountAmount(credit) : ''}</td>
                              <td className="px-4 py-2 text-right font-mono">{endingBalance ? formatAccountAmount(endingBalance) : ''}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="bg-slate-100 dark:bg-slate-800 font-bold border-t-2">
                          <td className="px-4 py-3">TOTAL</td>
                          <td className="px-4 py-3 text-right font-mono">{formatAccountAmount(totalBeginning)}</td>
                          <td className="px-4 py-3 text-right font-mono">{formatAccountAmount(totalDebit)}</td>
                          <td className="px-4 py-3 text-right font-mono">{formatAccountAmount(totalCredit)}</td>
                          <td className="px-4 py-3 text-right font-mono">{formatAccountAmount(totalEnding)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  <div className={`mt-4 p-3 rounded-lg text-center font-bold ${Math.abs(totalDebit - totalCredit) < 0.01 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                    {Math.abs(totalDebit - totalCredit) < 0.01 ? 'BALANCED' : `OUT OF BALANCE — Difference: ${formatAccountAmount(totalDebit - totalCredit)}`}
                  </div>
                </div>
              );
            })() : (
              <p className="text-center p-8 text-slate-500">Select a client to view the trial balance.</p>
            )}
          </div>
        </div>
      )}

      {activePage === 'sales-journal' && (
        <div className="w-full flex flex-col">
          <PageHeader title="Sales Journal" icon={<Receipt className="text-emerald-500" />} />
          <div className="p-4 md:p-6 flex-1">
         <div className="p-2">
            <p className="text-sm text-slate-500 mb-4">Income entries posted here automatically when Payment Type is Credit Card or On Account (recorded in Cash Receipts Journal instead).</p>

            {creditSalesEntries.length === 0 ? (
              <div className="p-12 text-center text-slate-500 dark:text-slate-400">
                <Receipt className="w-10 h-10 mx-auto mb-3 opacity-20" />
                <p className="font-medium">No Credit Card / On Account income entries yet.</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Invoice #</th>
                      <th>Customer</th>
                      <th>Payment Type</th>
                      <th>VAT Class</th>
                      <th className="text-right">Net of VAT</th>
                      <th className="text-right">VAT</th>
                      <th className="text-right">Gross Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {creditSalesEntries.map(s => (
                      <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-colors">
                        <td>{s.date}</td>
                        <td>{s.ref || '—'}</td>
                        <td className="font-medium">{s.buyerName}</td>
                        <td>
                          <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-xs font-medium">{s.paymentType}</span>
                        </td>
                        <td>
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400 font-semibold uppercase">{s.vatType || '—'}</span>
                        </td>
                        <td className="text-right font-mono">₱{(s.netOfVat ?? s.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        <td className="text-right font-mono text-blue-600 dark:text-blue-400">₱{(s.outputTax ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        <td className="text-right font-bold">₱{s.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="mt-6 bg-emerald-50 dark:bg-emerald-900/20 p-4 rounded-xl border border-emerald-100 dark:border-emerald-800 flex justify-between items-center">
               <span className="font-bold text-emerald-700 dark:text-emerald-400">Total Sales Journal (Credit Card / On Account)</span>
               <span className="text-xl font-extrabold text-emerald-600 dark:text-emerald-400">₱{creditSalesTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
         </div>
      </div>
        </div>
      )}
    </>
  );
}

