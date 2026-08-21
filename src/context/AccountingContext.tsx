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
  // The id of the "own business" pseudo-client, scoped to the current user.
  // Use this instead of the old hardcoded 'client_owner' literal.
  ownerClientId: string | null;
  isDarkMode: boolean;
  isSidebarCollapsed: boolean;
  activePage: string | null;
  currentDat: DatSelection | null;
  historyTab: string;
  birFormTab: string;
  toastMsg: string | null;
  isSyncing: boolean;
  syncError: string | null;
  syncData: () => Promise<void>;

  setDarkMode: (value: boolean) => void;
  setSidebarCollapsed: (value: boolean) => void;
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

// clients.id is a single global primary key (not scoped by user_id), so a
// shared literal like 'client_owner' would only ever be usable by one user
// in the whole database - RLS blocks everyone else from claiming it. Scope
// the "owner" client's id to the user themselves instead.
const ownerClientId = (userId: string) => `client_owner_${userId}`;

const defaultBusinessProfile = (name: string): BusinessProfile => ({
  id: name, // placeholder, immediately overwritten with user.id by the caller
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

const buildMatchingClient = (profileData: BusinessProfile, existing: Client | undefined, ownerId: string): Client =>
  ({
    id: ownerId,
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
  // Guards against writing the default isDarkMode/isSidebarCollapsed state
  // back to Supabase before the saved values have actually been loaded
  // from the 'profiles' table (see effects below).
  const [cloudPrefsLoaded, setCloudPrefsLoaded] = useState(false);
  // The active client id loaded from the 'profiles' table for this user,
  // used once (as a one-time restore) once both it and the client list
  // have finished loading - see the restore effect below.
  const [savedActiveClientId, setSavedActiveClientId] = useState<string | null>(null);
  const [isSidebarCollapsed, setSidebarCollapsed] = useState(false);
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

    try {
      const { data, error } = await supabase.from('clients').select('id, data').eq('user_id', user.id);
      if (error) throw error;

      const cloudClients: Record<string, Client> = {};
      (data || []).forEach((row) => {
        cloudClients[row.id] = row.data as Client;
      });
      setClients(cloudClients);
      showToast('Cloud sync complete');
    } catch (e) {
      console.error('Manual sync failed', e);
      showToast('Sync failed. Check console for details.');
    } finally {
      setIsSyncing(false);
    }
  };

  // Reset the "loaded" guard whenever the logged-in user changes (login,
  // logout, or switching accounts), so we re-load that user's prefs before
  // allowing any writes back to Supabase.
  useEffect(() => {
    setCloudPrefsLoaded(false);
  }, [user?.id]);

  // Load dark mode + sidebar-collapsed prefs from cloud.
  // This must finish (and set cloudPrefsLoaded) BEFORE the sync effects
  // below are allowed to write anything, otherwise the default state
  // (isDarkMode=false) gets written to Supabase first and clobbers the
  // saved value — which is what was causing dark mode to revert on refresh.
  useEffect(() => {
    let cancelled = false;

    const loadCloudPrefs = async () => {
      if (user && isReady) {
        try {
          const { data, error } = await supabase
            .from('profiles')
            .select('is_dark_mode, sidebar_collapsed, active_client_id')
            .eq('id', user.id)
            .maybeSingle();
          if (error) throw error;
          if (!cancelled) {
            if (data && typeof data.is_dark_mode === 'boolean') {
              setDarkMode(data.is_dark_mode);
            }
            if (data && typeof data.sidebar_collapsed === 'boolean') {
              setSidebarCollapsed(data.sidebar_collapsed);
            }
            if (data && typeof data.active_client_id === 'string') {
              setSavedActiveClientId(data.active_client_id);
            }
          }
        } catch (e) {
          console.error('Failed to load theme/sidebar prefs', e);
        } finally {
          if (!cancelled) setCloudPrefsLoaded(true);
        }
      }
    };
    loadCloudPrefs();

    return () => {
      cancelled = true;
    };
  }, [user, isReady]);

  // Restore the last-active client/profile once we know both what was saved
  // (from the 'profiles' table, once cloudPrefsLoaded) and what clients
  // actually exist. Gating on both - rather than picking as soon as clients
  // arrive - avoids the previous bug where an arbitrary client got picked
  // (because the saved preference hadn't loaded yet), which looked like the
  // active client and the owner's own business profile randomly swapping
  // places on every refresh.
  useEffect(() => {
    if (!currentClientId && cloudPrefsLoaded && Object.keys(clients).length > 0) {
      const restoredId =
        savedActiveClientId && clients[savedActiveClientId] ? savedActiveClientId : Object.keys(clients)[0];
      setCurrentClientId(restoredId);
    }
  }, [clients, cloudPrefsLoaded, savedActiveClientId, currentClientId]);

  // Sync the active client/profile selection to the cloud so it follows the
  // user across devices, same as the dark mode / sidebar prefs below.
  useEffect(() => {
    if (user && isReady && cloudPrefsLoaded && currentClientId) {
      const syncPref = async () => {
        try {
          const { error } = await supabase
            .from('profiles')
            .upsert(
              { id: user.id, active_client_id: currentClientId, updated_at: new Date().toISOString() },
              { onConflict: 'id' }
            );
          if (error) throw error;
        } catch (e) {
          console.error('Failed to sync active client pref', e);
        }
      };
      syncPref();
    }
  }, [currentClientId, user, isReady, cloudPrefsLoaded]);

  // Sync dark mode class and cloud pref
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      document.body.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
      document.body.classList.remove('dark');
    }

    // Only write to Supabase once we've loaded the saved value for this
    // user - otherwise we'd overwrite it with the default before it's read.
    if (user && isReady && cloudPrefsLoaded) {
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
  }, [isDarkMode, user, isReady, cloudPrefsLoaded]);

  // Sync sidebar-collapsed pref to cloud
  useEffect(() => {
    if (user && isReady && cloudPrefsLoaded) {
      const syncPref = async () => {
        try {
          const { error } = await supabase
            .from('profiles')
            .upsert(
              { id: user.id, sidebar_collapsed: isSidebarCollapsed, updated_at: new Date().toISOString() },
              { onConflict: 'id' }
            );
          if (error) throw error;
        } catch (e) {
          console.error('Failed to sync sidebar pref', e);
        }
      };
      syncPref();
    }
  }, [isSidebarCollapsed, user, isReady, cloudPrefsLoaded]);

  // Real-time Supabase Sync (Supabase is the single source of truth — no local database)
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
      setClients(cloudClients);
      // Which client becomes active is decided by the dedicated restore
      // effect above, once the saved preference has also loaded - see there
      // for why that's not decided here.
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
      if (clientsChannel) supabase.removeChannel(clientsChannel);
      if (bizChannel) supabase.removeChannel(bizChannel);
    };
  }, [user?.id]);

  // Sync Business Profile to the current user's owner client
  useEffect(() => {
    if (businessProfile && user) {
      const ownerId = ownerClientId(user.id);
      const existing = clients[ownerId];
      const needsSync =
        !existing ||
        existing.name !== businessProfile.name ||
        existing.tin !== businessProfile.tin ||
        existing.registeredName !== (businessProfile.registeredName || businessProfile.name);

      if (needsSync) {
        const matchingClient = buildMatchingClient(businessProfile, existing, ownerId);

        setClients((prev) => ({
          ...prev,
          [ownerId]: matchingClient,
        }));

        // NOTE: deliberately not defaulting currentClientId to ownerId here.
        // Picking the initial active client/profile is solely the job of the
        // dedicated restore effect above (which waits for the saved cloud
        // preference to load first). This effect also runs whenever
        // `clients` changes - including right after the app loads - so if it
        // *also* defaulted to ownerId whenever currentClientId was still
        // null, it would race the restore effect (both see the same stale
        // null value in the same commit) and unpredictably win, which is
        // what was causing the active client to keep getting reset back to
        // the business profile on every refresh.

        if (isReady) {
          supabase
            .from('clients')
            .upsert(
              { id: ownerId, user_id: user.id, data: matchingClient, updated_at: new Date().toISOString() },
              { onConflict: 'id' }
            )
            .then(({ error }) => {
              if (error) console.error('Auto-syncing owner client failed:', error);
            });
        }
      }

      // Clean up stray client records that duplicate the accountant's own business profile
      // (e.g. leftover entries created before owner-profile syncing existed). These should
      // never be listed as a client, so remove any non-owner client that matches the
      // business profile by name.
      const normalizedBizName = businessProfile.name?.trim().toLowerCase();
      if (normalizedBizName) {
        const strayIds = Object.values(clients)
          .filter(
            (client: Client) =>
              client.id !== ownerId && client.name?.trim().toLowerCase() === normalizedBizName
          )
          .map((client: Client) => client.id);

        if (strayIds.length > 0) {
          setClients((prev) => {
            const updated = { ...prev };
            strayIds.forEach((id) => delete updated[id]);
            return updated;
          });

          if (currentClientId && strayIds.includes(currentClientId)) {
            setCurrentClientId(ownerId);
          }

          if (isReady) {
            strayIds.forEach((id) => {
              supabase
                .from('clients')
                .delete()
                .eq('id', id)
                .then(({ error }) => {
                  if (error) console.error('Cleaning up stray owner-duplicate client failed:', error);
                });
            });
          }
        }
      }
    }
  }, [businessProfile, clients, currentClientId, user, isReady]);

  const saveClient = async (id: string, clientData: Client) => {
    const updatedClient = {
      ...clientData,
      userId: user ? user.id : undefined,
    };

    setClients((prev) => ({
      ...prev,
      [id]: updatedClient,
    }));

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

    setClients((prev) => ({
      ...prev,
      [newId]: {
        ...newClient,
        userId: user ? user.id : undefined,
      },
    }));
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
    }
  };

  const deleteClient = async (id: string) => {
    setClients((prev) => {
      const updated = { ...prev };
      delete updated[id];
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

        // Also update the matching owner client immediately to unlock hasClients and currentClient
        const ownerId = ownerClientId(user.id);
        const existing = clients[ownerId];
        const matchingClient = buildMatchingClient(profileData, existing, ownerId);

        await supabase
          .from('clients')
          .upsert(
            { id: ownerId, user_id: user.id, data: matchingClient, updated_at: new Date().toISOString() },
            { onConflict: 'id' }
          );

        setClients((prev) => ({
          ...prev,
          [ownerId]: matchingClient,
        }));

        if (!currentClientId) {
          setCurrentClientId(ownerId);
        }

        showToast('Business Profile updated');
      } catch (error) {
        await handleSupabaseError(error, OperationType.UPDATE, `business_profiles/${user.id}`);
      }
    }
  };

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  const navigateToPage = (page: string | null) => {
    navigate(page ? `/${page}` : '/');
  };

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
  //
  // NOTE: this useMemo (and every other hook in this component) must run on
  // every render, so it's declared BEFORE the `syncError` / `!isReady` early
  // returns below. Putting a hook after a conditional `return` means the
  // hook simply isn't called on renders that hit the early return — as soon
  // as `syncError` or `isReady` flips (or any other early-return condition
  // changes), React sees a different number of hooks between renders and
  // throws "Rendered more/fewer hooks than during the previous render"
  // (React error #310), which crashes the entire app since this provider
  // wraps everything.
  const rawCurrentClient = currentClientId ? clients[currentClientId] : null;
  const currentClient = useMemo(
    () => (rawCurrentClient ? syncGeneralLedger(syncCashDisbursementsJournal(rawCurrentClient)) : null),
    [rawCurrentClient]
  );

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
                window.location.reload();
              }}
              className="w-full py-4 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 rounded-2xl font-bold transition-all"
            >
              Reset and Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  // `isReady` only means "clients have loaded from Supabase". Which client
  // is actually active still depends on a *second* round-trip
  // (cloudPrefsLoaded -> the restore effect above picking currentClientId).
  // Rendering as soon as `isReady` flips true - before that second step
  // finishes - is what let AppLayout/Header mount with currentClient still
  // null, briefly showing the "CAPO Accounting Setup" fallback title before
  // swapping to the real client name. So the gate below also waits for
  // cloudPrefsLoaded, and - if there are clients to restore - for
  // currentClientId to actually be picked.
  const dataFullyReady =
    isReady && (!user || cloudPrefsLoaded) && (Object.keys(clients).length === 0 || !!currentClientId);

  if (!dataFullyReady) {
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
        </div>
      </div>
    );
  }

  return (
    <AccountingContext.Provider
      value={{
        clients,
        currentClientId,
        currentClient,
        businessProfile,
        ownerClientId: user ? ownerClientId(user.id) : null,
        isDarkMode,
        isSidebarCollapsed,
        activePage,
        currentDat,
        historyTab,
        birFormTab,
        toastMsg,
        isSyncing,
        syncError,
        syncData,
        setDarkMode,
        setSidebarCollapsed,
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
