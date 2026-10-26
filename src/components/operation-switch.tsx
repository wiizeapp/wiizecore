import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Globe2, Lock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { getMyOperation, setMyOperation } from "@/lib/operation.functions";
import { canUseFinancialScreens, type Operation } from "@/lib/operation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function useOperation() {
  const fetchOp = useServerFn(getMyOperation);
  return useQuery({ queryKey: ["my-operation"], queryFn: () => fetchOp(), staleTime: 60_000 });
}

export function OperationSwitch() {
  const { t } = useTranslation("ui");
  const qc = useQueryClient();
  const { data } = useOperation();
  const save = useServerFn(setMyOperation);
  const m = useMutation({
    mutationFn: (operation: Operation) => save({ data: { operation } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-operation"] }),
  });
  const current = data?.operation ?? "brasil";
  const opts: { v: Operation; label: string }[] = [{ v: "brasil", label: t("Brasil") }, { v: "global", label: t("Global") }];
  return (
    <div className="inline-flex h-8 items-center overflow-hidden rounded-md border border-border" role="radiogroup" aria-label={t("Operação")}>
      {opts.map((o) => (
        <Button key={o.v} type="button" variant="ghost" role="radio" aria-checked={current === o.v} disabled={m.isPending}
          onClick={() => current !== o.v && m.mutate(o.v)}
          className={cn("h-full rounded-none px-2.5 text-xs text-muted-foreground", current === o.v && "bg-primary/10 font-semibold text-foreground")}>
          {o.v === "global" ? <Globe2 className="mr-1 size-3.5" /> : null}{o.label}
        </Button>
      ))}
    </div>
  );
}

/** Mostra a área Global vazia e bloqueada no lugar das telas brasileiras. */
export function OperationGate({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation("ui");
  const { data } = useOperation();
  if (!data || canUseFinancialScreens(data.operation, data.globalEnabled)) return <>{children}</>;
  return (
    <div className="mx-auto max-w-xl rounded-xl border border-border bg-card p-8 text-center">
      <div className="mx-auto mb-4 grid size-12 place-items-center rounded-full bg-muted"><Lock className="size-5 text-muted-foreground" /></div>
      <h2 className="font-display text-xl font-bold">{t("Operação Global em preparação")}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{t("Ainda não é possível receber do exterior. Nenhuma cobrança, saldo ou cliente aparece aqui até a integração internacional ser aprovada. Volte para Brasil para continuar usando sua conta normalmente.")}</p>
    </div>
  );
}
