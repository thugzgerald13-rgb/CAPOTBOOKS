import React, { createContext, useContext, useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  userRole: string | null;
  setUserRole: (role: string | null) => void;
  signOut: () => Promise<void>;
  needsAccountSetup: boolean;
  completeAccountSetup: (username: string, password: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  isAdmin: false,
  userRole: null,
  setUserRole: () => {},
  signOut: async () => {},
  needsAccountSetup: false,
  completeAccountSetup: async () => {},
});

export const useAuth = () => useContext(AuthContext);

type AuthProviderProps = {
    children: React.ReactNode;
};

export function AuthProvider({
    children,
}: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRoleState] = useState<string | null>(null);
  const [needsAccountSetup, setNeedsAccountSetup] = useState(false);

  // Hardcode the developer's email as superuser for now.
  // Falls back to the literal address below if VITE_ADMIN_EMAIL isn't baked
  // into the build (Vite inlines import.meta.env.* at BUILD time, not
  // runtime — if a deploy pipeline doesn't pass that var through at build
  // time, this would silently end up `undefined` and make the admin check
  // unreliable). Compared case/whitespace-insensitively so it can't be
  // tripped up by a stray capital letter either.
  const DEVELOPER_EMAIL =
    (import.meta.env.VITE_ADMIN_EMAIL || 'thugz.gerald13@gmail.com').trim().toLowerCase();
  const isAdmin = !!user?.email && user.email.trim().toLowerCase() === DEVELOPER_EMAIL;

  const isGoogleUser = (usr: User) =>
    (usr.identities || []).some((identity) => identity.provider === 'google') ||
    usr.app_metadata?.provider === 'google' ||
    (Array.isArray(usr.app_metadata?.providers) && usr.app_metadata.providers.includes('google'));

  const syncAccountSetupState = (usr: User) => {
    const googleUser = isGoogleUser(usr);
    const username = String(usr.user_metadata?.account_username || '').trim();
    const hasPassword = Boolean(usr.user_metadata?.account_password_set);
    setNeedsAccountSetup(googleUser && (!username || !hasPassword));
  };

  useEffect(() => {
    const syncUser = async (usr: User) => {
      try {
        syncAccountSetupState(usr);
        // Upsert the profile row; doesn't block the UI if this is slow
        await supabase.from('profiles').upsert(
          {
            id: usr.id,
            email: usr.email,
            display_name: usr.user_metadata?.full_name ?? usr.user_metadata?.name ?? null,
            photo_url: usr.user_metadata?.avatar_url ?? null,
            last_login: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'id' }
        );

        const { data } = await supabase.from('profiles').select('user_role').eq('id', usr.id).single();
        setUserRoleState(data?.user_role ?? null);
      } catch (error) {
        console.error('Auth sync error:', error);
        setUserRoleState(null);
      }
    };

    // Load whatever session exists on first mount
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        // Wait for the role to be fetched before clearing `loading`, so
        // MainApp never sees "user present, role unknown" and flashes
        // the RoleSelection screen before swapping to the real workspace.
        await syncUser(session.user);
      }
      setLoading(false);
    });

    // Keep in sync with sign-in / sign-out / token refresh events
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        await syncUser(session.user);
      } else {
        setUserRoleState(null);
        setNeedsAccountSetup(false);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const setUserRole = async (role: string | null) => {
    if (user) {
      try {
        await supabase
          .from('profiles')
          .upsert({ id: user.id, user_role: role, updated_at: new Date().toISOString() }, { onConflict: 'id' });
      } catch (error) {
        console.error('Set role error:', error);
      }
    }
    setUserRoleState(role);
  };

  const completeAccountSetup = async (username: string, password: string) => {
    if (!user) throw new Error('You must be signed in to complete account setup.');

    const cleanUsername = username.trim();
    if (!cleanUsername) throw new Error('Username is required.');
    if (password.length < 6) throw new Error('Password must be at least 6 characters.');

    const { data, error } = await supabase.auth.updateUser({
      password,
      data: {
        ...user.user_metadata,
        account_username: cleanUsername,
        account_password_set: true,
      },
    });

    if (error) throw error;

    const updatedUser = data.user || user;
    setUser(updatedUser);
    setNeedsAccountSetup(false);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, loading, isAdmin, userRole, setUserRole, signOut, needsAccountSetup, completeAccountSetup }}>
      {children}
    </AuthContext.Provider>
  );
};
