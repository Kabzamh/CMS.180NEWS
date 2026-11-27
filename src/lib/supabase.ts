// Stand-in for the Supabase auth client. The real CMS (this repository,
// unmodified) signs in through Supabase Auth and calls Postgres via
// Supabase; this static build has no server, so sign-in is checked against
// the seeded newsroom accounts in localStore.ts and the "session" is a
// token kept in localStorage. AuthContext.tsx and googleAuth.ts talk to
// this object exactly as they would the real `@supabase/supabase-js`
// client, so neither file needed to change.
import type { Session, User, SupabaseClient } from '@supabase/supabase-js';
import { getStore, save } from './localStore';
import { newsroomClient } from './newsroomReal';

const SESSION_KEY = 'cms180_demo_session_v1';

type Listener = (event: string, session: Session | null) => void;
const listeners = new Set<Listener>();

function buildSession(userId: string, email: string): Session {
  const now = Math.floor(Date.now() / 1000);
  const user: Partial<User> = {
    id: userId,
    email,
    app_metadata: {},
    user_metadata: {},
    aud: 'authenticated',
    created_at: new Date().toISOString(),
  };
  const session: Partial<Session> = {
    access_token: `demo-token-${userId}`,
    refresh_token: `demo-refresh-${userId}`,
    token_type: 'bearer',
    expires_in: 60 * 60 * 24 * 7,
    expires_at: now + 60 * 60 * 24 * 7,
    user: user as User,
  };
  return session as Session;
}

function readSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

function writeSession(session: Session | null) {
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

function notify(event: string, session: Session | null) {
  for (const l of listeners) l(event, session);
}

const auth = {
  async getSession() {
    return { data: { session: readSession() }, error: null as { message: string } | null };
  },

  onAuthStateChange(cb: Listener) {
    listeners.add(cb);
    return { data: { subscription: { unsubscribe: () => listeners.delete(cb) } } };
  },

  async signInWithPassword({ email, password }: { email: string; password: string }) {
    const store = getStore();
    const cleanEmail = email.trim().toLowerCase();
    const cred = store.authUsers.find((u) => u.email.toLowerCase() === cleanEmail);
    if (!cred || cred.password !== password) {
      return { data: { session: null, user: null }, error: { message: 'Invalid login credentials' } };
    }
    const session = buildSession(cred.user_id, cred.email);
    writeSession(session);
    notify('SIGNED_IN', session);
    return { data: { session, user: session.user }, error: null };
  },

  async signOut() {
    writeSession(null);
    notify('SIGNED_OUT', null);
    return { error: null };
  },

  async setSession({ access_token }: { access_token: string; refresh_token: string }) {
    const userId = access_token.startsWith('demo-token-') ? access_token.slice('demo-token-'.length) : null;
    const store = getStore();
    const member = userId ? store.team.find((m) => m.user_id === userId) : null;
    if (!member) return { data: { session: null }, error: { message: 'Invalid session token' } };
    const session = buildSession(member.user_id, member.email);
    writeSession(session);
    notify('SIGNED_IN', session);
    save();
    return { data: { session }, error: null };
  },
};

// The existing demo remains the default. The Supabase integration is staged
// behind an explicit, read-only preview flag until every required feature is ready.
const selected = import.meta.env.VITE_NEWSROOM_SYNC_PREVIEW === 'true'
  ? newsroomClient()
  : ({ auth } as unknown as SupabaseClient);
export default selected;
