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
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  isAdmin: false,
  userRole: null,
  setUserRole: () => {},
  signOut: async () => {},
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

  // Hardcode the developer's email as superuser for now
  const DEVELOPER_EMAIL =
    import.meta.env.VITE_ADMIN_EMAIL;
  const isAdmin = user?.email === DEVELOPER_EMAIL;

  useEffect(() => {
    const syncUser = async (usr: User) => {
      try {
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
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        syncUser(session.user);
      }
      setLoading(false);
    });

    // Keep in sync with sign-in / sign-out / token refresh events
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        syncUser(session.user);
      } else {
        setUserRoleState(null);
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

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, loading, isAdmin, userRole, setUserRole, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};
