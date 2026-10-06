import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ShieldCheck, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";

// Status de ativação da empresa (decidido pelo provedor). Apenas leitura visual.
export function useActivationStatus(tenantId: string | null | undefined) {
  return useQuery({
    queryKey: ["activation-status", tenantId],
    enabled: Boolean(tenantId),
    staleTime: 60_000,
    queryFn: async () =>
      ((await supabase.from("payment_activations").select("status").eq("tenant_id", tenantId!).maybeSingle()).data?.status ?? "not_started") as string,
  });
}

export function activationCopy(status: string) {
  if (status === "submitted" || status === "under_review" || status === "in_progress")
    return { title: "Sua conta está em análise", body: "Você já pode criar cobranças (até R$ 2.000 enquanto a análise não termina), mas os recebimentos só são liberados depois que a conta for aprovada." };
  if (status === "action_required")
    return { title: "Sua análise de conta precisa de ajustes", body: "Corrija os dados pendentes para liberar os recebimentos. Até lá, as cobranças podem ser criadas, mas nada é recebido." };
  if (status === "rejected" || status === "suspended")
    return { title: "Recebimentos bloqueados", body: "Sua conta não foi liberada para receber pagamentos. Revise a ativação para continuar." };
  return { title: "Ative sua conta para receber pagamentos", body: "Faça a análise completa da sua conta para liberar tudo. Você pode criar cobranças de teste (até R$ 2.000), mas não recebe nada enquanto os pagamentos não forem ativados." };
}

export function ActivationNotice({ tenantId, compact = false }: { tenantId: string | null | undefined; compact?: boolean }) {
  const { t: ui } = useTranslation("ui");
  const { data: status } = useActivationStatus(tenantId);
  if (!status || status === "approved") return null;
  const c = activationCopy(status);
  return (
    <div className={`flex items-start gap-3 rounded-xl border border-primary/25 bg-primary/[0.06] ${compact ? "p-3" : "mb-4 p-4"}`}>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary"><ShieldCheck className="h-4 w-4" /></span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{ui(c.title)}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{ui(c.body)}</p>
      </div>
      <Link to="/ativacao" className="inline-flex shrink-0 items-center gap-1 self-center text-xs font-semibold text-primary hover:underline">
        {ui("Fazer análise")}<ChevronRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}
