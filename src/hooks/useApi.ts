"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiClientError } from "@/lib/client/api";

export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiClientError | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const latest = useRef(path);

  const load = useCallback(
    async (silent = false) => {
      if (!path) return;
      latest.current = path;
      if (!silent) setLoading(true);
      try {
        const result = await api<T>(path);
        if (latest.current === path) {
          setData(result);
          setError(null);
        }
      } catch (e) {
        if (latest.current === path) setError(e as ApiClientError);
      } finally {
        if (latest.current === path) setLoading(false);
      }
    },
    [path]
  );

  useEffect(() => {
    load();
  }, [load]);

  return { data, error, loading, reload: load, setData };
}
