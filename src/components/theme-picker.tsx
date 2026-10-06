import { setTheme, useTheme, type ThemeChoice } from "@/lib/theme";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

export type { ThemeChoice };

function Mock({ mode }: { mode: "light" | "dark" }) {
  const dark = mode === "dark";
  const bg = dark ? "#0B0F0D" : "#F6F7F6";
  const side = dark ? "#141A17" : "#FFFFFF";
  const line = dark ? "#26302B" : "#E3E7E4";
  const card = dark ? "#18201C" : "#FFFFFF";
  return (
    <svg viewBox="0 0 160 100" className="block h-full w-full" aria-hidden="true">
      <rect width="160" height="100" fill={bg} />
      <rect width="38" height="100" fill={side} />
      <rect x="8" y="10" width="10" height="10" rx="3" fill="#178C61" />
      {[30, 42, 54, 66].map((y) => <rect key={y} x="8" y={y} width="22" height="5" rx="2.5" fill={line} />)}
      <rect x="48" y="12" width="50" height="7" rx="3.5" fill={line} />
      <rect x="48" y="28" width="50" height="28" rx="5" fill="#178C61" />
      <rect x="104" y="28" width="46" height="28" rx="5" fill={card} stroke={line} />
      <rect x="48" y="64" width="102" height="28" rx="5" fill={card} stroke={line} />
      <path d="M56 84 L72 76 L88 80 L104 70 L120 74 L140 68" stroke="#178C61" strokeWidth="2" fill="none" />
    </svg>
  );
}

const options: Array<{ value: ThemeChoice; label: string }> = [
  { value: "light", label: "Claro" },
  { value: "dark", label: "Escuro" },
  { value: "system", label: "Sistema" },
];

export function ThemePicker() {
  const { t: ui } = useTranslation("ui");
  const theme = useTheme();

  if (!theme) return <div className="h-40 rounded-xl skeleton-shimmer" aria-hidden="true" />;

  return (
    <div role="radiogroup" aria-label="Tema da interface" className="grid gap-3 sm:grid-cols-3">
      {options.map((option) => {
        const selected = theme === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => void setTheme(option.value)}
            className={cn(
              "group relative overflow-hidden rounded-xl border bg-muted/40 p-3 pb-0 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              selected ? "border-primary ring-2 ring-primary/30" : "border-border",
            )}
          >
            <div className="flex items-center justify-between pb-3">
              <span className="text-sm font-medium">{ui(option.label)}</span>
              <span className={cn("grid size-5 place-items-center rounded-full border transition", selected ? "border-primary bg-primary text-primary-foreground" : "border-border")}>
                {selected ? <Check className="size-3" /> : null}
              </span>
            </div>
            <div className="aspect-[16/10] overflow-hidden rounded-t-md border border-b-0 border-border shadow-lg">
              {option.value === "system" ? (
                <div className="relative h-full w-full">
                  <Mock mode="light" />
                  <div className="absolute inset-0" style={{ clipPath: "polygon(100% 0, 100% 100%, 0 100%)" }}><Mock mode="dark" /></div>
                </div>
              ) : <Mock mode={option.value} />}
            </div>
          </button>
        );
      })}
    </div>
  );
}
