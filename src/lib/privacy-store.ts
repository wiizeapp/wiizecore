/** Estado global "ocultar valores" (sem dependências, seguro em qualquer lugar). */
const KEY = "wiize-hide-values";
let hidden = typeof window !== "undefined" && window.localStorage.getItem(KEY) === "1";
let active = false; // só vale dentro da área logada
const subs = new Set<() => void>();
export const privacyStore = {
  get: () => hidden && active,
  raw: () => hidden,
  setActive(v: boolean) {
    active = v;
    subs.forEach((f) => f());
  },
  set(v: boolean) {
    hidden = v;
    if (typeof window !== "undefined") window.localStorage.setItem(KEY, v ? "1" : "0");
    subs.forEach((f) => f());
  },
  subscribe(f: () => void) {
    subs.add(f);
    return () => void subs.delete(f);
  },
};
