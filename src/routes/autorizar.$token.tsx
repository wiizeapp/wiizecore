import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";
import { getPublicPixAuthorization } from "@/lib/pix-automatic.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Brand } from "@/components/brand";
import { FinancialIdentity, FinancialSupport } from "@/components/financial-provider";
import { formatBRL, formatDate } from "@/lib/format";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/autorizar/$token")({
  head: () => ({
    meta: [
      { title: "Autorizar Pix Automático — WiizePay" },
      { name: "description", content: "Autorize o Pix Automático no app do seu banco e pague suas cobranças recorrentes sem esforço." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Autorizar Pix Automático — WiizePay" },
      { property: "og:description", content: "Autorize uma vez no app do banco e as próximas cobranças são pagas automaticamente." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthorizePage,
});

const FREQ: Record<string, string> = { weekly: "Semanal", biweekly: "Quinzenal", monthly: "Mensal", quarterly: "Trimestral", semiannual: "Semestral", yearly: "Anual" };
const STATUS: Record<string, string> = { pending: "Aguardando sua autorização", active: "Autorizado", refused: "Recusado", cancelled: "Cancelado", expired: "Expirado" };

function AuthorizePage() {
  const { t: ui } = useTranslation("ui");
  const { token } = Route.useParams();
  const fetchAuth = useServerFn(getPublicPixAuthorization);
  const { data, error, isLoading } = useQuery({
    queryKey: ["public-pix-auth", token],
    queryFn: () => fetchAuth({ data: { token } }),
    retry: false,
    refetchInterval: (q) => (q.state.data?.status === "pending" ? 10000 : false),
  });

  return (
    <main className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto max-w-lg space-y-6">
        <Brand />
         {isLoading ? <p className="text-sm text-muted-foreground">{ui("Carregando…")}</p> : null}
        {error ? <p className="surface-panel p-6 text-sm text-destructive">{(error as Error).message}</p> : null}
        {data ? (
          <div className="surface-panel space-y-5 p-6">
            <div>
              <p className="text-sm text-muted-foreground">{data.company} pede sua autorização para</p>
              <h1 className="font-display text-2xl font-semibold">{ui("Pix Automático")}</h1>
              <p className="mt-1 text-sm">{data.service}</p>
            </div>
            <dl className="numeric-tabular space-y-2 text-sm">
               <div className="flex justify-between"><dt>{ui("Valor")}</dt><dd className="font-semibold">{formatBRL(data.value)}</dd></div>
               <div className="flex justify-between"><dt>{ui("Frequência")}</dt><dd>{ui(FREQ[data.frequency] ?? data.frequency)}</dd></div>
               <div className="flex justify-between"><dt>{ui("Primeira cobrança")}</dt><dd>{formatDate(data.startOn)}</dd></div>
               <div className="flex justify-between"><dt>{ui("Situação")}</dt><dd><Badge variant={data.status === "active" ? "default" : "secondary"}>{ui(STATUS[data.status] ?? data.status)}</Badge></dd></div>
            </dl>

            {data.status === "active" ? (
              <div className="flex items-start gap-3 rounded-md border border-border p-4 text-sm">
                <CheckCircle2 className="mt-0.5 h-5 w-5 text-primary" />
                <p>Tudo certo! As próximas cobranças serão pagas automaticamente pelo seu banco. Você pode cancelar quando quiser no app do banco.</p>
              </div>
            ) : null}

            {data.status === "pending" ? (
              <>
                <div className="rounded-md border border-border p-4 text-sm">
                  <p className="mb-2 font-medium">{ui("Como funciona")}</p>
                  <p className="text-muted-foreground">Você autoriza uma única vez. Depois, o seu banco paga cada cobrança sozinho, no valor e na frequência acima. Nada é cobrado fora do combinado e você pode cancelar a qualquer momento pelo app do banco.</p>
                </div>
                <ol className="list-decimal space-y-1 pl-5 text-sm">
                  <li>Abra o app do seu banco e vá em <b>Pix</b>.</li>
                  <li>Escolha <b>Ler QR code</b> ou <b>Pix Copia e Cola</b>.</li>
                  <li>Leia o QR abaixo ou cole o código copiado.</li>
                  <li>Confira o valor e a frequência e toque em <b>Autorizar Pix Automático</b>.</li>
                </ol>
                {data.image ? (
                  <img src={`data:image/png;base64,${data.image}`} alt="QR code para autorizar o Pix Automático" className="mx-auto w-60 rounded-md bg-card p-2" />
                ) : null}
                {data.payload ? (
                  <Button className="w-full" onClick={() => { void navigator.clipboard.writeText(data.payload ?? ""); toast.success("Código copiado. Cole no app do banco."); }}>
                     {ui("Copiar código Pix")}
                  </Button>
                ) : null}
                 <p className="text-center text-xs text-muted-foreground">{ui("Esta página atualiza sozinha quando o banco confirmar.")}</p>
              </>
            ) : null}
          </div>
        ) : null}
        <footer className="pt-4"><FinancialIdentity /><FinancialSupport compact /></footer>
      </div>
    </main>
  );
}
