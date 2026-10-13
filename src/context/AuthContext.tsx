import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import {
  claimTeamInvitation,
  getMyAccountMembership,
  listMySubusers,
  SubusersNotEnabledError,
} from '../lib/subusers';
import type { TeamMember, AccountMembership } from '../types';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  accountReady: boolean;
  pendingApproval: boolean;
  isAdmin: boolean;
  userRole: string | null;
  permissions: Record<string, boolean>;
  hasPermission: (permission: string) => boolean;
  setUserRole: (role: string | null) => void;
  signOut: () => Promise<void>;
  needsAccountSetup: boolean;
  completeAccountSetup: (password: string) => Promise<void>;
  subusersEnabled: boolean;
  membership: AccountMembership;
  isSubuser: boolean;
  teamMembers: TeamMember[];
  refreshTeamMembers: () => Promise<void>;
  setActivePermissionClientId: (clientId: string | null) => void;
}

const DEFAULT_MEMBERSHIP: AccountMembership = { isSubuser: false };
const AuthContext = createContext<AuthContextType>({
  user: null, loading: true, accountReady: false, pendingApproval: false, isAdmin: false, userRole: null, permissions: {},
  hasPermission: () => false, setUserRole: () => {}, signOut: async () => {},
  needsAccountSetup: false, completeAccountSetup: async () => {},
  subusersEnabled: false, membership: DEFAULT_MEMBERSHIP, isSubuser: false,
  teamMembers: [], refreshTeamMembers: async () => {}, setActivePermissionClientId: () => {},
});

export const useAuth = () => useContext(AuthContext);

