import { useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";

import { privacyStore } from "./privacy-store";

export const valuesHidden = privacyStore.get;

export function setValuesHidden(v: boolean, persist = true) {
  privacyStore.set(v);
  if (persist) {
    void supabase.auth.getUser().then(({ data }) => {
      if (data.user) void supabase.from("profiles").update({ hide_values: v } as never).eq("id", data.user.id);
    });
  }
}

/** Lê a preferência salva no perfil (vale em qualquer dispositivo). */
export async function syncValuesHiddenFromProfile() {
  const { data } = await supabase.auth.getUser();
  if (!data.user) return;
  const { data: p } = await supabase.from("profiles").select("hide_values").eq("id", data.user.id).maybeSingle();
  const v = (p as { hide_values?: boolean } | null)?.hide_values;
  if (typeof v === "boolean" && v !== privacyStore.raw()) setValuesHidden(v, false);
}

export function useValuesHidden() {
  return useSyncExternalStore(
    privacyStore.subscribe,
    privacyStore.get,
    () => false,
  );
}
