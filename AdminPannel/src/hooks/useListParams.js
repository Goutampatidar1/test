import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * List state (tab, filters, search, page) kept in the URL so it survives back navigation.
 * `defaults` declares every filter key; a value equal to its default is left out of the URL,
 * an empty value for a non-empty default is stored as `key=` so "All" can be told apart.
 */
export function useListParams(defaults = {}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const defaultsRef = useRef(defaults);
  defaultsRef.current = defaults;

  const params = {};
  Object.entries(defaults).forEach(([key, fallback]) => {
    const value = searchParams.get(key);
    params[key] = value == null ? fallback : value;
  });
  params.search = searchParams.get("search") || "";
  params.page = Math.max(1, Number(searchParams.get("page")) || 1);

  const setParams = useCallback(
    (patch) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          Object.entries(patch).forEach(([key, value]) => {
            const fallback = key === "page" ? "1" : key === "search" ? "" : String(defaultsRef.current[key] ?? "");
            const str = value == null ? "" : String(value);
            if (str === fallback) next.delete(key);
            else next.set(key, str);
          });
          if (!("page" in patch)) next.delete("page");
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const [searchInput, setSearchInput] = useState(params.search);

  useEffect(() => {
    const t = setTimeout(() => {
      const value = searchInput.trim();
      if (value !== params.search) setParams({ search: value });
    }, 400);
    return () => clearTimeout(t);
  }, [params.search, searchInput, setParams]);

  /** Clears search plus the given filter keys back to their defaults. */
  const resetFilters = useCallback(
    (keys = []) => {
      setSearchInput("");
      const patch = { search: "" };
      keys.forEach((key) => {
        patch[key] = defaultsRef.current[key] ?? "";
      });
      setParams(patch);
    },
    [setParams]
  );

  return { params, setParams, searchInput, setSearchInput, resetFilters };
}
