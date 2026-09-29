import React, { createContext, useContext, useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import {
  getMyAccountMembership,
  listMySubusers,
  SubusersNotEnabledError,
} from '../lib/subusers';
import type { TeamMember, AccountMembership } from '../types';

interface AuthContextType {
  user: User | null;
  loading: boolean;
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
}

const DEFAULT_MEMBERSHIP: AccountMembership = { isSubuser: false };
const AuthContext = createContext<AuthContextType>({
  user: null, loading: true, isAdmin: false, userRole: null, permissions: {},
  hasPermission: () => false, setUserRole: () => {}, signOut: async () => {},
  needsAccountSetup: false, completeAccountSetup: async () => {},
  subusersEnabled: false, membership: DEFAULT_MEMBERSHIP, isSubuser: false,
  teamMembers: [], refreshTeamMembers: async () => {},
});

export const useAuth = () => useContext(AuthContext);

type AuthProviderProps = { children: React.ReactNode };

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRoleState] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [needsAccountSetup, setNeedsAccountSetup] = useState(false);
  const [subusersEnabled, setSubusersEnabled] = useState(false);
  const [membership, setMembership] = useState<AccountMembership>(DEFAULT_MEMBERSHIP);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);

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

    const clearAuthState = () => {
      if (!active) return;
      setUser(null);
      setUserRoleState(null);
      setPermissions({});
      setNeedsAccountSetup(false);
      setMembership(DEFAULT_MEMBERSHIP);
      setTeamMembers([]);
      setSubusersEnabled(false);
    };

    const syncUser = async (usr: User) => {
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

        const { data, error: roleError } = await supabase
          .from('profiles')
          .select('user_role')
          .eq('id', usr.id)
          .maybeSingle();

        if (roleError) {
          console.error('Role load error:', roleError);
        }

        if (!active) return;
        setUserRoleState(data?.user_role ?? null);

        const { data: permissionData, error: permissionError } =
          await supabase.rpc('get_my_account_permissions');

        if (!active) return;
        if (permissionError) {
          console.error('Permission load error:', permissionError);
          setPermissions({});
        } else {
          setPermissions((permissionData || {}) as Record<string, boolean>);
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
        setMembership(DEFAULT_MEMBERSHIP);
        setTeamMembers([]);
      }
    };

    const deferUserSync = (usr: User) => {
      window.setTimeout(() => {
        if (active) void syncUser(usr);
      }, 0);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;

      const nextUser = session?.user ?? null;
      setUser(nextUser);

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

        if (sessionUser) {
          // Do not block the auth gate on profile/RPC/database work.
          // The authenticated user can render immediately while the
          // application-specific profile and permissions sync in the
          // background.
          deferUserSync(sessionUser);
        } else if (!initialSessionHandled) {
          clearAuthState();
        }
      } catch (error) {
        console.error('Failed to initialize auth session:', error);
        clearAuthState();
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const hasPermission = (permission: string) => Boolean(permissions[permission]);

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
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{
      user, loading, isAdmin, userRole, permissions, hasPermission, setUserRole, signOut,
      needsAccountSetup, completeAccountSetup,
      subusersEnabled, membership, isSubuser: membership.isSubuser, teamMembers, refreshTeamMembers,
    }}>
      {children}
    </AuthContext.Provider>
  );
}
