import { useEffect } from "react";
import { setTheme, syncThemeFromProfile, useTheme } from "@/lib/theme";
import { MonitorCog, MoonStar, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

type Theme = "system" | "light" | "dark";


const options = [
  { value: "system", label: "Usar tema do sistema", title: "Sistema", icon: MonitorCog },
  { value: "light", label: "Usar tema claro", title: "Claro", icon: Sun },
  { value: "dark", label: "Usar tema escuro", title: "Escuro", icon: MoonStar },
] satisfies Array<{ value: Theme; label: string; title: string; icon: typeof Sun }>;

export function ThemeToggle() {
  const { t: ui } = useTranslation("ui");
  const theme = useTheme();
  useEffect(() => { void syncThemeFromProfile(); }, []);
  const mounted = theme !== null;

  if (!mounted) return <div className="h-8 w-[94px]" aria-hidden="true" />;

  return (
    <div className="inline-flex h-8 items-center overflow-hidden rounded-md border border-sidebar-border bg-sidebar-accent/45 p-0.5 animate-fade-in" role="radiogroup" aria-label="Tema da interface">
      {options.map((option) => {
        const active = theme === option.value;
        return (
          <Button
            key={option.value}
            type="button"
            size="icon"
            variant="ghost"
            role="radio"
            aria-checked={active}
            aria-label={ui(option.label)}
            title={option.title}
            className={cn(
              "relative size-7 rounded-[5px] text-muted-foreground transition-all duration-200 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              active && "border border-sidebar-border bg-background text-foreground shadow-sm hover:bg-background",
            )}
            onClick={() => {
              void setTheme(option.value);
            }}
          >
            <option.icon className="size-3.5" strokeWidth={1.8} />
          </Button>
        );
      })}
    </div>
  );
}