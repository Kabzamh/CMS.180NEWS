import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export interface PublicConfig {
  url: string;
  anonKey: string;
  demoLogin: { email: string; password: string } | null;
}

let configPromise: Promise<PublicConfig> | null = null;

/** Public project details and the starter sign-in hint, served by the API. */
export function getConfig(force = false): Promise<PublicConfig> {
  if (!configPromise || force) {
    configPromise = fetch('/api/public?resource=config')
      .then(async (r) => {
        if (!r.ok) throw new Error('config');
        return (await r.json()) as PublicConfig;
      })
      .catch((err) => {
        configPromise = null;
        throw err;
      });
  }
  return configPromise;
}

export const projectKeys = {
  url: (import.meta.env.VITE_SUPABASE_URL || import.meta.env.NEXT_PUBLIC_SUPABASE_URL || '') as string,
  anonKey: (import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '') as string,
};

let clientPromise: Promise<SupabaseClient> | null = null;

export function getSupabase(): Promise<SupabaseClient> {
  if (!clientPromise) {
    clientPromise = (async () => {
      if (!projectKeys.url || !projectKeys.anonKey) {
        const config = await getConfig();
        projectKeys.url = config.url;
        projectKeys.anonKey = config.anonKey;
      }
      if (!projectKeys.url || !projectKeys.anonKey) {
        throw new Error('The newsroom database is not set up for this site yet.');
      }
      return createClient(projectKeys.url, projectKeys.anonKey);
    })().catch((err) => {
      clientPromise = null;
      throw err;
    });
  }
  return clientPromise;
}
