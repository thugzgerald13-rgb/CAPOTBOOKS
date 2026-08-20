import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Client, BusinessProfile, DatSelection } from '../types';
import { supabase } from '../lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { useAuth } from './AuthContext';
import { handleSupabaseError, OperationType } from '../lib/supabaseUtils';
import { syncGeneralLedger, syncCashDisbursementsJournal } from '../lib/glPosting';

interface AccountingContextType {
  clients: Record<string, Client>;
  currentClientId: string | null;
  currentClient: Client | null;
  businessProfile: BusinessProfile | null;
  isDarkMode: boolean;
  activePage: string | null;
  currentDat: DatSelection | null;
  historyTab: string;
  birFormTab: string;
  toastMsg: string | null;
  isSyncing: boolean;
  syncError: string | null;
  syncData: () => Promise<void>;

  setDarkMode: (value: boolean) => void;
  navigateToPage: (page: string | null) => void;
  setHistoryTab: (tab: string) => void;
  setBirFormTab: (tab: string) => void;
  setCurrentClientId: (id: string) => void;
  setCurrentDat: (dat: DatSelection | null) => void;

  saveClient: (id: string, clientData: Client) => Promise<void>;
  addClient: (name: string) => Promise<void>;
  deleteClient: (id: string) => Promise<void>;
  saveBusinessProfile: (profile: BusinessProfile) => Promise<void>;
  showToast: (msg: string) => void;

  // Device adaptations support
  activeDevice: 'mobile' | 'tablet' | 'desktop';
}

const AccountingContext = createContext<AccountingContextType | undefined>(undefined);

const LOCAL_STORAGE_KEY = 'capo_accounting_v14_react';
const OLD_STORAGE_KEY = 'capo_accounting_v13_react';

const defaultBusinessProfile = (name: string): BusinessProfile => ({
  id: 'client_owner',
  name,
  tin: '000-000-000-000',
  taxpayerClassification: 'Individual',
  registeredName: name,
  lastName: '',
  firstName: '',
  middleName: '',
  tradeName: 'General Trade/Services',
  substreet: '',
  street: 'Main Street',
  barangay: 'Barangay 1',
  district: 'District 1',
  city: 'Metro Manila',
  zipCode: '1000',
  rdoCode: '043B',
  accountingType: 'Calendar',
  fiscalMonthEnd: 12,
});

const buildMatchingClient = (profileData: BusinessProfile, existing: Client | undefined): Client =>
  ({
    id: 'client_owner',
    name: profileData.name,
    tin: profileData.tin || '',
    taxpayerClassification: profileData.taxpayerClassification || '',
    registeredName: profileData.registeredName || profileData.name,
    lastName: profileData.lastName || '',
    firstName: profileData.firstName || '',
    middleName: profileData.middleName || '',
    tradeName: profileData.tradeName || '',
    substreet: profileData.substreet || '',
    street: profileData.street || '',
    barangay: profileData.barangay || '',
    district: profileData.district || '',
    city: profileData.city || '',
    zipCode: profileData.zipCode || '',
    rdoCode: profileData.rdoCode || '',
    phone: profileData.phone || existing?.phone || '',
    email: profileData.email || existing?.email || '',
    category: profileData.category || existing?.category || 'private',
    hasMultipleBusinessLines: profileData.hasMultipleBusinessLines ?? existing?.hasMultipleBusinessLines ?? false,
    accountingType: profileData.accountingType || 'Calendar',
    fiscalMonthEnd: profileData.fiscalMonthEnd || 12,
    tinLibrary: existing?.tinLibrary || { customers: [], suppliers: [] },
    sales: existing?.sales || [],
    purchases: existing?.purchases || [],
    expenses: existing?.expenses || [],
    folders: existing?.folders || [
      { id: 'folder_revenue', name: 'Revenue', isDefault: true, type: 'revenue' },
      { id: 'folder_expense', name: 'Expense', isDefault: true, type: 'expense' },
    ],
    files: existing?.files || [],
    payableInvoices: existing?.payableInvoices || [],
    withholdingTaxEntries: existing?.withholdingTaxEntries || [],
    taxDeadlines: existing?.taxDeadlines || [],
  }) as unknown as Client;

