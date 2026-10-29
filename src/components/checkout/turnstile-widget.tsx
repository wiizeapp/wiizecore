import { useEffect, useRef } from "react";

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id?: string) => void;
  remove: (id?: string) => void;
};
declare global { interface Window { turnstile?: TurnstileApi } }

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let loader: Promise<void> | null = null;
function loadScript() {
  if (window.turnstile) return Promise.resolve();
  loader ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT_SRC; s.async = true; s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => { loader = null; reject(new Error("turnstile")); };
    document.head.appendChild(s);
  });
  return loader;
}

/** Widget Turnstile (modo Managed). O token é só um passe: o servidor é quem valida. */
export function TurnstileWidget({ siteKey, action, resetKey, onToken, onError }: { siteKey: string; action: string; resetKey: number; onToken: (t: string | null) => void; onError: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const idRef = useRef<string | null>(null);
  const cb = useRef({ onToken, onError });
  cb.current = { onToken, onError };

  useEffect(() => {
    let cancelled = false;
    loadScript().then(() => {
      if (cancelled || !ref.current || !window.turnstile) return;
      idRef.current = window.turnstile.render(ref.current, {
        sitekey: siteKey, action, appearance: "interaction-only",
        callback: (t: string) => cb.current.onToken(t),
        "expired-callback": () => cb.current.onToken(null),
        "error-callback": () => { cb.current.onToken(null); cb.current.onError(); },
      });
    }).catch(() => cb.current.onError());
    return () => { cancelled = true; if (idRef.current) window.turnstile?.remove(idRef.current); idRef.current = null; };
  }, [siteKey, action]);

  // Token é de uso único: após cada tentativa pedimos um novo.
  useEffect(() => { if (resetKey > 0 && idRef.current) { cb.current.onToken(null); window.turnstile?.reset(idRef.current); } }, [resetKey]);

  return <div ref={ref} className="flex justify-center" />;
}
