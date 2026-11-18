import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getSupabase } from '../lib/supabase';
import { api, ApiError, errorMessage } from '../lib/api';
import type { Member } from '../lib/types';

type Status = 'loading' | 'signedOut' | 'noAccess' | 'ready' | 'error';

interface AuthValue {
  status: Status;
  member: Member | null;
  email: string | null;
  error: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshMember: () => Promise<void>;
  retry: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [booted, setBooted] = useState(false);
  const [status, setStatus] = useState<Status>('loading');
  const [member, setMember] = useState<Member | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe = () => {};
    getSupabase()
      .then((supabase) => {
        if (cancelled) return;
        supabase.auth.getSession().then(({ data }) => {
          if (cancelled) return;
          setSession(data.session);
          setBooted(true);
        });
        const { data } = supabase.auth.onAuthStateChange((_event, next) => {
          setSession(next);
          setBooted(true);
        });
        unsubscribe = () => data.subscription.unsubscribe();
      })
      .catch((err) => {
        if (cancelled) return;
        setError(errorMessage(err));
        setStatus('error');
      });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [attempt]);

  const userId = session?.user?.id ?? null;

  const loadMember = useCallback(async () => {
    try {
      const me = await api<Member>('/api/team?me=1');
      setMember(me);
      setError(null);
      setStatus('ready');
    } catch (err) {
      setMember(null);
      if (err instanceof ApiError && err.status === 403) setStatus('noAccess');
      else if (err instanceof ApiError && err.status === 401) setStatus('signedOut');
      else {
        setError(errorMessage(err));
        setStatus('error');
      }
    }
  }, []);

  useEffect(() => {
    if (!booted) return;
    if (!userId) {
      setMember(null);
      setStatus('signedOut');
      return;
    }
    setStatus('loading');
    loadMember();
  }, [booted, userId, loadMember, attempt]);

  const signIn = useCallback(async (email: string, password: string) => {
    const supabase = await getSupabase();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      throw new Error(
        /invalid/i.test(signInError.message)
          ? 'That email and password do not match. Check them and try again.'
          : signInError.message,
      );
    }
  }, []);

  const signOut = useCallback(async () => {
    const supabase = await getSupabase();
    await supabase.auth.signOut();
  }, []);

  const retry = useCallback(() => {
    setStatus('loading');
    setError(null);
    setAttempt((n) => n + 1);
  }, []);

  return (
    <AuthContext.Provider
      value={{ status, member, email: session?.user?.email ?? null, error, signIn, signOut, refreshMember: loadMember, retry }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}

/** For screens inside the signed-in shell, where a member is guaranteed. */
export function useMember(): Member {
  const { member } = useAuth();
  if (!member) throw new Error('useMember used outside the signed-in area');
  return member;
}
