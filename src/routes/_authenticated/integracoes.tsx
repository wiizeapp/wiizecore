import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/app-shell";
import { IntegrationsCard } from "@/components/integrations-card";
import { DriveIntegrationCard } from "@/components/drive-integration-card";
import mailchimp from "@/assets/integrations/mailchimp.png";
import resend from "@/assets/integrations/resend.png";
import enotas from "@/assets/integrations/enotas.png";
import zapier from "@/assets/integrations/zapier.png";
import bling from "@/assets/integrations/bling.png";
import omie from "@/assets/integrations/omie.png";

export const Route = createFileRoute("/_authenticated/integracoes")({
  head: () => ({ meta: [{ title: "Integrações — WiizePay" }, { name: "description", content: "Conecte a WiizePay a outros sistemas." }, { property: "og:title", content: "Integrações — WiizePay" }, { property: "og:description", content: "Conecte a WiizePay a outros sistemas." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },] }),
  component: Integracoes,
});

const SOON = [
  { name: "Mailchimp", logo: mailchimp, desc: "Envie clientes para suas listas de e-mail marketing." },
  { name: "Resend", logo: resend, desc: "E-mails de cobrança e recibos com seu próprio domínio." },
  { name: "eNotas", logo: enotas, desc: "Emissão automática de notas fiscais de serviço." },
  { name: "Zapier", logo: zapier, desc: "Automatize tarefas com milhares de aplicativos." },
  { name: "Bling", logo: bling, desc: "Sincronize clientes e vendas com seu ERP." },
  { name: "Omie", logo: omie, desc: "Leve cobranças e recebimentos para o Omie." },
];

function Integracoes() {
  return (
    <div className="space-y-6">
      <PageHeader title="Integrações" description="Conecte a WiizePay aos sistemas que você já usa." />
      <IntegrationsCard />
      <DriveIntegrationCard />
      <section className="surface-panel p-5 sm:p-6">
        <h2 className="font-display text-base font-semibold tracking-tight">Em breve</h2>
        <p className="mt-1 text-xs text-muted-foreground">Novas conexões que estamos preparando.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SOON.map((i) => (
            <div key={i.name} className="flex items-start gap-3 rounded-xl border border-border p-4">
              <img src={i.logo} alt={i.name} className="size-10 shrink-0 rounded-lg" loading="lazy" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold">{i.name}</p>
                  <span className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-semibold text-muted-foreground">Em breve</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{i.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