type AuthProviderProps = { children: React.ReactNode };

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [accountReady, setAccountReady] = useState(false);
  const [userRole, setUserRoleState] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [rolePermissions, setRolePermissions] = useState<Record<string, boolean>>({});
  const [activePermissionClientId, setActivePermissionClientId] = useState<string | null>(null);
  const [needsAccountSetup, setNeedsAccountSetup] = useState(false);
  const [subusersEnabled, setSubusersEnabled] = useState(false);
  const [membership, setMembership] = useState<AccountMembership>(DEFAULT_MEMBERSHIP);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [pendingApproval, setPendingApproval] = useState(false);
  // Auth can emit SIGNED_IN followed quickly by TOKEN_REFRESHED. Do not run
  // overlapping profile/membership syncs for the same user: concurrent syncs
  // were resetting permissions and workspace membership during initial render,
  // which made the staff workspace appear to flicker.
  const syncingUserId = useRef<string | null>(null);
  // Watchdog: if getSession() or the background profile/RPC sync hangs (e.g. a
  // slow/unreachable Supabase call that never resolves OR rejects), the app
  // would otherwise spin forever on the loading spinner. Force the gate open
  // after a bounded wait so the user can always reach the UI; background sync
  // continues and updates state whenever it eventually completes.
  const loadingWatchdog = useRef<number | null>(null);
  const accountReadyWatchdog = useRef<number | null>(null);
  const clearWatchdogs = () => {
    if (loadingWatchdog.current !== null) { clearTimeout(loadingWatchdog.current); loadingWatchdog.current = null; }
    if (accountReadyWatchdog.current !== null) { clearTimeout(accountReadyWatchdog.current); accountReadyWatchdog.current = null; }
  };

  const DEVELOPER_EMAIL =
    (import.meta.env.VITE_ADMIN_EMAIL || 'thugz.gerald13@gmail.com').trim().toLowerCase();
  const isAdmin = !!user?.email && user.email.trim().toLowerCase() === DEVELOPER_EMAIL;

  const isGoogleUser = (usr: User) =>
    (usr.identities || []).some((identity) => identity.provider === 'google') ||
    usr.app_metadata?.provider === 'google' ||
    (Array.isArray(usr.app_metadata?.providers) && usr.app_metadata.providers.includes('google'));

  const syncAccountSetupState = (usr: User) => {
    const googleUser = isGoogleUser(usr);
    const hasPassword = Boolean(usr.user_metadata?.account_password_set);
    setNeedsAccountSetup(googleUser && !hasPassword);
  };

  useEffect(() => {
    let active = true;
    let initialSessionHandled = false;
    // Fail-safe: even if the Supabase session check never settles, drop the
    // full-screen spinner after 15s so the user is never stuck on a blank
    // loading page. Cleared by the normal getSession() finally path below.
    loadingWatchdog.current = window.setTimeout(() => {
      if (!active) return;
      setLoading(false);
      setAccountReady(true);
    }, 15000);

    const clearAuthState = () => {
      if (!active) return;
      setUser(null);
      setAccountReady(false);
      setUserRoleState(null);
      setPermissions({});
      setRolePermissions({});
      setActivePermissionClientId(null);
      setNeedsAccountSetup(false);
      setMembership(DEFAULT_MEMBERSHIP);
      setTeamMembers([]);
      setSubusersEnabled(false);
      setPendingApproval(false);
    };

    const syncUser = async (usr: User) => {
      if (syncingUserId.current === usr.id) return;
      syncingUserId.current = usr.id;
      try {
        syncAccountSetupState(usr);

        // Keep profile/membership queries outside the auth state callback.
        // Supabase holds an internal auth lock while dispatching auth events;
        // awaiting another Supabase request from inside that callback can
        // deadlock initialization or leave the app stuck on the auth check.
        const { error: profileUpsertError } = await supabase.from('profiles').upsert({
          id: usr.id,
          email: usr.email,
          display_name: usr.user_metadata?.full_name ?? usr.user_metadata?.name ?? null,
          photo_url: usr.user_metadata?.avatar_url ?? null,
          last_login: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'id' });

        if (profileUpsertError) {
          console.error('Profile sync error:', profileUpsertError);
        }

        // An independent invitation is claimed only after the invitee has
        // authenticated. This prevents creating a second CAPOT workspace for
        // an invited email and binds the membership to the authenticated user.
        try {
          const claimedMembership = await claimTeamInvitation();
          if (claimedMembership?.isSubuser) {
            setMembership(claimedMembership);
            setSubusersEnabled(true);
          }
        } catch (claimError) {
          console.error('Invitation claim error:', claimError);
        }

        const { data, error: roleError } = await supabase
          .from('profiles')
          .select('user_role, approved')
          .eq('id', usr.id)
          .maybeSingle();

        if (roleError) {
          console.error('Role load error:', roleError);
        }

        if (!active) return;
        setUserRoleState(data?.user_role ?? null);
        // Approval gate DISABLED — new users get into the app immediately.
        // Block/revoke remains fully enforced server-side via profiles.blocked
        // + is_user_blocked() + the capot_blocked_users_guard RLS policies.
        setPendingApproval(false);

        const { data: permissionData, error: permissionError } =
          await supabase.rpc('get_my_account_permissions');

        if (!active) return;
        if (permissionError) {
          console.error('Permission load error:', permissionError);
          setPermissions({});
          setRolePermissions({});
        } else {
          const loadedRolePermissions = (permissionData || {}) as Record<string, boolean>;
          setRolePermissions(loadedRolePermissions);
          setPermissions(loadedRolePermissions);
        }

        try {
          const mem = await getMyAccountMembership();
          if (!active) return;
          setMembership(mem);
          setSubusersEnabled(true);

          if (!mem.isSubuser) {
            try {
              setTeamMembers(await listMySubusers());
            } catch (teamError) {
              console.error('Subuser list error:', teamError);
              setTeamMembers([]);
            }
          } else {
            setTeamMembers([]);
          }
        } catch (memErr) {
          if (!(memErr instanceof SubusersNotEnabledError)) {
            console.error('Membership load error:', memErr);
          }
          if (!active) return;
          setSubusersEnabled(false);
          setMembership(DEFAULT_MEMBERSHIP);
          setTeamMembers([]);
        }
      } catch (error) {
        console.error('Auth sync error:', error);
        if (!active) return;
        setUserRoleState(null);
        setPermissions({});
        setRolePermissions({});
        setMembership(DEFAULT_MEMBERSHIP);
        setTeamMembers([]);
      } finally {
        if (accountReadyWatchdog.current !== null) {
          clearTimeout(accountReadyWatchdog.current);
          accountReadyWatchdog.current = null;
        }
        if (syncingUserId.current === usr.id) syncingUserId.current = null;
        if (active) setAccountReady(true);
      }
    };

    const deferUserSync = (usr: User) => {
      // Arm the account-ready watchdog every time a user sync is deferred, so
      // a hanging background sync never leaves the app on the spinner — this
      // covers both initial session restore and later SIGNED_IN events.
      if (accountReadyWatchdog.current !== null) clearTimeout(accountReadyWatchdog.current);
      accountReadyWatchdog.current = window.setTimeout(() => {
        if (active) setAccountReady(true);
      }, 10000);
      window.setTimeout(() => {
        if (active) void syncUser(usr);
      }, 0);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;

      const nextUser = session?.user ?? null;
      setUser(nextUser);
      if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
        setAccountReady(false);
      }

      // INITIAL_SESSION is handled by the explicit getSession() call below.
      // For all later auth events, defer the database work until after the
      // auth callback has released Supabase's internal lock.
      if (event === 'INITIAL_SESSION') {
        initialSessionHandled = true;
        if (!nextUser) clearAuthState();
        return;
      }

      if (nextUser) {
        deferUserSync(nextUser);
      } else {
        clearAuthState();
      }
    });

    void (async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();

        if (!active) return;
        if (error) {
          console.error('Auth session check error:', error);
          clearAuthState();
          return;
        }

        const sessionUser = session?.user ?? null;
        setUser(sessionUser);
        setAccountReady(false);

        if (sessionUser) {
          // Do not block the auth gate on profile/RPC/database work.
          // The authenticated user can render immediately while the
          // application-specific profile and permissions sync in the
          // background.
          deferUserSync(sessionUser);
          // Fail-safe: if the background sync (profile upsert, RPC calls,
          // subuser list) hangs and never settles, force accountReady open
          // after 10s. syncUser() clears this timer in its own finally when
          // it completes normally.
          accountReadyWatchdog.current = window.setTimeout(() => {
            if (active) setAccountReady(true);
          }, 10000);
        } else if (!initialSessionHandled) {
          clearAuthState();
        }
      } catch (error) {
        console.error('Failed to initialize auth session:', error);
        clearAuthState();
      } finally {
        if (loadingWatchdog.current !== null) {
          clearTimeout(loadingWatchdog.current);
          loadingWatchdog.current = null;
        }
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
      clearWatchdogs();
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadClientPermissions = async () => {
      if (!user) {
        if (!cancelled) setPermissions({});
        return;
      }

      // Non-subusers: standalone Accountant / Bookkeeper accounts.
      // On their own dashboard they keep their full role permission set.
      // When a specific client is active, load the effective per-client grant
      // so a shared client (invited by a Business Owner) restricts exactly the
      // functions that were granted — own clients still resolve to all-true
      // server-side. Fallback to role permissions while loading / on error so
      // the route guard never flickers them into a redirect loop.
      if (!membership.isSubuser) {
        if (!activePermissionClientId) {
          if (!cancelled) setPermissions(rolePermissions);
          return;
        }
        try {
          const { data, error } = await supabase.rpc('get_my_client_permissions', {
            p_client_id: activePermissionClientId,
          });
          if (error) throw error;
          if (!cancelled) {
            setPermissions((data && Object.keys(data).length > 0 ? data : rolePermissions) as Record<string, boolean>);
          }
        } catch {
          if (!cancelled) setPermissions(rolePermissions);
        }
        return;
      }

      // A team member without a selected/authorized client gets no effective
      // capabilities until a client grant is loaded. This prevents a previous
      // client's permissions from leaking while the user switches clients.
      if (!activePermissionClientId) {
        if (!cancelled) setPermissions({});
        return;
      }

      setPermissions({});
      try {
        const { data, error } = await supabase.rpc('get_my_client_permissions', {
          p_client_id: activePermissionClientId,
        });
        if (error) throw error;
        if (!cancelled) {
          setPermissions((data || {}) as Record<string, boolean>);
        }
      } catch (error) {
        console.error('Client permission load error:', error);
        if (!cancelled) setPermissions({});
      }
    };

    void loadClientPermissions();
    return () => { cancelled = true; };
  }, [user?.id, membership.isSubuser, activePermissionClientId, rolePermissions]);

  const hasPermission = (permission: string) => {
    // True account owners (and the developer) retain unrestricted access.
    // Standalone Accountant/Bookkeeper accounts use the role permissions
    // returned by get_my_account_permissions(), while team subusers use their
    // client-specific effective permissions.
    if (isAdmin || userRole === 'owner') return true;
    return Boolean(permissions[permission]);
  };

  const setUserRole = async (role: string | null) => {
    if (user) {
      try {
        await supabase.from('profiles').upsert(
          { id: user.id, user_role: role, updated_at: new Date().toISOString() },
          { onConflict: 'id' }
        );
      } catch (error) {
        console.error('Set role error:', error);
      }
    }
    setUserRoleState(role);
  };

  const completeAccountSetup = async (password: string) => {
    if (!user) throw new Error('You must be signed in to complete account setup.');
    if (password.length < 6) throw new Error('Password must be at least 6 characters.');
    const { data, error } = await supabase.auth.updateUser({
      password,
      data: { ...user.user_metadata, account_password_set: true },
    });
    if (error) throw error;
    setUser(data.user || user);
    setNeedsAccountSetup(false);
  };

  const refreshTeamMembers = async () => {
    if (!subusersEnabled || membership.isSubuser) return;
    try { setTeamMembers(await listMySubusers()); } catch (e) { console.error(e); }
  };

  const signOut = async () => {
    setPermissions({});
    setRolePermissions({});
    setActivePermissionClientId(null);
    await supabase.auth.signOut();
  };

  // Developer-approval gate: a signed-in but not-yet-approved user sees only
  // this screen. Nothing in the app (data loads, writes, AccountingContext)
  // is reachable until an admin flips profiles.approved = true.
  if (pendingApproval) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a', padding: 24, fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ maxWidth: 420, width: '100%', background: '#1e293b', border: '1px solid #334155', borderRadius: 16, padding: 32, textAlign: 'center' }}>
          <div style={{ width: 56, height: 56, margin: '0 auto 16px', borderRadius: '50%', background: '#f59e0b22', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>⏳</div>
          <h1 style={{ color: '#f1f5f9', fontSize: 20, fontWeight: 700, margin: '0 0 8px' }}>Account Pending Approval</h1>
          <p style={{ color: '#94a3b8', fontSize: 14, lineHeight: 1.6, margin: '0 0 24px' }}>
            Your account <strong style={{ color: '#e2e8f0' }}>{user?.email}</strong> has been created and is waiting for the developer to approve it.
            You will be able to use the app once approval is granted — this usually takes less than 24 hours.
          </p>
          <button
            onClick={() => { void signOut(); }}
            style={{ background: '#0ea5e9', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{
      user, loading, pendingApproval, isAdmin, userRole, permissions, hasPermission, setUserRole, signOut,
      needsAccountSetup, completeAccountSetup,
      subusersEnabled, membership, isSubuser: membership.isSubuser, teamMembers, refreshTeamMembers, setActivePermissionClientId,
    }}>
      {children}
    </AuthContext.Provider>
  );
}
