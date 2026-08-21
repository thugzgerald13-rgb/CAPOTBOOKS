import { useState, useEffect } from 'react';
import { PageHeader } from './ui/PageHeader';
import { useAccounting } from '../context/AccountingContext';
import { useAuth } from '../context/AuthContext';
import { Users, TrendingUp, Key, Lightbulb, BookOpen, BookText, LineChart, Scale, Plus, Building2, Save, X, RotateCcw, Library, FileText, Receipt, ShoppingCart, Banknote, Wallet, CreditCard, Trash2 } from 'lucide-react';
import { Client, BusinessProfile } from '../types';
import { RDO_CODES } from '../lib/utils';
import { getAccountBalances, getCurrentYear, formatAccountAmount } from '../lib/accountingBalances';

export function Extras() {
  const { 
    clients, 
    currentClientId, 
    setCurrentClientId, 
    addClient, 
    navigateToPage, 
    currentClient, 
    saveClient, 
    activePage, 
    deleteClient,
    businessProfile,
    saveBusinessProfile,
    ownerClientId
  } = useAccounting();
  const { userRole } = useAuth();
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Dedicated management state for own business profile
  const [editingBusiness, setEditingBusiness] = useState<BusinessProfile | null>(null);
  const [newBusinessName, setNewBusinessName] = useState('');

  // Synchronize when the business profile page opens/updates
  useEffect(() => {
    if (activePage === 'business') {
      if (businessProfile) {
        setEditingBusiness({ ...businessProfile });
      } else {
        setEditingBusiness(null);
      }
    }
  }, [activePage, businessProfile]);

  useEffect(() => {
    if (activePage === null) {
      setEditingClient(null);
      setEditingBusiness(null);
    }
  }, [activePage]);

  const handleEditClient = (client: Client) => {
    setEditingClient({ ...client });
  };

  const handleSaveProfile = () => {
    if (editingClient) {
      saveClient(editingClient.id, editingClient);
      setEditingClient(null);
    }
  };

  const handleSaveBusinessProfile = () => {
    if (editingBusiness) {
      saveBusinessProfile(editingBusiness);
    }
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
      setNewBusinessName('');
    }
  };

  const handleAddClient = () => {
    const existingCount = Object.values(clients).filter((client: Client) => client.id !== ownerClientId).length;
    addClient(`New Client ${existingCount + 1}`);
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
                onClick={() => setEditingClient(null)}
                className="hover:bg-slate-400 dark:hover:bg-slate-700 rounded p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4">
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
            </div>

            {/* Form Footer */}
            <div className="border-t border-slate-300 dark:border-slate-700 pt-4 flex justify-end gap-3 px-4">
              <button 
                onClick={handleSaveProfile}
                className="bg-slate-200 dark:bg-slate-700 font-bold px-6 py-2 rounded border border-slate-400 dark:border-slate-600 shadow-sm hover:bg-slate-300 dark:hover:bg-slate-600 flex items-center gap-2"
              >
                <Save className="w-4 h-4" /> Save
              </button>
              <button 
                onClick={() => setEditingClient({...clients[editingClient.id]})}
                className="bg-slate-200 dark:bg-slate-700 font-bold px-6 py-2 rounded border border-slate-400 dark:border-slate-600 shadow-sm hover:bg-slate-300 dark:hover:bg-slate-600 flex items-center gap-2"
              >
                <RotateCcw className="w-4 h-4" /> Revert
              </button>
              <button 
                onClick={() => setEditingClient(null)}
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
                          className="p-1.5 hover:bg-red-50 dark:hover:bg-red-950/25 rounded-lg text-red-500 hover:text-red-700 transition"
                          title="Delete Profile"
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
          <PageHeader title="Business Profiles" icon={<Building2 className="text-blue-500" />} />
          <div className="p-4 md:p-6 flex-1">
        {editingBusiness ? (
          <div className="bg-slate-100 dark:bg-slate-900 -m-6 p-6 h-full min-h-[600px] flex flex-col font-sans">
            <div className="flex-1 overflow-y-auto px-4">
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
            </div>

            {/* Form Footer */}
            <div className="border-t border-slate-300 dark:border-slate-700 pt-4 flex justify-between items-center gap-3 px-4">
              <div>
                {ownerClientId && currentClientId === ownerClientId ? (
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
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-6 py-2 rounded shadow-sm flex items-center gap-2 transition disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Make this business profile the active working context"
                  >
                    Set as Active
                  </button>
                )}
              </div>
              <div className="flex gap-3">
                <button 
                  onClick={handleSaveBusinessProfile}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-6 py-2 rounded shadow-sm flex items-center gap-2 transition"
                >
                  <Save className="w-4 h-4" /> Save
                </button>
                <button 
                  onClick={() => {
                    if (businessProfile) {
                      setEditingBusiness({ ...businessProfile });
                    }
                  }}
                  className="bg-slate-200 dark:bg-slate-700 font-bold px-6 py-2 rounded border border-slate-400 dark:border-slate-600 shadow-sm hover:bg-slate-300 dark:hover:bg-slate-600 flex items-center gap-2"
                >
                  <RotateCcw className="w-4 h-4" /> Revert
                </button>
                <button 
                  onClick={() => navigateToPage(null)}
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
           
           <div className="p-8 text-center bg-slate-50 dark:bg-slate-800/30 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700">
             <BookOpen className="w-8 h-8 mx-auto mb-2 text-slate-300" />
             <p className="text-xs text-slate-500 font-medium italic">Subsidiary ledgers and specialized journals will appear here as you expand your accounting system.</p>
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
              const year = getCurrentYear(currentClient);
              const balances = getAccountBalances(currentClient, year);
              const totalDebit = balances.reduce((n, x) => n + Math.max(0, x.currentYearBalance), 0);
              const totalCredit = balances.reduce((n, x) => n + Math.max(0, -x.currentYearBalance), 0);
              return (
                <div className="max-w-4xl mx-auto">
                  <div className="text-center mb-6">
                    <h2 className="font-bold text-lg uppercase">{currentClient.tradeName || currentClient.name}</h2>
                    <p className="text-sm text-slate-500">Trial Balance — Current Year {year}</p>
                  </div>
                  <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-slate-800/60 font-bold">
                          <th className="px-4 py-3 text-left">Account</th>
                          <th className="px-4 py-3 text-left">Type</th>
                          <th className="px-4 py-3 text-right">Debit</th>
                          <th className="px-4 py-3 text-right">Credit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {balances.map(x => {
                          const debit = Math.max(0, x.currentYearBalance);
                          const credit = Math.max(0, -x.currentYearBalance);
                          return (
                            <tr key={x.account.id} className="border-t border-slate-100 dark:border-slate-800">
                              <td className="px-4 py-2">{x.account.id} — {x.account.name}</td>
                              <td className="px-4 py-2">{x.account.type}</td>
                              <td className="px-4 py-2 text-right font-mono">{debit ? formatAccountAmount(debit) : ''}</td>
                              <td className="px-4 py-2 text-right font-mono">{credit ? formatAccountAmount(credit) : ''}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="bg-slate-100 dark:bg-slate-800 font-bold border-t-2">
                          <td className="px-4 py-3" colSpan={2}>TOTAL</td>
                          <td className="px-4 py-3 text-right font-mono">{formatAccountAmount(totalDebit)}</td>
                          <td className="px-4 py-3 text-right font-mono">{formatAccountAmount(totalCredit)}</td>
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
