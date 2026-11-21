import { getSupabase, projectKeys } from './supabase';

const isMobile = () => /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

function buildGoogleUrl(appName: string): string | null {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
  const redirectUri = import.meta.env.VITE_GOOGLE_AUTH_PROXY as string | undefined;
  if (!clientId || !redirectUri || !projectKeys.url || !projectKeys.anonKey) return null;
  const state = btoa(
    JSON.stringify({
      origin: window.location.origin,
      appName,
      supabaseUrl: projectKeys.url,
      supabaseAnonKey: projectKeys.anonKey,
    }),
  );
  return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(
    redirectUri,
  )}&response_type=code&scope=openid%20email%20profile&prompt=select_account&state=${encodeURIComponent(state)}`;
}

/** Opens the Google sign-in window. Returns false when Google sign-in is not set up. */
export function signInWithGoogle(appName = 'this app'): boolean {
  const url = buildGoogleUrl(appName);
  if (!url) {
    console.warn('[google-auth] Missing VITE_GOOGLE_CLIENT_ID or VITE_GOOGLE_AUTH_PROXY');
    return false;
  }

  // Always window.open(), never window.location: the app may be running inside
  // a preview iframe, and navigating that to Google would break it.
  const popup = window.open(url, 'google-auth', isMobile() ? '' : 'width=500,height=600');

  const handler = async (event: MessageEvent) => {
    if (event.source !== popup) return;
    if (event.data?.type === 'google-auth-denied') {
      window.removeEventListener('message', handler);
      return;
    }
    if (event.data?.type !== 'google-auth-success') return;
    window.removeEventListener('message', handler);
    const { access_token, refresh_token } = event.data;
    const supabase = await getSupabase();
    const { error } = await supabase.auth.setSession({ access_token, refresh_token });
    if (error) console.error('[google-auth] setSession failed:', error.message);
  };
  window.addEventListener('message', handler);
  return true;
}

/**
 * Redirect fallback: when the popup cannot reach this tab, the callback sends
 * the popup here with the session in the URL fragment. supabase-js stores it
 * on load, which signs in every tab; this only closes the popup afterwards.
 */
export async function handleGoogleRedirect() {
  const fragment = new URLSearchParams(window.location.hash.slice(1));
  if (!fragment.has('google_auth_popup')) return;
  try {
    const supabase = await getSupabase();
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session) {
      console.error('[google-auth] redirect sign-in failed:', error?.message);
      return;
    }
    window.close();
  } catch (err) {
    console.error('[google-auth] redirect sign-in failed:', err);
  }
}
