import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type ThemeChoice = "light" | "dark" | "system";
const KEY = "wiize-theme";
const EVT = "wiize-theme-change";

const valid = (v: unknown): v is ThemeChoice => v === "light" || v === "dark" || v === "system";

export function readTheme(): ThemeChoice {
  const v = window.localStorage.getItem(KEY);
  return valid(v) ? v : "dark";
}

function paint(theme: ThemeChoice) {
  const dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
}

function setLocal(theme: ThemeChoice) {
  window.localStorage.setItem(KEY, theme);
  paint(theme);
  window.dispatchEvent(new CustomEvent(EVT, { detail: theme }));
}

/** Aplica, guarda no aparelho e salva no perfil (vale em todos os dispositivos). */
export async function setTheme(theme: ThemeChoice) {
  setLocal(theme);
  const { data } = await supabase.auth.getUser();
  if (data.user) await supabase.from("profiles").update({ theme }).eq("id", data.user.id);
}

/** Busca o tema salvo no perfil e aplica neste aparelho. */
export async function syncThemeFromProfile() {
  const { data } = await supabase.auth.getUser();
  if (!data.user) return;
  const { data: p } = await supabase.from("profiles").select("theme").eq("id", data.user.id).maybeSingle();
  if (p && valid(p.theme) && p.theme !== readTheme()) setLocal(p.theme);
}

export function useTheme() {
  const [theme, set] = useState<ThemeChoice | null>(null);
  useEffect(() => {
    set(readTheme());
    paint(readTheme());
    const onChange = (e: Event) => set((e as CustomEvent<ThemeChoice>).detail);
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onSys = () => readTheme() === "system" && paint("system");
    window.addEventListener(EVT, onChange);
    media.addEventListener("change", onSys);
    return () => { window.removeEventListener(EVT, onChange); media.removeEventListener("change", onSys); };
  }, []);
  return theme;
}
