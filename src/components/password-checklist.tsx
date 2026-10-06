import { Check, X } from "lucide-react";
import { PASSWORD_RULES } from "@/lib/password-policy";
import { useTranslation } from "react-i18next";

export function PasswordChecklist({ value }: { value: string }) {
  const { t: ui } = useTranslation("ui");
  if (!value) return null;
  return (
    <ul className="mt-2 space-y-1 text-xs">
      {PASSWORD_RULES.map((r) => {
        const ok = r.test(value);
        return (
          <li key={r.label} className={`flex items-center gap-1.5 ${ok ? "text-primary" : "text-muted-foreground"}`}>
            {ok ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
            {ui(r.label)}
          </li>
        );
      })}
    </ul>
  );
}
