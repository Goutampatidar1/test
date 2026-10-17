import { useCallback, useEffect, useState } from "react";

/**
 * Per-tab totals for list tabs. `fetchTotal(tab)` should call the page's list API with
 * `limit: 1` and resolve to `pagination.total`. Failed tabs are skipped; stale counts stay
 * visible while reloading. Pass the current filters in `deps` so counts follow them.
 */
export function useTabCounts(tabs, fetchTotal, deps = []) {
  const [counts, setCounts] = useState({});
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all(
      tabs.map(async (tab) => {
        try {
          const total = await fetchTotal(tab);
          return [tab.key, Number.isFinite(Number(total)) ? Number(total) : undefined];
        } catch {
          return [tab.key, undefined];
        }
      })
    ).then((entries) => {
      if (cancelled) return;
      setCounts(Object.fromEntries(entries.filter(([, total]) => total !== undefined)));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  const refreshCounts = useCallback(() => setNonce((n) => n + 1), []);
  return { counts, refreshCounts };
}
