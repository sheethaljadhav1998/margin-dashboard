import { useCallback, useEffect, useState } from "react";

export async function apiGet(path) {
  const res = await fetch(path);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.error || res.statusText);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

export async function apiSend(path, { method = "GET", json, form } = {}) {
  const res = await fetch(path, {
    method,
    headers: json ? { "Content-Type": "application/json" } : undefined,
    body: form ?? (json ? JSON.stringify(json) : undefined),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.error || res.statusText);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

export function useApi(path) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(Boolean(path));

  const load = useCallback(() => {
    if (!path) return undefined;
    let cancelled = false;
    setLoading(true);
    apiGet(path)
      .then((next) => {
        if (!cancelled) {
          setData(next);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err);
          setData(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  useEffect(() => load(), [load]);

  useEffect(() => {
    function onRefresh() {
      load();
    }
    window.addEventListener("margin-refresh", onRefresh);
    return () => window.removeEventListener("margin-refresh", onRefresh);
  }, [load]);

  return { data, error, loading, reload: load };
}
