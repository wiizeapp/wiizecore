import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DateField } from "@/components/ds/date-field";
import { StatusBadge } from "@/components/ds";
import { computeLateCharges, todaySaoPaulo } from "@/lib/late-charges";
import { reactivateCharge } from "@/lib/charge-attempts.functions";
import { formatBRL } from "@/lib/format";

export type LatePayment = {
  id: string; status: string; gross_amount: number; due_on: string;
  original_amount?: number | null; original_due_on?: string | null;
  fine_percent?: number | null; interest_percent?: number | null;
  installment_count?: number | null; subscription_id?: string | null;
};

/** Valor atualizado só para exibição; o valor cobrado é sempre calculado no servidor. */
export function lateInfo(p: LatePayment) {
  if (!["overdue", "awaiting_payment", "created"].includes(p.status)) return null;
  const q = computeLateCharges({
    amount: Number(p.original_amount ?? p.gross_amount),
    finePercent: Number(p.fine_percent ?? 0),
    interestPercentMonthly: Number(p.interest_percent ?? 0),
    dueOn: p.original_due_on ?? p.due_on,
    today: todaySaoPaulo(),
  });
  return q.days > 0 ? q : null;
}

/** Linha "Atrasada há X dias" com total atualizado e atalho para cancelar. */
export function OverdueLine({ payment, onCancel }: { payment: LatePayment; onCancel?: () => void }) {
  const { t } = useTranslation("ui");
  const q = lateInfo(payment);
  if (!q) return null;
  return (
    <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-destructive">
      <span>{t("Atrasada há")} {q.days} {q.days === 1 ? t("dia") : t("dias")} · <span className="numeric-tabular font-medium">{formatBRL(q.total)}</span></span>
      {onCancel ? (
        <button type="button" onClick={onCancel} className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {t("Cancelar cobrança")}
        </button>
      ) : null}
    </span>
  );
}

/** Selo "Cancelada" que revela "Ativar novamente" ao passar o mouse, focar ou tocar. */
export function CancelledBadge({ payment, label }: { payment: LatePayment; label: string }) {
  const { t } = useTranslation("ui");
  const qc = useQueryClient();
  const reactivate = useServerFn(reactivateCharge);
  const [open, setOpen] = useState(false);
  const [dueOn, setDueOn] = useState("");
  const single = !payment.installment_count && !payment.subscription_id;
  const mut = useMutation({
    mutationFn: () => reactivate({ data: { paymentId: payment.id, dueOn } }),
    onSuccess: () => {
      toast.success(t("Cobrança ativada novamente. O link é o mesmo."));
      setOpen(false);
      void qc.invalidateQueries({ queryKey: ["payments"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("Não foi possível ativar agora.")),
  });
  if (!single) return <StatusBadge tone="neutral">{label}</StatusBadge>;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group relative inline-flex rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={t("Ativar novamente")}
      >
        <span className="transition-opacity group-hover:opacity-0 group-focus-visible:opacity-0"><StatusBadge tone="neutral">{label}</StatusBadge></span>
        <span className="absolute inset-0 inline-flex items-center justify-center gap-1 whitespace-nowrap rounded-full bg-primary px-2 text-xs font-medium text-primary-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          <RotateCcw className="size-3" />{t("Ativar novamente")}
        </span>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("Ativar cobrança novamente")}</DialogTitle>
            <DialogDescription>{t("Escolha a nova data de vencimento. O cliente paga pelo mesmo link, sem multa nem juros anteriores.")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>{t("Novo vencimento")}</Label>
            <DateField value={dueOn} onChange={setDueOn} min={todaySaoPaulo()} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>{t("Voltar")}</Button>
            <Button disabled={!dueOn || mut.isPending} onClick={() => mut.mutate()}>{t("Ativar novamente")}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
