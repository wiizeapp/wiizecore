import { useEffect } from "react";

export function useCheckoutReturn(refresh: () => unknown) {
  useEffect(() => {
    const resume = () => { if (document.visibilityState === "visible") void refresh(); };
    const restored = (event: PageTransitionEvent) => { if (event.persisted) resume(); };
    window.addEventListener("focus", resume);
    window.addEventListener("online", resume);
    window.addEventListener("pageshow", restored);
    document.addEventListener("visibilitychange", resume);
    return () => {
      window.removeEventListener("focus", resume);
      window.removeEventListener("online", resume);
      window.removeEventListener("pageshow", restored);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [refresh]);
}