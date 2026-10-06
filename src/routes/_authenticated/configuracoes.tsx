import { LanguageSwitcher } from "@/components/language-switcher";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import { PageHeader } from "@/components/app-shell";
import { updateCompany } from "@/lib/workspace.functions";
import { createAsaasSubaccount, getProviderConnection, refreshAsaasSubaccountStatus } from "@/lib/provider.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { formatBRL, formatDateTime } from "@/lib/format";
import { WebhookPanel } from "@/components/webhook-panel";
import { ensureTwoFactor, getMfaState } from "@/lib/mfa-step-up";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/_authenticated/configuracoes")({
  head: () => ({
    meta: [
      { title: "Configurações — WiizePay" },
      { name: "description", content: "Configure empresa, conta de pagamentos e regras financeiras da WiizePay." },
      { property: "og:title", content: "Configurações — WiizePay" },
      { property: "og:description", content: "Configure empresa, conta de pagamentos e regras financeiras da WiizePay." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Configuracoes,
});

function Configuracoes() {
  const { t: ui } = useTranslation("ui");
  const { data: workspace } = useWorkspace();
  const tenantId = workspace?.tenantId;
  const queryClient = useQueryClient();
  const saveCompany = useServerFn(updateCompany);
  const createSubaccount = useServerFn(createAsaasSubaccount);
  const refreshStatus = useServerFn(refreshAsaasSubaccountStatus);
  const fetchProvider = useServerFn(getProviderConnection);

  const [company, setCompany] = useState({ name: "", legalName: "", document: "", phone: "", email: "", zipCode: "", address: "", addressNumber: "", complement: "", district: "", city: "", state: "", companyType: "", incomeValue: "" });
  const [financialPassword, setFinancialPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const { data: mfa } = useQuery({ queryKey: ["mfa-state-settings"], queryFn: getMfaState });

  const { data: tenant } = useQuery({
    queryKey: ["tenant", tenantId],
    enabled: Boolean(tenantId),
    queryFn: async () => {
      if (!tenantId) throw new Error("Empresa não encontrada.");
      const { data, error } = await supabase
        .from("tenants")
        .select("name, legal_name, document, phone, email, zip_code, address, address_number, complement, district, city, state, company_type, income_value")
        .eq("id", tenantId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: provider } = useQuery({ queryKey: ["provider"], queryFn: () => fetchProvider({}) });

  useEffect(() => {
    if (tenant) {
      setCompany({
        name: tenant.name ?? "",
        legalName: tenant.legal_name ?? "",
        document: tenant.document ?? "",
        phone: tenant.phone ?? "",
        email: tenant.email ?? "",
        zipCode: tenant.zip_code ?? "",
        address: tenant.address ?? "",
        addressNumber: tenant.address_number ?? "",
        complement: tenant.complement ?? "",
        district: tenant.district ?? "",
        city: tenant.city ?? "",
        state: tenant.state ?? "",
        companyType: tenant.company_type ?? "",
        incomeValue: tenant.income_value != null ? String(tenant.income_value) : "",
      });
    }
  }, [tenant]);

  const companyMutation = useMutation({
    mutationFn: async () => saveCompany({ data: { ...company, incomeValue: company.incomeValue ? Number(company.incomeValue.replace(",", ".")) : null } }),
    onSuccess: () => {
      toast.success("Dados da empresa atualizados.");
      void queryClient.invalidateQueries({ queryKey: ["tenant", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["workspace"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const connectMutation = useMutation({
    mutationFn: async () => {
      await ensureTwoFactor(mfaCode);
      return createSubaccount({ data: { financialPassword } });
    },
    onSuccess: (result) => {
      toast.success("Cadastro financeiro enviado para análise.");
      if (result.webhookError) toast.warning(`Webhook pendente: ${result.webhookError}`);
      setFinancialPassword("");
      setMfaCode("");
      void queryClient.invalidateQueries({ queryKey: ["provider"] });
      void queryClient.invalidateQueries({ queryKey: ["workspace"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const refreshMutation = useMutation({
    mutationFn: async () => refreshStatus({}),
    onSuccess: () => {
      toast.success("Situação atualizada.");
      void queryClient.invalidateQueries({ queryKey: ["provider"] });
      void queryClient.invalidateQueries({ queryKey: ["workspace"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-6">
      <PageHeader title={ui("Configurações")} description="Dados da empresa, conta de pagamentos e regras financeiras." />

      <section className="surface-panel grid gap-6 p-5 sm:p-6 lg:grid-cols-[260px_1fr]">
        <div>
          <h2 className="font-display text-base font-semibold tracking-tight">{ui("Idioma")}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{ui("Escolha o idioma do sistema. Valores continuam em reais (R$).")}</p>
        </div>
        <div className="flex items-center"><LanguageSwitcher align="start" /></div>
      </section>

      <section className="surface-panel grid gap-6 p-5 sm:p-6 lg:grid-cols-[260px_1fr]">
        <div>
          <h2 className="font-display text-base font-semibold tracking-tight">Dados da empresa</h2>
          <p className="mt-1 text-xs text-muted-foreground">Nome, documento e contato que aparecem nas suas cobranças.</p>
        </div>
        <div className="min-w-0">
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            companyMutation.mutate();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="company-name">{ui("Nome")}</Label>
            <Input
              id="company-name"
              required
              value={company.name}
              onChange={(e) => setCompany({ ...company, name: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="legal-name">Razão social</Label>
            <Input
              id="legal-name"
              value={company.legalName}
              onChange={(e) => setCompany({ ...company, legalName: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="company-doc">CPF / CNPJ</Label>
            <Input
              id="company-doc"
              value={company.document}
              onChange={(e) => setCompany({ ...company, document: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="company-phone">Telefone</Label>
            <Input
              id="company-phone"
              value={company.phone}
              onChange={(e) => setCompany({ ...company, phone: e.target.value })}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="company-email">E-mail de contato</Label>
            <Input
              id="company-email"
              type="email"
              value={company.email}
              onChange={(e) => setCompany({ ...company, email: e.target.value })}
            />
          </div>
          {([['zipCode','CEP'],['address','Endereço'],['addressNumber','Número'],['complement','Complemento'],['district','Bairro'],['city','Cidade'],['state','UF'],['companyType','Tipo de empresa'],['incomeValue','Faturamento mensal (R$)']] as const).map(([key, label]) => <div key={key} className="space-y-2"><Label htmlFor={`company-${key}`}>{label}</Label><Input id={`company-${key}`} value={company[key]} onChange={(e) => setCompany({ ...company, [key]: e.target.value })} /></div>)}
          <div className="sm:col-span-2">
            <Button type="submit" disabled={companyMutation.isPending}>
              Salvar alterações
            </Button>
          </div>
        </form>
      </div>
      </section>

      <section className="surface-panel grid gap-6 p-5 sm:p-6 lg:grid-cols-[260px_1fr]">
        <div>
          <h2 className="font-display text-base font-semibold tracking-tight">Conta de pagamentos WiizePay</h2>
          <p className="mt-1 text-xs text-muted-foreground">Criamos sua conta de pagamentos. Você não precisa gerar nem informar uma chave própria.</p>
        </div>
        <div className="min-w-0">
          {provider?.status === "connected" ? (
            <Badge className="mb-4">{provider.environment === "production" ? "Produção" : "Sandbox"}</Badge>
          ) : (
            <Badge variant="secondary">Não conectada</Badge>
          )}

        {provider?.status === "connected" ? (
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">
               Atualizada em {formatDateTime(provider.last_checked_at)} · situação {provider.onboarding_status === 'active' ? 'ativa' : 'em análise'}
            </p>
             <Button variant="outline" onClick={() => refreshMutation.mutate()} disabled={refreshMutation.isPending}>
               Atualizar situação
            </Button>
            <WebhookPanel webhookUrl={provider.webhook_url ?? null} />
          </div>
        ) : (
          <form
            className="grid gap-4 sm:grid-cols-[1fr_200px]"
            onSubmit={(event) => {
              event.preventDefault();
              connectMutation.mutate();
            }}
          >
             <div className="space-y-2"><Label>Senha financeira</Label><Input type="password" value={financialPassword} onChange={(e) => setFinancialPassword(e.target.value)} required autoComplete="off" /></div>
             {!mfa?.isAal2 ? <div className="space-y-2"><Label>Código do autenticador</Label><Input inputMode="numeric" maxLength={6} value={mfaCode} onChange={(e) => setMfaCode(e.target.value)} required /></div> : null}
            <div className="sm:col-span-2">
              <Button type="submit" disabled={connectMutation.isPending}>
                 Criar conta de pagamentos
              </Button>
            </div>
          </form>
        )}
      </div>
      </section>


      <section className="surface-panel grid gap-6 p-5 sm:p-6 lg:grid-cols-[260px_1fr]">
        <div>
          <h2 className="font-display text-base font-semibold tracking-tight">Regras financeiras aplicadas</h2>
          <p className="mt-1 text-xs text-muted-foreground">Definidas pela plataforma e aplicadas somente no servidor.</p>
        </div>
        <div className="min-w-0">
        <dl className="grid gap-3 sm:grid-cols-2">
          <Item label="Taxas por pagamento" value="Conforme modalidade e parcelas" />
          <Item label="Prazo de liberação do saldo" value="Conforme forma de pagamento (Pix 1 dia útil, crédito até 32 dias)" />
          <Item label="Valor mínimo de saque" value={formatBRL(workspace?.settings.minimumWithdrawalAmount ?? 0)} />
          <Item label="Taxa de saque" value={formatBRL(workspace?.settings.withdrawalFeeAmount ?? 0)} />
        </dl>
        <p className="mt-4 text-xs text-muted-foreground">
          Estes valores são definidos pela plataforma e aplicados somente no servidor.
        </p>
      </div>
      </section>
    </div>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="numeric-tabular mt-1 font-semibold">{value}</dd>
    </div>
  );
}
