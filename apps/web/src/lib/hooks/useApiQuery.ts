import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';

export interface UseApiQueryResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useApiQuery<T>(
  path: string | null,
  deps?: unknown[],
): UseApiQueryResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Monotonic request sequence: a slow response for an old path must not
  // overwrite the state of a newer request (stale-response race).
  const seqRef = useRef(0);

  const fetchData = useCallback(async () => {
    const seq = ++seqRef.current;
    if (!path) {
      setData(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await api<T>(path);
      if (seq !== seqRef.current) return;
      setData(result);
    } catch (err) {
      if (seq !== seqRef.current) return;
      setError(err instanceof Error ? err.message : 'Unknown error');
      setData(null);
    } finally {
      if (seq === seqRef.current) setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    fetchData();
  }, [fetchData, ...(deps ?? [])]);

  return { data, loading, error, refetch: fetchData };
}
