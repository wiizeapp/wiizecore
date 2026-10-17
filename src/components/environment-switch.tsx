import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { FlaskConical, Radio } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useTranslation } from "react-i18next";
import { setDevEnv, useDevEnv, type DevEnv } from "@/lib/dev-environment";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const OPTIONS: { value: DevEnv; title: string; label: string; icon: typeof Radio }[] = [
  { value: "test", title: "Sandbox — Testes", label: "Teste integrações e fluxos de pagamento sem movimentar dinheiro real.", icon: FlaskConical },
  { value: "live", title: "Produção — Operações reais", label: "Utilize as credenciais de produção para processar pagamentos reais.", icon: Radio },
];

/** Seletor de ambiente da área de desenvolvedores; independente do tema. */
export function EnvironmentSwitch() {
  const { t } = useTranslation("ui");
  const env = useDevEnv();
  const navigate = useNavigate();
  const [askTest, setAskTest] = useState(false);
  const choose = (v: DevEnv) => {
    if (v === env) return;
    if (v === "live" && !window.confirm(t("Mudar para Produção? As telas de desenvolvedor passam a mostrar chaves e cobranças reais."))) return;
    if (v === "test") { setAskTest(true); return; }
    setDevEnv(v);
  };
  return (
    <>
    <AlertDialog open={askTest} onOpenChange={setAskTest}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("Ambiente de testes")}</AlertDialogTitle>
          <AlertDialogDescription>{t("Para usar o ambiente de testes, conclua a ativação de pagamentos: preencha todos os dados e envie as fotos dos documentos. A análise é feita pelo provedor e costuma ser rápida.")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("Continuar em Produção")}</AlertDialogCancel>
          <AlertDialogAction onClick={() => { setDevEnv("test"); void navigate({ to: "/ativacao" }); }}>{t("Ir para ativação")}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <div className="inline-flex h-8 shrink-0 items-center overflow-hidden rounded-md border border-sidebar-border bg-sidebar-accent/45" role="radiogroup" aria-label={t("Ambiente da API")}>
      {OPTIONS.map((o) => {
        const active = env === o.value;
        return (
          <Button
            variant="ghost"
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={`${t(o.title)} — ${t(o.label)}`}
            onClick={() => choose(o.value)}
            className={cn(
              "inline-flex h-full items-center gap-1 whitespace-nowrap rounded-none px-1.5 py-0 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              active && "bg-background text-foreground hover:bg-background",
            )}
          >
            <o.icon className={cn("size-3.5", active && o.value === "test" && "text-warning", active && o.value === "live" && "text-primary")} strokeWidth={1.8} />
            {o.value === "test" ? t("Teste") : t("Prod.")}
          </Button>
        );
      })}
    </div>
    </>
  );
}
