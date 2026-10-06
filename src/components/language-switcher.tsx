import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Check, ChevronsUpDown, Globe } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { LANGUAGES, LANG_STORAGE_KEY, detectLanguage, normalizeLang, setLanguage, type Lang } from "@/i18n";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

/** Aplica o idioma salvo/detectado uma vez após a hidratação. */
export function useLanguageBootstrap() {
  const { i18n } = useTranslation();
  const { user } = useAuth();
  useEffect(() => {
    const profileLang = normalizeLang(typeof user?.user_metadata?.["language"] === "string" ? user.user_metadata["language"] : null);
    let savedLang: Lang | null = null;
    try { savedLang = normalizeLang(localStorage.getItem(LANG_STORAGE_KEY)); } catch { /* sem armazenamento */ }
    const language = savedLang ?? profileLang ?? detectLanguage();
    if (language === i18n.resolvedLanguage) return;
    // Espera a página terminar de hidratar (partes carregadas depois) antes de trocar o idioma;
    // trocar antes gera divergência com o servidor e o React quebra ao remontar a tela.
    let handle = 0;
    let tries = 0;
    const pendingHydration = () => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_COMMENT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const d = (n as Comment).data;
        if (d === "$?" || d === "$!" || d === "$~") return true;
      }
      return false;
    };
    const check = () => {
      tries += 1;
      if (pendingHydration() && tries < 100) { handle = window.setTimeout(check, 100); return; }
      void setLanguage(language);
    };
    handle = window.setTimeout(check, 50);
    return () => window.clearTimeout(handle);
  }, [i18n, user?.id, user?.user_metadata?.["language"]]);
}

function Flag({ src, alt, className }: { src: string; alt: string; className?: string }) {
  return (
    <img
      src={src}
      alt={alt}
      aria-hidden
      draggable={false}
      className={`size-5 shrink-0 rounded-full object-cover ring-1 ring-foreground/10 ${className ?? ""}`}
    />
  );
}

export function LanguageSwitcher({ align = "end" }: { align?: "start" | "end" }) {
  const { i18n, t } = useTranslation("footer");
  const { user } = useAuth();
  const chooseLanguage = async (language: Lang) => {
    await setLanguage(language);
    if (user) void supabase.auth.updateUser({ data: { ...user.user_metadata, language } });
  };
  const current = LANGUAGES.find((l) => l.code === i18n.resolvedLanguage) ?? LANGUAGES[0];
  return (
    <div data-i18n-native className="shrink-0">
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-9 gap-2 px-2.5 text-sm font-medium"
          aria-label={`${t("language")}: ${current.label}`}
        >
          <Flag src={current.flagSrc} alt="" />
          <span>{current.short}</span>
          <ChevronsUpDown className="size-3.5 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="min-w-56 p-1.5">
        <DropdownMenuLabel className="flex items-center gap-2 px-2.5 py-2 text-xs font-medium text-muted-foreground">
          <Globe className="size-3.5" aria-hidden />
          {t("language")}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="flex flex-col gap-0.5">
          {LANGUAGES.map((l) => (
            <DropdownMenuItem
              key={l.code}
               onSelect={() => void chooseLanguage(l.code as Lang)}
              aria-current={l.code === current.code}
              className="gap-3 rounded-md px-2.5 py-2.5"
            >
              <Flag src={l.flagSrc} alt="" />
              <span className="flex min-w-0 flex-1 flex-col items-start gap-0">
                <span className="text-sm leading-tight">{l.label}</span>
                <span className="text-xs leading-tight text-muted-foreground">{l.short}</span>
              </span>
              {l.code === current.code && <Check className="size-4 shrink-0 text-primary" aria-label={t("selected", { defaultValue: "Selecionado" })} />}
            </DropdownMenuItem>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
    </div>
  );
}
