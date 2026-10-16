import { useSyncExternalStore } from "react";

/**
 * Preferência VISUAL de ambiente da área de desenvolvedores (teste ou produção).
 * Não dá nem tira permissão: quem decide o ambiente de cada chamada é a chave no servidor.
 */
export type DevEnv = "test" | "live";
const KEY = "wiize-dev-env";
const listeners = new Set<() => void>();

function read(): DevEnv {
  try { return window.localStorage.getItem(KEY) === "live" ? "live" : "test"; } catch { return "test"; }
}
export function setDevEnv(env: DevEnv) {
  try { window.localStorage.setItem(KEY, env); } catch { /* sem armazenamento: fica só nesta tela */ }
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => { if (e.key === KEY) l(); };
  window.addEventListener("storage", onStorage);
  return () => { listeners.delete(l); window.removeEventListener("storage", onStorage); };
}
export function useDevEnv(): DevEnv {
  return useSyncExternalStore(subscribe, read, () => "test");
}
