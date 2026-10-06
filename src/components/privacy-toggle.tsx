import { useEffect } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { privacyStore } from "@/lib/privacy-store";
import { setValuesHidden, syncValuesHiddenFromProfile, useValuesHidden } from "@/lib/privacy";

/** Ativa a privacidade dentro da área logada e devolve uma chave que muda ao alternar (re-renderiza os valores). */
export function usePrivacyKey() {
  useEffect(() => {
    privacyStore.setActive(true);
    void syncValuesHiddenFromProfile();
    return () => privacyStore.setActive(false);
  }, []);
  return useValuesHidden() ? "hidden" : "shown";
}

export function PrivacyToggle() {
  const hidden = useValuesHidden();
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setValuesHidden(!hidden)}
      aria-label={hidden ? "Mostrar valores" : "Ocultar valores"}
      title={hidden ? "Mostrar valores" : "Ocultar valores"}
      aria-pressed={hidden}
    >
      {hidden ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
    </Button>
  );
}
