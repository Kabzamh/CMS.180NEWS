import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import supabase from '../lib/supabase';
import { api, ApiError } from '../lib/api';
import type { TeamMember } from '../lib/types';
import type { User, Session } from '@supabase/supabase-js';

type Status = 'loading' | 'ready' | 'signedOut' | 'noAccess' | 'error';

interface AuthCtx {
  user: User | null;
  session: Session | null;
  member: TeamMember | null;
  status: Status;
  error: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshMember: () => Promise<void>;
  retry: () => void;
}

const AuthContext = createContext<AuthCtx>({
  user: null,
  session: null,
  member: null,
  status: 'loading',
  error: null,
  signIn: async () => {},
  signOut: async () => {},
  refreshMember: async () => {},
  retry: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [member, setMember] = useState<TeamMember | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const loadMember = useCallback(async (sess: Session | null) => {
    if (!sess) {
      setMember(null);
      setStatus('signedOut');
      return;
    }
    try {
      const m = await api<TeamMember>('/api/team?me=1');
      setMember(m);
      setStatus('ready');
      setError(null);
    } catch (e) {
      setMember(null);
      if (e instanceof ApiError && e.status === 403) setStatus('noAccess');
      else if (e instanceof ApiError && e.status === 401) setStatus('signedOut');
      else {
        setError(e instanceof Error ? e.message : 'Could not load your desk profile.');
        setStatus('error');
      }
    }
  }, []);

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (!alive) return;
      setSession(s);
      setUser(s?.user ?? null);
      loadMember(s);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      loadMember(s);
    });
    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, [loadMember, tick]);

  const signIn = async (email: string, password: string) => {
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) {
      const msg = /invalid/i.test(err.message)
        ? 'That email and password do not match. Check them and try again.'
        : err.message;
      throw new Error(msg);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setMember(null);
    setStatus('signedOut');
  };

  const refreshMember = async () => {
    await loadMember(session);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        member,
        status,
        error,
        signIn,
        signOut,
        refreshMember,
        retry: () => setTick((t) => t + 1),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
