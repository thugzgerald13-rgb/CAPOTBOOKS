import React, { createContext, useContext, useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export type ManagedAccountUser = {
  id: string;
  username: string;
  display_name: string;
  permissions: Record<string, boolean>;
  active: boolean;
};

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
  accountUsers: ManagedAccountUser[];
  activeAccountUser: ManagedAccountUser | null;
  accountUserSelectionRequired: boolean;
  selectAccountUser: (memberId: string, password: string) => Promise<void>;
  selectOwnerAccount: () => Promise<void>;
  reloadAccountUsers: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null, loading: true, isAdmin: false, userRole: null, permissions: {},
  hasPermission: () => false, setUserRole: () => {}, signOut: async () => {},
  needsAccountSetup: false, completeAccountSetup: async () => {}, accountUsers: [],
  activeAccountUser: null, accountUserSelectionRequired: false,
  selectAccountUser: async () => {}, selectOwnerAccount: () => {}, reloadAccountUsers: async () => {},
});

export const useAuth = () => useContext(AuthContext);

type AuthProviderProps = { children: React.ReactNode };

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRoleState] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [needsAccountSetup, setNeedsAccountSetup] = useState(false);
  const [accountUsers, setAccountUsers] = useState<ManagedAccountUser[]>([]);
  const [activeAccountUser, setActiveAccountUser] = useState<ManagedAccountUser | null>(null);
  // Tracks whether the signed-in user has actually gone through the
  // "Select User" screen this session — distinct from activeAccountUser,
  // which is also null for the owner. Without this, clicking "Continue as
  // Owner" (which sets activeAccountUser to null, its existing value)
  // produces no state change, so the selection screen never goes away.
  const [identityConfirmed, setIdentityConfirmed] = useState(false);

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

  const loadAccountUsers = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase.rpc('list_account_members');
      if (error) throw error;
      setAccountUsers((data || []) as ManagedAccountUser[]);
    } catch (error) {
      console.error('Account users load error:', error);
      setAccountUsers([]);
    }
  };

  useEffect(() => {
    const syncUser = async (usr: User) => {
      try {
        syncAccountSetupState(usr);
        setActiveAccountUser(null);
        setIdentityConfirmed(false);
        await supabase.from('profiles').upsert({
          id: usr.id,
          email: usr.email,
          display_name: usr.user_metadata?.full_name ?? usr.user_metadata?.name ?? null,
          photo_url: usr.user_metadata?.avatar_url ?? null,
          last_login: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'id' });

        const { data } = await supabase.from('profiles').select('user_role').eq('id', usr.id).single();
        setUserRoleState(data?.user_role ?? null);

        const { data: permissionData, error: permissionError } = await supabase.rpc('get_my_account_permissions');
        if (permissionError) {
          console.error('Permission load error:', permissionError);
          setPermissions({});
        } else {
          setPermissions((permissionData || {}) as Record<string, boolean>);
        }

        const { data: members, error: membersError } = await supabase.rpc('list_account_members');
        if (membersError) {
          console.error('Account users load error:', membersError);
          setAccountUsers([]);
        } else {
          setAccountUsers((members || []) as ManagedAccountUser[]);
        }
      } catch (error) {
        console.error('Auth sync error:', error);
        setUserRoleState(null);
        setPermissions({});
        setAccountUsers([]);
      }
    };

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) await syncUser(session.user);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) await syncUser(session.user);
      else {
        setUserRoleState(null);
        setPermissions({});
        setNeedsAccountSetup(false);
        setAccountUsers([]);
        setActiveAccountUser(null);
        setIdentityConfirmed(false);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
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

  const selectOwnerAccount = async () => {
    setActiveAccountUser(null);
    setIdentityConfirmed(true);
    try {
      const { data, error } = await supabase.rpc('get_my_account_permissions');
      if (error) throw error;
      setPermissions((data || {}) as Record<string, boolean>);
    } catch (error) {
      console.error('Owner permission load error:', error);
    }
  };

  const selectAccountUser = async (memberId: string, password: string) => {
    if (!password) throw new Error('Password is required.');
    const { data, error } = await supabase.rpc('authenticate_account_member', {
      p_member_id: memberId,
      p_password: password,
    });
    if (error) throw error;
    const member = data as ManagedAccountUser;
    setActiveAccountUser(member);
    setIdentityConfirmed(true);
    setPermissions(member.permissions || {});
  };

  const signOut = async () => {
    setActiveAccountUser(null);
    setIdentityConfirmed(false);
    setPermissions({});
    await supabase.auth.signOut();
  };

  const accountUserSelectionRequired = Boolean(user && accountUsers.length > 0 && !identityConfirmed);

  return (
    <AuthContext.Provider value={{
      user, loading, isAdmin, userRole, permissions, hasPermission, setUserRole, signOut,
      needsAccountSetup, completeAccountSetup, accountUsers, activeAccountUser,
      accountUserSelectionRequired, selectAccountUser, selectOwnerAccount, reloadAccountUsers: loadAccountUsers,
    }}>
      {children}
    </AuthContext.Provider>
  );
}
