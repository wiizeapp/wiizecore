import { useCallback, useEffect, useRef, useState, type SetStateAction } from "react";
import { decodeCheckoutDraft, encodeCheckoutDraft } from "@/lib/checkout-resume";

/** Tab-scoped only. No cards, signatures, consent, session credentials or financial state. */
export function useCheckoutDraft<T extends Record<string, string>>(token: string, scope: string, fields: readonly string[], initial: T) {
  const key = `wiizepay:checkout-draft:${scope}:${token}`;
  const [value, setValue] = useState(initial);
  const current = useRef(initial);
  const restoredKey = useRef<string | null>(null);
  const initialRef = useRef(initial);
  useEffect(() => {
    current.current = initialRef.current;
    try {
      const raw = sessionStorage.getItem(key);
      const draft = decodeCheckoutDraft(fields, raw);
      if (raw && !draft) sessionStorage.removeItem(key);
      if (draft) current.current = { ...current.current, ...draft };
    } catch { /* Storage unavailable: keep working in memory. */ }
    restoredKey.current = key;
    setValue(current.current);
    return () => { restoredKey.current = null; };
  }, [key, fields]);
  const update = useCallback((next: SetStateAction<T>) => {
    const updated = typeof next === "function" ? next(current.current) : next;
    current.current = updated;
    setValue(updated);
    if (restoredKey.current !== key) return;
    try { sessionStorage.setItem(key, encodeCheckoutDraft(fields, updated)); } catch { /* Optional draft. */ }
  }, [key, fields]);
  const clear = useCallback(() => { try { sessionStorage.removeItem(key); } catch { /* Optional draft. */ } }, [key]);
  return [value, update, clear] as const;
}