type AccountingProviderProps = {
    children: React.ReactNode;
};

export function AccountingProvider({
    children,
}: AccountingProviderProps) {
  const { user, userRole } = useAuth();
  const [clients, setClients] = useState<Record<string, Client>>({});
  const [currentClientId, setCurrentClientId] = useState<string | null>(null);
  const [businessProfile, setBusinessProfile] = useState<BusinessProfile | null>(null);
  const [isDarkMode, setDarkMode] = useState(false);
  // activePage is derived from the URL route, so every page has its own
  // real URL: browser back/forward and refresh-to-stay-there both work.
  // '/' (or no path) means no page is active (Dashboard shows).
  const location = useLocation();
  const navigate = useNavigate();
  const activePage = (() => {
    const path = location.pathname.replace(/^\/+/, '');
    return path === '' ? null : decodeURIComponent(path);
  })();
  const [currentDat, setCurrentDat] = useState<DatSelection | null>(null);
  const [historyTab, setHistoryTab] = useState('expenses');
  const [birFormTab, setBirFormTab] = useState('tracker');
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Device Adaptations state
  const [activeDevice, setActiveDevice] = useState<'mobile' | 'tablet' | 'desktop'>('desktop');

  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      if (width < 768) {
        setActiveDevice('mobile');
      } else if (width < 1024) {
        setActiveDevice('tablet');
      } else {
        setActiveDevice('desktop');
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  const [isReady, setIsReady] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const syncData = async () => {
    if (!user || !isReady) return;
    setIsSyncing(true);

    const keysToMigrate = [LOCAL_STORAGE_KEY, OLD_STORAGE_KEY];
    let totalMigrated = 0;

    try {
      for (const key of keysToMigrate) {
        const saved = localStorage.getItem(key);
        if (!saved) continue;

        const localData = JSON.parse(saved) as Record<string, Client>;
        const localIds = Object.keys(localData);
        if (localIds.length === 0) continue;

        console.log(`Manual sync: migrating ${key}...`);
        const rows = localIds.map((id) => ({
          id,
          user_id: user.id,
          data: localData[id],
          updated_at: new Date().toISOString(),
        }));

        const { error } = await supabase.from('clients').upsert(rows, { onConflict: 'id' });
        if (error) throw error;

        totalMigrated += rows.length;
        localStorage.removeItem(key);
      }

      if (totalMigrated > 0) {
        showToast(`Successfully synced ${totalMigrated} items to cloud`);
      } else {
        showToast('Cloud sync complete (no new local changes found)');
      }
    } catch (e) {
      console.error('Manual sync failed', e);
      showToast('Sync failed. Check console for details.');
    } finally {
      setIsSyncing(false);
    }
  };

  // Initialize UI preferences (Dark Mode)
  useEffect(() => {
    const darkMode = localStorage.getItem('capo_dark_mode') === 'true';
    setDarkMode(darkMode);
  }, []);

  // Sync dark mode class and cloud pref
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      document.body.classList.add('dark');
      localStorage.setItem('capo_dark_mode', 'true');
    } else {
      document.documentElement.classList.remove('dark');
      document.body.classList.remove('dark');
      localStorage.setItem('capo_dark_mode', 'false');
    }

    // Sync to cloud if logged in
    if (user && isReady) {
      const syncPref = async () => {
        try {
          const { error } = await supabase
            .from('profiles')
            .upsert({ id: user.id, is_dark_mode: isDarkMode, updated_at: new Date().toISOString() }, { onConflict: 'id' });
          if (error) throw error;
        } catch (e) {
          console.error('Failed to sync theme pref', e);
        }
      };
      syncPref();
    }
  }, [isDarkMode, user, isReady]);

  // Load dark mode from cloud if available
  useEffect(() => {
    const loadCloudPrefs = async () => {
      if (user && isReady) {
        try {
          const { data, error } = await supabase
            .from('profiles')
            .select('is_dark_mode')
            .eq('id', user.id)
            .maybeSingle();
          if (error) throw error;
          if (data && typeof data.is_dark_mode === 'boolean') {
            setDarkMode(data.is_dark_mode);
          }
        } catch (e) {
          console.error('Failed to load theme pref', e);
        }
      }
    };
    loadCloudPrefs();
  }, [user, isReady]);

  // Synchronous initial load of local storage on startup for instant UI responsiveness
  useEffect(() => {
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setClients(parsed);
        const keys = Object.keys(parsed);
        if (keys.length > 0) setCurrentClientId(keys[0]);
      } catch (e) {
        console.error('Local storage parse error on startup', e);
      }
    }
    const savedBiz = localStorage.getItem('capo_business_profile_react');
    if (savedBiz) {
      try {
        setBusinessProfile(JSON.parse(savedBiz));
      } catch (e) {}
    } else {
      const defaultBiz = defaultBusinessProfile('My Business Organization');
      setBusinessProfile(defaultBiz);
      localStorage.setItem('capo_business_profile_react', JSON.stringify(defaultBiz));
    }
  }, []);

  // Real-time Supabase Sync & Local Fallback
  useEffect(() => {
    if (!user) {
      setIsReady(true);
      return;
    }

    setIsSyncing(true);
    setSyncError(null);

    let isTimedOut = false;
    let clientsChannel: RealtimeChannel | null = null;
    let bizChannel: RealtimeChannel | null = null;

    const timeout = setTimeout(() => {
      if (!isReady) {
        isTimedOut = true;
        setSyncError(
          'Connection timeout. Supabase is taking too long to respond. This usually happens if your project is paused or your internet is slow.'
        );
        setIsSyncing(false);
      }
    }, 12000);

    const mergeCloudClients = (cloudClients: Record<string, Client>) => {
      setClients((prev) => {
        const merged = { ...cloudClients };

        const keysToCheck = [LOCAL_STORAGE_KEY, OLD_STORAGE_KEY];
        keysToCheck.forEach((key) => {
          const saved = localStorage.getItem(key);
          if (saved) {
            try {
              const localData = JSON.parse(saved) as Record<string, Client>;
              Object.keys(localData).forEach((id) => {
                const localClient = localData[id];
                if (!merged[id]) {
                  console.log(`Merging local record ${id} from ${key}`);
                  merged[id] = localClient;
                } else {
                  const cloudClient = merged[id];
                  if (
                    localClient.accounts &&
                    localClient.accounts.length > 0 &&
                    (!cloudClient.accounts || cloudClient.accounts.length === 0)
                  ) {
                    console.log(`Merging local chart of accounts for client ${id}`);
                    merged[id] = {
                      ...cloudClient,
                      accounts: localClient.accounts,
                      coaFormat: localClient.coaFormat || cloudClient.coaFormat,
                    };
                  }
                }
              });
            } catch (e) {}
          }
        });

        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(merged));
        return merged;
      });

      setClients((currentMerged) => {
        if (Object.keys(currentMerged).length > 0 && !currentClientId) {
          setCurrentClientId(Object.keys(currentMerged)[0]);
        }
        return currentMerged;
      });
    };

    const initClients = async () => {
      try {
        const { data, error } = await supabase.from('clients').select('id, data').eq('user_id', user.id);
        if (isTimedOut) return;
        if (error) throw error;

        clearTimeout(timeout);
        const cloudClients: Record<string, Client> = {};
        (data || []).forEach((row) => {
          cloudClients[row.id] = row.data as Client;
        });
        mergeCloudClients(cloudClients);
        setIsSyncing(false);
        setIsReady(true);
        setSyncError(null);

        // Subscribe to realtime changes so multiple devices stay in sync (replaces onSnapshot)
        clientsChannel = supabase
          .channel(`clients-${user.id}`)
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'clients', filter: `user_id=eq.${user.id}` },
            (payload) => {
              setClients((prev) => {
                const next = { ...prev };
                if (payload.eventType === 'DELETE') {
                  delete next[(payload.old as any).id];
                } else {
                  const row = payload.new as { id: string; data: Client };
                  next[row.id] = row.data;
                }
                localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(next));
                return next;
              });
            }
          )
          .subscribe();
      } catch (error) {
        clearTimeout(timeout);
        if (isTimedOut) return;

        console.error('Sync error:', error);
        let msg = error instanceof Error ? error.message : String(error);

        if (msg.toLowerCase().includes('permission') || msg.toLowerCase().includes('rls')) {
          msg = 'Permission denied. Please ensure your Supabase Row Level Security policies are deployed and you are authorized.';
        } else if (msg.toLowerCase().includes('fetch')) {
          msg = 'Service unavailable. Check your internet connection.';
        }

        setSyncError(msg);
        setIsSyncing(false);
        setIsReady(true); // Allow skipping to local mode
      }
    };

    const initBizProfile = async () => {
      const { data, error } = await supabase
        .from('business_profiles')
        .select('data')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!error && data) {
        setBusinessProfile(data.data as BusinessProfile);
      } else {
        const defaultBiz = defaultBusinessProfile(
          (user.user_metadata?.full_name as string) || user.email?.split('@')[0] || 'My Business Organization'
        );
        defaultBiz.id = user.id;
        setBusinessProfile(defaultBiz);
        await supabase
          .from('business_profiles')
          .upsert({ user_id: user.id, data: defaultBiz, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
          .then(({ error: upsertErr }) => {
            if (upsertErr) console.error('Auto-syncing default business_profile doc failed:', upsertErr);
          });
      }

      bizChannel = supabase
        .channel(`biz-profile-${user.id}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'business_profiles', filter: `user_id=eq.${user.id}` },
          (payload) => {
            if (payload.eventType !== 'DELETE') {
              setBusinessProfile((payload.new as any).data as BusinessProfile);
            }
          }
        )
        .subscribe();
    };

    initClients();
    initBizProfile();

    return () => {
      clearTimeout(timeout);
      clientsChannel?.unsubscribe();
      bizChannel?.unsubscribe();
    };
  }, [user]);

  // Automatic Migration: Local -> Cloud
  useEffect(() => {
    const migrateData = async () => {
      if (!user || !isReady) return;

      const keysToMigrate = [LOCAL_STORAGE_KEY, OLD_STORAGE_KEY];

      for (const key of keysToMigrate) {
        const saved = localStorage.getItem(key);
        if (!saved) continue;

        try {
          const localData = JSON.parse(saved) as Record<string, Client>;
          const localIds = Object.keys(localData);
          if (localIds.length === 0) continue;

          console.log(`Checking for local data in ${key} to migrate...`);
          const rows = localIds.map((id) => ({
            id,
            user_id: user.id,
            data: localData[id],
            updated_at: new Date().toISOString(),
          }));

          const { error } = await supabase.from('clients').upsert(rows, { onConflict: 'id' });
          if (error) throw error;

          console.log(`Successfully migrated ${rows.length} records from ${key} to cloud.`);
          showToast(`Synced ${rows.length} items to cloud`);
          localStorage.removeItem(key);
        } catch (e) {
          console.error(`Migration failed for ${key}`, e);
        }
      }
    };

    migrateData();
  }, [user, isReady]);

  // Sync Business Profile to client_owner for any role
  useEffect(() => {
    if (businessProfile) {
      const existing = clients['client_owner'];
      const needsSync =
        !existing ||
        existing.name !== businessProfile.name ||
        existing.tin !== businessProfile.tin ||
        existing.registeredName !== (businessProfile.registeredName || businessProfile.name);

      if (needsSync) {
        const matchingClient = buildMatchingClient(businessProfile, existing);

        setClients((prev) => {
          const next = {
            ...prev,
            client_owner: matchingClient,
          };
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(next));
          return next;
        });

        if (!currentClientId) {
          setCurrentClientId('client_owner');
        }

        if (user && isReady) {
          supabase
            .from('clients')
            .upsert(
              { id: 'client_owner', user_id: user.id, data: matchingClient, updated_at: new Date().toISOString() },
              { onConflict: 'id' }
            )
            .then(({ error }) => {
              if (error) console.error('Auto-syncing client_owner failed:', error);
            });
        }
      }
    }
  }, [businessProfile, clients, currentClientId, user, isReady]);

  const saveClient = async (id: string, clientData: Client) => {
    const updatedClient = {
      ...clientData,
      userId: user ? user.id : undefined,
    };

    setClients((prev) => {
      const next = {
        ...prev,
        [id]: updatedClient,
      };
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(next));
      return next;
    });

    if (user) {
      try {
        const { error } = await supabase
          .from('clients')
          .upsert(
            { id, user_id: user.id, data: clientData, updated_at: new Date().toISOString() },
            { onConflict: 'id' }
          );
        if (error) throw error;
        showToast('Profile updated');
      } catch (error) {
        await handleSupabaseError(error, OperationType.UPDATE, `clients/${id}`);
      }
    } else {
      showToast('Profile updated');
    }
  };

  const addClient = async (name: string) => {
    if (!name.trim()) return;
    const newId = 'client_' + Date.now();
    const newClient: Client = {
      id: newId,
      name: name.trim(),
      tinLibrary: { customers: [], suppliers: [] },
      sales: [],
      purchases: [],
      expenses: [],
      folders: [
        { id: 'folder_revenue', name: 'Revenue', isDefault: true, type: 'revenue' },
        { id: 'folder_expense', name: 'Expense', isDefault: true, type: 'expense' },
      ],
      files: [],
    } as Client;

    setClients((prev) => {
      const next = {
        ...prev,
        [newId]: {
          ...newClient,
          userId: user ? user.id : undefined,
        },
      };
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
    setCurrentClientId(newId);

    if (user) {
      try {
        const { error } = await supabase
          .from('clients')
          .insert({ id: newId, user_id: user.id, data: newClient, updated_at: new Date().toISOString() });
        if (error) throw error;
        showToast('Client added');
      } catch (error) {
        await handleSupabaseError(error, OperationType.CREATE, `clients/${newId}`);
      }
    } else {
      showToast('Client added');
    }
  };

  const deleteClient = async (id: string) => {
    const keys = [LOCAL_STORAGE_KEY, OLD_STORAGE_KEY];
    keys.forEach((key) => {
      const saved = localStorage.getItem(key);
      if (saved) {
        try {
          const localData = JSON.parse(saved) as Record<string, Client>;
          if (localData[id]) {
            delete localData[id];
            localStorage.setItem(key, JSON.stringify(localData));
          }
        } catch (e) {}
      }
    });

    setClients((prev) => {
      const updated = { ...prev };
      delete updated[id];
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });

    if (currentClientId === id) {
      setClients((currentMerged) => {
        const remainingIds = Object.keys(currentMerged).filter((cid) => cid !== id);
        setCurrentClientId(remainingIds.length > 0 ? remainingIds[0] : null);
        return currentMerged;
      });
    }

    if (user) {
      try {
        const { error } = await supabase.from('clients').delete().eq('id', id);
        if (error) throw error;
        showToast('Client profile deleted');
      } catch (error) {
        await handleSupabaseError(error, OperationType.DELETE, `clients/${id}`);
      }
    } else {
      showToast('Client profile deleted');
    }
  };

  const saveBusinessProfile = async (profileData: BusinessProfile) => {
    setBusinessProfile(profileData);
    if (user) {
      try {
        const { error } = await supabase
          .from('business_profiles')
          .upsert(
            { user_id: user.id, data: { ...profileData, id: user.id }, updated_at: new Date().toISOString() },
            { onConflict: 'user_id' }
          );
        if (error) throw error;

        // Also update matching client 'client_owner' immediately to unlock hasClients and currentClient
        const existing = clients['client_owner'];
        const matchingClient = buildMatchingClient(profileData, existing);

        await supabase
          .from('clients')
          .upsert(
            { id: 'client_owner', user_id: user.id, data: matchingClient, updated_at: new Date().toISOString() },
            { onConflict: 'id' }
          );

        setClients((prev) => {
          const next = {
            ...prev,
            client_owner: matchingClient,
          };
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(next));
          return next;
        });

        if (!currentClientId) {
          setCurrentClientId('client_owner');
        }

        showToast('Business Profile updated');
      } catch (error) {
        await handleSupabaseError(error, OperationType.UPDATE, `business_profiles/${user.id}`);
      }
    } else {
      localStorage.setItem('capo_business_profile_react', JSON.stringify(profileData));

      const existing = clients['client_owner'];
      const matchingClient = buildMatchingClient(profileData, existing);

      setClients((prev) => {
        const next = {
          ...prev,
          client_owner: matchingClient,
        };
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(next));
        return next;
      });
      setCurrentClientId('client_owner');
      showToast('Business Profile updated');
    }
  };

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  const navigateToPage = (page: string | null) => {
    navigate(page ? `/${page}` : '/');
  };

  if (syncError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 px-6">
        <div className="bg-white dark:bg-slate-800 p-8 rounded-3xl shadow-xl border border-slate-200 dark:border-slate-700 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-2">Sync Connection Failed</h2>
          <p className="text-slate-500 dark:text-slate-400 mb-8 leading-relaxed text-sm">{syncError}</p>
          <div className="flex flex-col gap-3">
            <button
              onClick={() => window.location.reload()}
              className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-bold shadow-lg shadow-blue-500/30 transition-all flex items-center justify-center gap-2"
            >
              <span>Retry Connection</span>
            </button>
            <button
              onClick={async () => {
                await supabase.auth.signOut();
                localStorage.clear();
                window.location.reload();
              }}
              className="w-full py-4 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 rounded-2xl font-bold transition-all"
            >
              Reset and Sign Out
            </button>
            <button
              onClick={() => setSyncError(null)}
              className="w-full py-2 text-slate-400 hover:text-slate-500 text-xs font-medium transition-all"
            >
              Skip and Use Local Mode
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!isReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 px-6">
        <div className="flex flex-col items-center gap-6 max-w-sm w-full text-center">
          <div className="relative">
            <div className="animate-spin rounded-full h-16 w-16 border-4 border-slate-200 dark:border-slate-800 border-t-blue-600"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-ping"></div>
            </div>
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Syncing your data...</h2>
            <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed">
              We're connecting to the cloud to ensure your records are up to date.
            </p>
          </div>

          <button
            onClick={() => setIsReady(true)}
            className="mt-4 px-6 py-2 text-slate-400 hover:text-blue-500 text-xs font-semibold uppercase tracking-widest transition-colors"
          >
            Skip and start offline
          </button>
        </div>
      </div>
    );
  }

  // Every account title's General Ledger entries are derived here so that
  // ANY change anywhere in the books (a sale, a purchase, a CRJ/CDJ/PJ row,
  // a journal voucher) is immediately reflected per-account in the General
  // Ledger — and everything built on it (Chart of Accounts balances, P&L,
  // Balance Sheet). See src/lib/glPosting.ts.
  //
  // The Cash Disbursements Journal is synced first so that every cash
  // payment recorded elsewhere (a cash-basis Purchase, a Journal Voucher
  // that credits Cash) is auto-recorded there too — then the General Ledger
  // sync runs on top of that so the ledger reflects those rows as well.
  const rawCurrentClient = currentClientId ? clients[currentClientId] : null;
  const currentClient = useMemo(
    () => (rawCurrentClient ? syncGeneralLedger(syncCashDisbursementsJournal(rawCurrentClient)) : null),
    [rawCurrentClient]
  );

  return (
    <AccountingContext.Provider
      value={{
        clients,
        currentClientId,
        currentClient,
        businessProfile,
        isDarkMode,
        activePage,
        currentDat,
        historyTab,
        birFormTab,
        toastMsg,
        isSyncing,
        syncError,
        syncData,
        setDarkMode,
        navigateToPage,
        setHistoryTab,
        setBirFormTab,
        setCurrentClientId,
        setCurrentDat,
        saveClient,
        addClient,
        deleteClient,
        saveBusinessProfile,
        showToast,
        activeDevice,
      }}
    >
      {children}
    </AccountingContext.Provider>
  );
};

export const useAccounting = () => {
  const ctx = useContext(AccountingContext);
  if (!ctx) throw new Error('useAccounting must be used within AccountingProvider');
  return ctx;
};
