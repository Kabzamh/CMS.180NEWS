import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from '../lib/api';

/** Fetches on mount and whenever deps change. reload(true) refreshes without the loading state. */
export function useLoad<T>(loader: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  const seq = useRef(0);

  const reload = useCallback(async (quiet = false) => {
    const run = ++seq.current;
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const result = await loaderRef.current();
      if (run === seq.current) setData(result);
    } catch (err) {
      if (run === seq.current) setError(errorMessage(err));
    } finally {
      if (run === seq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, loading, error, reload, setData };
}

export function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
