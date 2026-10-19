import { Check, Copy, Sparkles } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { buildUniversalAiGuide } from "@/lib/api-docs-content";
import lovableLogo from "@/assets/ai-tools/lovable.png";
import openaiLogo from "@/assets/ai-tools/openai.png";
import claudeLogo from "@/assets/ai-tools/claude.png";
import cursorLogo from "@/assets/ai-tools/cursor.png";
import geminiLogo from "@/assets/ai-tools/gemini.png";
import base44Logo from "@/assets/ai-tools/base44.png";
import replitLogo from "@/assets/ai-tools/replit.png";

const LOGOS = [lovableLogo, openaiLogo, claudeLogo, cursorLogo, geminiLogo, base44Logo, replitLogo];

/** Logos sobrepostos em zigue-zague: cada um invade levemente o de baixo. */
function LogoStack() {
  return (
    <div className="relative h-44 w-36 shrink-0" aria-hidden>
      {LOGOS.map((l, i) => (
        <img
          key={l}
          src={l}
          alt=""
          loading="lazy"
          className="absolute size-14 rounded-2xl border-2 border-card bg-card object-cover shadow-card"
          style={{ top: i * 18, left: i % 2 === 0 ? 0 : 64, zIndex: LOGOS.length - i, transform: `rotate(${i % 2 === 0 ? -6 : 6}deg)` }}
        />
      ))}
    </div>
  );
}

export function AiGuideCard() {
  const { t } = useTranslation("ui");
  const [done, setDone] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(buildUniversalAiGuide());
    setDone(true); toast.success(t("Guia copiado. Cole na sua IA de programação."));
    setTimeout(() => setDone(false), 2500);
  };
  return (
    <section className="relative overflow-hidden rounded-2xl border border-primary/25 bg-card p-6 shadow-card sm:p-8">
      <div className="pointer-events-none absolute -right-20 -top-20 size-64 rounded-full bg-primary/10 blur-3xl" />
      <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center">
        <LogoStack />
        <div className="min-w-0 flex-1 space-y-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary"><Sparkles className="size-3.5" />{t("Guia para IA")}</span>
          <h2 className="text-2xl font-semibold tracking-tight">{t("Integre com qualquer IA de programação")}</h2>
          <p className="text-sm leading-6 text-muted-foreground">{t("Um único texto com as instruções, a documentação completa e os links. Funciona nas principais ferramentas de IA. Nenhuma chave é incluída.")}</p>
          <Button size="lg" onClick={() => void copy()}>{done ? <Check className="size-4" /> : <Copy className="size-4" />}{done ? t("Copiado") : t("Copiar guia de implementação")}</Button>
        </div>
      </div>
    </section>
  );
}
