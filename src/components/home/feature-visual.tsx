import {
  BarChart3,
  BellRing,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  Copy,
  CreditCard,
  Eye,
  FileCheck2,
  FileSignature,
  Image,
  Landmark,
  Link2,
  Mail,
  MonitorSmartphone,
  Palette,
  QrCode,
  RefreshCw,
  Send,
  ShieldCheck,
  Smartphone,
  UserRound,
  Users,
  Wallet,
  Workflow,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";

export type FeatureVisualKind =
  | "payments"
  | "recurring"
  | "contracts"
  | "links"
  | "finance"
  | "customers"
  | "crm";

const tr = (value: string) => i18n.t(value, { ns: "ui" }) as string;

const visualVariationClasses = {
  1: "feature-visual-1",
  2: "feature-visual-2",
  3: "feature-visual-3",
} as const;

/** Fundo com demonstração que surge pela borda inferior. `scene` escolhe a tela (1, 2 ou 3) e `variation` o fundo. */
export function FeatureVisual({
  kind,
  label,
  variation = 1,
  scene = 1,
  seamless = false,
}: {
  kind: FeatureVisualKind;
  label: string;
  variation?: number;
  scene?: number;
  seamless?: boolean;
}) {
  return (
    <div
      className={`feature-visual ${visualVariationClasses[variation as keyof typeof visualVariationClasses] ?? visualVariationClasses[1]} ${seamless ? "feature-visual-seamless" : ""} relative isolate h-full min-h-[27rem] overflow-hidden sm:min-h-[30rem] lg:min-h-[32rem]`}
      role="img"
      aria-label={label}>
      {!seamless ? (
        <div
          className="feature-visual-grid absolute inset-0"
          aria-hidden="true"
        />
      ) : null}
      {!seamless ? (
        <div
          className="feature-visual-glow absolute inset-0"
          aria-hidden="true"
        />
      ) : null}
      <div className="absolute inset-x-0 top-0 -bottom-8 z-10 flex justify-center px-3 pt-5 sm:px-5 lg:px-7">
        <div
          className="feature-demo-stage h-full w-full max-w-2xl"
          data-visible="true">
          <FeatureDemo kind={kind} scene={scene} />
        </div>
      </div>
      <div
        className="feature-visual-bottom-fade absolute inset-x-0 bottom-0 z-20 h-20 sm:h-24"
        aria-hidden="true"
      />
    </div>
  );
}

/** Apenas a tela simulada, sem fundo — usada no Hero das páginas de recursos. */
export function FeatureDemo({
  kind,
  scene = 1,
}: {
  kind: FeatureVisualKind;
  scene?: number;
}) {
  useTranslation("ui");
  const list = featureScenes[kind];
  const Scene = list[scene - 1] ?? list[0] ?? PaymentsDemo;
  return <Scene />;
}

const featureScenes: Record<
  FeatureVisualKind,
  Array<() => React.ReactElement>
> = {
  payments: [PaymentsDemo, PaymentsCheckoutDemo, PaymentsReceiptsDemo],
  recurring: [RecurringDemo, RecurringAuthorizationDemo, RecurringCyclesDemo],
  contracts: [ContractsDemo, ContractsEditorDemo, ContractsListDemo],
  links: [LinksDemo, CheckoutBrandEditorDemo, BrandedCheckoutDemo],
  finance: [FinanceDemo, FinanceStatementDemo, FinanceWithdrawDemo],
  customers: [CustomersDemo, CustomersProfileDemo, CustomersHistoryDemo],
  crm: [CrmDemo, CrmPipelineDemo, CrmAutomationDemo],
};

function Window({
  title,
  status,
  children,
}: {
  title: string;
  status: string;
  children: React.ReactNode;
}) {
  return (
    <div className="feature-demo-window h-full w-full overflow-hidden rounded-lg border border-border bg-card shadow-float">
      <div className="flex h-10 items-center gap-2 border-b border-border px-3 sm:px-4">
        <span className="size-2 rounded-full bg-destructive/70" />
        <span className="size-2 rounded-full bg-warning/80" />
        <span className="size-2 rounded-full bg-primary/70" />
        <span className="ml-1 min-w-0 flex-1 truncate text-[10px] font-medium text-muted-foreground sm:text-xs">
          {tr(title)}
        </span>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent px-2 py-1 text-[9px] font-bold uppercase text-primary">
          <span className="size-1.5 rounded-full bg-primary" />
          {tr(status)}
        </span>
      </div>
      {children}
    </div>
  );
}

function PaymentsDemo() {
  const { t: ui } = useTranslation("ui");
  return (
    <Window title={ui("Nova cobrança")} status="Processando">
      <div className="flex h-full flex-col gap-3 p-3 sm:p-4">
        <div className="grid flex-1 gap-3 sm:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-3">
            <DemoField label="Cliente" value="Empresa Horizonte" />
            <DemoField label="Valor da cobrança" value="R$ 2.500,00" strong />
            <div>
              <p className="mb-2 text-[10px] font-medium text-muted-foreground">
                {ui("Formas de pagamento")}
              </p>
              <div className="grid grid-cols-3 gap-1.5">
                <PaymentChoice icon={QrCode} label="Pix" active />
                <PaymentChoice icon={Landmark} label="Boleto" />
                <PaymentChoice icon={CreditCard} label="Cartão" />
              </div>
            </div>
            <div className="feature-demo-action flex items-center justify-center gap-2 rounded-md bg-primary px-3 py-2.5 text-xs font-semibold text-primary-foreground">
              <Send className="size-3.5" />
              {ui("Criar cobrança")}
            </div>
          </div>
          <div className="flex min-h-64 flex-col justify-between rounded-lg border border-border bg-surface p-3 sm:p-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase text-muted-foreground">
                Pague com Pix
              </span>
              <span className="rounded-md bg-accent px-2 py-1 text-[9px] font-semibold text-primary">
                R$ 2.500,00
              </span>
            </div>
            <IllustrativeQr />
            <p className="text-center text-[9px] text-muted-foreground">
              Aponte a câmera do celular
            </p>
            <div className="feature-demo-success flex items-center gap-2 rounded-md border border-primary/30 bg-accent p-2.5 text-xs font-semibold text-primary">
              <CheckCircle2 className="size-4" />
              {ui("Pagamento recebido")}
            </div>
          </div>
        </div>
        <DemoSummary
          items={[
            { icon: ShieldCheck, label: ui("Operação protegida") },
            { icon: Clock3, label: ui("Confirmação automática") },
            { icon: Wallet, label: ui("Saldo atualizado") },
          ]}
        />
      </div>
    </Window>
  );
}

function RecurringDemo() {
  return (
    <Window title="Pix recorrente" status="Autorizado">
      <div className="flex h-full flex-col gap-3 p-3 sm:p-4">
        <div className="grid flex-1 gap-3 sm:grid-cols-[1.05fr_0.95fr]">
          <div className="rounded-lg border border-border bg-surface p-3 sm:p-4">
            <div className="flex items-center gap-3">
              <span className="grid size-9 place-items-center rounded-md bg-accent text-primary">
                <RefreshCw className="feature-demo-spin size-4" />
              </span>
              <div>
                <p className="text-xs font-semibold">Plano Consultoria</p>
                <p className="text-[10px] text-muted-foreground">
                  Cobrança mensal automática
                </p>
              </div>
            </div>
            <div className="mt-5 flex items-end justify-between gap-3">
              <div>
                <p className="text-[10px] text-muted-foreground">
                  Valor mensal
                </p>
                <p className="numeric-tabular text-xl font-semibold">
                  R$ 890,00
                </p>
              </div>
              <span className="rounded-md bg-primary px-2 py-1 text-[10px] font-bold text-primary-foreground">
                ATIVO
              </span>
            </div>
            <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="feature-demo-progress h-full rounded-full bg-primary" />
            </div>
            <p className="mt-2 text-[10px] text-muted-foreground">
              Autorização confirmada pelo banco
            </p>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2 rounded-md border border-border bg-card p-2.5">
              <CalendarDays className="size-4 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] text-muted-foreground">
                  Próxima cobrança
                </p>
                <p className="text-xs font-semibold">12 de outubro</p>
              </div>
            </div>
            {["Setembro", "Agosto", "Julho", "Junho"].map((month, index) => (
              <div
                key={month}
                className="feature-demo-row flex items-center gap-2 rounded-md border border-border bg-card p-2.5"
                style={{ animationDelay: `${index * 180}ms` }}>
                <span className="grid size-7 place-items-center rounded-md bg-accent text-primary">
                  <Check className="size-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium">{month}</p>
                  <p className="text-[10px] text-muted-foreground">
                    Cobrança concluída
                  </p>
                </div>
                <span className="numeric-tabular text-[10px] font-semibold">
                  R$ 890
                </span>
              </div>
            ))}
          </div>
        </div>
        <DemoSummary
          items={[
            { icon: RefreshCw, label: "Ciclo automático" },
            { icon: BellRing, label: "Lembretes ativos" },
            { icon: ShieldCheck, label: "Autorizado pelo banco" },
          ]}
        />
      </div>
    </Window>
  );
}

function ContractsDemo() {
  return (
    <Window title="Contrato e cobrança" status="Concluído">
      <div className="flex h-full flex-col gap-3 p-3 sm:p-4">
        <div className="grid min-h-0 flex-1 gap-3 sm:grid-cols-[1.08fr_0.92fr]">
          <div className="rounded-lg border border-border bg-card p-3 shadow-card sm:p-4">
            <div className="flex items-center gap-2 border-b border-border pb-3">
              <FileSignature className="size-4 shrink-0 text-primary" />
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold">
                  Contrato de prestação
                </p>
                <p className="truncate text-[10px] text-muted-foreground">
                  Cobrança #0248 • R$ 2.500,00
                </p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <MiniInfo label="Cliente" value="Marina Oliveira" />
              <MiniInfo label="Serviço" value="Consultoria B2B" />
            </div>
            <div className="mt-3 space-y-2" aria-hidden="true">
              <div className="h-2 w-2/3 rounded-full bg-foreground/70" />
              <div className="h-1.5 w-full rounded-full bg-muted" />
              <div className="h-1.5 w-11/12 rounded-full bg-muted" />
              <div className="h-1.5 w-4/5 rounded-full bg-muted" />
              <div className="h-1.5 w-full rounded-full bg-muted" />
            </div>
            <div className="mt-3 rounded-md border border-dashed border-primary/50 bg-accent/50 px-3 py-2.5">
              <p className="feature-demo-signature font-display text-base text-primary sm:text-lg">
                Marina Oliveira
              </p>
              <div className="mt-1 flex items-center gap-1 text-[9px] text-muted-foreground">
                <ShieldCheck className="size-3 text-primary" />
                Assinatura digital registrada às 10:18
              </div>
            </div>
          </div>
          <div className="flex min-w-0 flex-col gap-2">
            <div className="rounded-lg border border-border bg-surface p-3">
              <p className="text-[9px] font-semibold uppercase text-muted-foreground">
                Andamento
              </p>
              <div className="mt-2 space-y-2">
                <ContractStep
                  icon={FileCheck2}
                  label="Documento conferido"
                  done
                />
                <ContractStep
                  icon={FileSignature}
                  label="Assinatura registrada"
                  done
                />
                <ContractStep
                  icon={CreditCard}
                  label="Cobrança liberada"
                  done
                />
              </div>
            </div>
            <div className="feature-demo-success flex min-h-12 items-center gap-2 rounded-md border border-primary/30 bg-accent px-3 text-xs font-semibold text-primary">
              <CheckCircle2 className="size-4 shrink-0" />
              <span className="min-w-0">Contrato concluído</span>
            </div>
            <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-[9px] text-muted-foreground">
              <Clock3 className="size-3.5 shrink-0 text-primary" />
              Histórico salvo no cliente
            </div>
          </div>
        </div>
        <DemoSummary
          items={[
            { icon: FileCheck2, label: "Documento validado" },
            { icon: FileSignature, label: "Assinatura registrada" },
            { icon: Link2, label: "Cobrança vinculada" },
          ]}
        />
      </div>
    </Window>
  );
}

function LinksDemo() {
  return (
    <Window title="Link de pagamento" status="Ativo">
      <div className="flex h-full flex-col gap-3 p-3 sm:p-4">
        <div className="flex items-center gap-2 rounded-lg border border-border bg-surface p-2.5">
          <Link2 className="size-4 shrink-0 text-primary" />
          <span className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground">
            wiizepay.com/pagar/consultoria-0248
          </span>
          <Copy className="size-3.5 shrink-0 text-primary" />
        </div>
        <div className="grid min-h-0 flex-1 gap-3 sm:grid-cols-[0.92fr_1.08fr]">
          <div className="flex flex-col rounded-lg border border-border bg-card p-3">
            <div className="flex items-center gap-2">
              <span className="grid size-8 place-items-center rounded-md bg-accent text-primary">
                <UserRound className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold">
                  Empresa Horizonte
                </p>
                <p className="text-[9px] text-muted-foreground">
                  Vence em 14 de outubro
                </p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <MiniInfo label="Valor" value="R$ 2.500" />
              <MiniInfo label="Visualizações" value="3 acessos" />
            </div>
            <p className="mt-3 text-[9px] font-semibold uppercase text-muted-foreground">
              Canais de envio
            </p>
            <div className="mt-2 space-y-2">
              <Channel icon={Smartphone} label="WhatsApp" active />
              <Channel icon={Mail} label="E-mail" />
            </div>
            <div className="feature-demo-action mt-3 flex min-h-10 items-center justify-center gap-2 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground">
              <Send className="size-3.5" />
              Enviar link
            </div>
          </div>
          <div className="flex min-w-0 flex-col rounded-lg border border-border bg-surface p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[9px] font-semibold uppercase text-muted-foreground">
                Atividade
              </p>
              <span className="flex items-center gap-1 text-[9px] text-primary">
                <Eye className="size-3" />
                Acompanhamento ativo
              </span>
            </div>
            <div className="mt-2 space-y-2">
              <TimelineItem
                icon={Send}
                title="Link enviado"
                detail="Hoje, 09:42"
                done
              />
              <TimelineItem
                icon={Eye}
                title="Cliente visualizou"
                detail="Hoje, 10:06"
                done
              />
              <TimelineItem
                icon={BellRing}
                title="Lembrete programado"
                detail="Amanhã, 09:00"
              />
              <TimelineItem
                icon={CheckCircle2}
                title="Aguardando pagamento"
                detail="Confirmação automática"
                highlight
              />
            </div>
          </div>
        </div>
        <DemoSummary
          items={[
            { icon: Smartphone, label: "Envio rápido" },
            { icon: BellRing, label: "Lembretes programados" },
            { icon: CheckCircle2, label: "Status em tempo real" },
          ]}
        />
      </div>
    </Window>
  );
}

function FinanceDemo() {
  const { t: ui } = useTranslation("ui");
  return (
    <Window title={ui("Visão financeira")} status="Atualizado">
      <div className="flex h-full flex-col gap-3 p-3 sm:p-4">
        <div className="balance-hero rounded-lg p-5">
          <div className="flex justify-between">
            <div>
              <p className="text-[10px] opacity-75">Disponível para saque</p>
              <p className="numeric-tabular mt-1 text-2xl font-semibold">
                R$ 12.500,00
              </p>
            </div>
            <Wallet className="size-5" />
          </div>
          <div className="mt-6 flex h-20 items-end gap-2">
            {[42, 64, 51, 78, 62, 90, 73, 100].map((height, index) => (
              <span
                key={index}
                className="payment-bar flex-1 rounded-sm bg-primary-foreground/25"
                style={{
                  height: `${height}%`,
                  animationDelay: `${index * 80}ms`,
                }}
              />
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <DemoField label="A receber" value="R$ 7.800,00" strong />
          <DemoField label="Recebido no mês" value="R$ 24.320,00" strong />
        </div>
        <div className="space-y-2">
          {["Pix recebido", "Cartão aprovado", "Boleto compensado"].map(
            (label, index) => (
              <div
                key={label}
                className="feature-demo-row flex items-center gap-3 rounded-md border border-border bg-surface p-3"
                style={{ animationDelay: `${index * 150}ms` }}>
                <span className="grid size-8 place-items-center rounded-md bg-accent text-primary">
                  <BarChart3 className="size-4" />
                </span>
                <span className="flex-1 text-xs font-medium">{label}</span>
                <span className="numeric-tabular text-xs font-semibold text-primary">
                  + R$ {index === 0 ? "2.500" : index === 1 ? "1.850" : "920"}
                </span>
              </div>
            ),
          )}
        </div>
      </div>
    </Window>
  );
}

function CustomersDemo() {
  const { t: ui } = useTranslation("ui");
  return (
    <Window title={ui("Clientes")} status="Organizado">
      <div className="flex h-full flex-col gap-3 p-3 sm:p-4">
        <div className="flex items-center justify-between rounded-lg border border-border bg-surface p-3">
          <div className="flex items-center gap-2">
            <Users className="size-4 text-primary" />
            <span className="text-xs font-semibold">126 clientes</span>
          </div>
          <span className="rounded-md bg-primary px-2.5 py-1.5 text-[10px] font-semibold text-primary-foreground">
            Novo cliente
          </span>
        </div>
        <div className="grid flex-1 gap-2">
          {[
            ["Empresa Horizonte", "3 cobranças", "R$ 7.500"],
            ["Atlas Consultoria", "Contrato ativo", "R$ 4.200"],
            ["Nexo Digital", "Pagamento pendente", "R$ 1.890"],
            ["Orbe Studio", "Tudo em dia", "R$ 3.100"],
          ].map(([name, status, value], index) => (
            <div
              key={name}
              className="feature-demo-row flex items-center gap-3 rounded-lg border border-border bg-card p-3"
              style={{ animationDelay: `${index * 120}ms` }}>
              <span className="grid size-9 place-items-center rounded-full bg-accent text-primary">
                <UserRound className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold">{name}</p>
                <p className="text-[10px] text-muted-foreground">{status}</p>
              </div>
              <span className="numeric-tabular text-[10px] font-semibold">
                {value}
              </span>
            </div>
          ))}
        </div>
        <DemoSummary
          items={[
            { icon: Users, label: "Base centralizada" },
            { icon: FileSignature, label: "Contratos ligados" },
            { icon: Wallet, label: "Cobranças visíveis" },
          ]}
        />
      </div>
    </Window>
  );
}

function CrmDemo() {
  return (
    <Window title="CRM Wiize + Wiize Recebe" status="Sincronizado">
      <div className="flex h-full flex-col gap-3 p-3 sm:p-4">
        <div className="grid grid-cols-3 gap-2">
          {["Negociação", "Contrato", "Pagamento"].map((label, index) => (
            <div
              key={label}
              className={`rounded-md border p-2 text-center text-[10px] font-semibold ${index === 2 ? "border-primary bg-accent text-primary" : "border-border bg-surface"}`}>
              {label}
            </div>
          ))}
        </div>
        <div className="relative flex flex-1 items-center justify-center">
          <div className="absolute h-px w-3/4 bg-primary/35" />
          <div className="relative grid w-full grid-cols-3 gap-4">
            {[
              { icon: Workflow, label: "CRM Wiize" },
              { icon: FileSignature, label: "Contrato" },
              { icon: Wallet, label: "Wiize Recebe" },
            ].map(({ icon: Icon, label }, index) => (
              <div
                key={label}
                className="feature-demo-row relative grid min-h-28 place-items-center rounded-lg border border-border bg-card p-3 text-center shadow-card"
                style={{ animationDelay: `${index * 180}ms` }}>
                <span className="grid size-10 place-items-center rounded-md bg-accent text-primary">
                  <Icon className="size-5" />
                </span>
                <p className="mt-2 text-xs font-semibold">{label}</p>
                {index < 2 ? (
                  <span
                    className="absolute -right-3 z-10 grid size-6 place-items-center rounded-full bg-primary text-primary-foreground"
                    aria-hidden="true">
                    →
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        </div>
        <div className="feature-demo-success flex items-center gap-2 rounded-md border border-primary/30 bg-accent p-3 text-xs font-semibold text-primary">
          <CheckCircle2 className="size-4" />
          Pagamento atualizado na negociação
        </div>
      </div>
    </Window>
  );
}

function IllustrativeQr() {
  const size = 29;
  const isFinder = (row: number, column: number, top: number, left: number) => {
    const y = row - top;
    const x = column - left;
    if (x < 0 || x > 6 || y < 0 || y > 6) return false;
    return (
      x === 0 ||
      x === 6 ||
      y === 0 ||
      y === 6 ||
      (x >= 2 && x <= 4 && y >= 2 && y <= 4)
    );
  };
  return (
    <div
      className="relative mx-auto size-32 rounded-md bg-[oklch(1_0_0)] p-2 shadow-card"
      aria-hidden="true">
      <div className="grid h-full w-full grid-cols-[repeat(29,minmax(0,1fr))] bg-[oklch(1_0_0)] p-1">
        {Array.from({ length: size * size }, (_, index) => {
          const row = Math.floor(index / size);
          const column = index % size;
          const finder =
            isFinder(row, column, 0, 0) ||
            isFinder(row, column, 0, 22) ||
            isFinder(row, column, 22, 0);
          const dark =
            finder ||
            ((row * 11 + column * 7 + row * column * 3) % 13 < 6 &&
              !(row < 8 && column < 8) &&
              !(row < 8 && column > 20) &&
              !(row > 20 && column < 8));
          return (
            <span
              key={index}
              className={dark ? "bg-[oklch(0.15_0_0)]" : "bg-[oklch(1_0_0)]"}
            />
          );
        })}
      </div>
      <span className="absolute left-1/2 top-1/2 grid size-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-md border-2 border-[oklch(1_0_0)] bg-primary text-primary-foreground">
        <QrCode className="size-4" />
      </span>
    </div>
  );
}

function DemoField({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2">
      <p className="text-[9px] text-muted-foreground">{tr(label)}</p>
      <p
        className={`mt-0.5 truncate text-xs ${strong ? "numeric-tabular font-semibold" : "font-medium"}`}>
        {tr(value)}
      </p>
    </div>
  );
}
function MiniInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-border bg-surface px-2 py-1.5">
      <p className="text-[8px] text-muted-foreground">{tr(label)}</p>
      <p className="truncate text-[10px] font-semibold">{tr(value)}</p>
    </div>
  );
}
function PaymentChoice({
  icon: Icon,
  label,
  active = false,
}: {
  icon: typeof QrCode;
  label: string;
  active?: boolean;
}) {
  return (
    <div
      className={`grid min-h-14 place-items-center gap-1 rounded-md border p-1.5 text-[9px] font-medium ${active ? "border-primary bg-accent text-primary" : "border-border bg-card text-muted-foreground"}`}>
      <Icon className="size-4" />
      {tr(label)}
    </div>
  );
}
function ContractStep({
  icon: Icon,
  label,
  done = false,
}: {
  icon: typeof FileCheck2;
  label: string;
  done?: boolean;
}) {
  return (
    <div
      className={`feature-demo-row flex items-center gap-2 rounded-md border p-2.5 ${done ? "border-primary/30 bg-accent" : "border-border bg-card"}`}>
      <Icon
        className={`size-4 ${done ? "text-primary" : "text-muted-foreground"}`}
      />
      <span className="flex-1 text-[10px] font-medium sm:text-xs">
        {tr(label)}
      </span>
      {done ? (
        <Check className="size-3.5 text-primary" />
      ) : (
        <span className="size-2 rounded-full bg-muted" />
      )}
    </div>
  );
}
function Channel({
  icon: Icon,
  label,
  active = false,
}: {
  icon: typeof Smartphone;
  label: string;
  active?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-2 rounded-md border p-2 text-[10px] font-medium ${active ? "border-primary bg-accent text-primary" : "border-border bg-surface text-muted-foreground"}`}>
      <Icon className="size-3.5" />
      {label}
      {active ? <Check className="ml-auto size-3" /> : null}
    </div>
  );
}
function TimelineItem({
  icon: Icon,
  title,
  detail,
  done = false,
  highlight = false,
}: {
  icon: typeof Send;
  title: string;
  detail: string;
  done?: boolean;
  highlight?: boolean;
}) {
  return (
    <div
      className={`feature-demo-row flex items-center gap-2 rounded-md border p-2.5 ${highlight ? "feature-demo-success border-primary/30 bg-accent" : "border-border bg-card"}`}>
      <span
        className={`grid size-8 shrink-0 place-items-center rounded-md ${done || highlight ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
        <Icon className="size-3.5" />
      </span>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold sm:text-xs">{tr(title)}</p>
        <p className="text-[9px] text-muted-foreground">{tr(detail)}</p>
      </div>
    </div>
  );
}

function DemoSummary({
  items,
}: {
  items: Array<{ icon: typeof ShieldCheck; label: string }>;
}) {
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {items.map(({ icon: Icon, label }) => (
        <div
          key={label}
          className="flex min-h-12 items-center justify-center gap-1.5 rounded-md border border-border bg-card/80 px-2 text-center text-[9px] font-medium text-muted-foreground backdrop-blur-sm sm:text-[10px]">
          <Icon className="size-3.5 shrink-0 text-primary" />
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}
/* ---------- Telas adicionais (uma por seção explicativa) ---------- */

function SummaryLine({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-2 border-b border-border pb-2 text-[10px] last:border-b-0 ${strong ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
      <span className="truncate">{tr(label)}</span>
      <span className="numeric-tabular shrink-0">{tr(value)}</span>
    </div>
  );
}
function StatusPill({
  tone,
  label,
}: {
  tone: "ok" | "wait" | "muted";
  label: string;
}) {
  const cls =
    tone === "ok"
      ? "bg-accent text-primary"
      : tone === "wait"
        ? "bg-warning/15 text-warning"
        : "bg-muted text-muted-foreground";
  return (
    <span
      className={`shrink-0 rounded-md px-2 py-1 text-[9px] font-bold uppercase ${cls}`}>
      {tr(label)}
    </span>
  );
}
function ListRow({
  icon: Icon,
  title,
  detail,
  value,
  tone,
  label,
  index = 0,
}: {
  icon: typeof QrCode;
  title: string;
  detail: string;
  value?: string;
  tone: "ok" | "wait" | "muted";
  label: string;
  index?: number;
}) {
  return (
    <div
      className="feature-demo-row flex items-center gap-3 rounded-lg border border-border bg-card p-2.5 sm:p-3"
      style={{ animationDelay: `${index * 140}ms` }}>
      <span className="grid size-8 shrink-0 place-items-center rounded-md bg-accent text-primary">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold">{tr(title)}</p>
        <p className="truncate text-[10px] text-muted-foreground">
          {tr(detail)}
        </p>
      </div>
      {value ? (
        <span className="numeric-tabular hidden shrink-0 text-[11px] font-semibold sm:block">
          {value}
        </span>
      ) : null}
      <StatusPill tone={tone} label={label} />
    </div>
  );
}
function Toggle({ on }: { on: boolean }) {
  return (
    <span
      className={`relative inline-flex h-4 w-7 shrink-0 rounded-full transition-colors ${on ? "bg-primary" : "bg-muted"}`}>
      <span
        className={`absolute top-0.5 size-3 rounded-full bg-background shadow-card ${on ? "right-0.5" : "left-0.5"}`}
      />
    </span>
  );
}
function ToggleRow({
  icon: Icon,
  title,
  detail,
  on,
  index = 0,
}: {
  icon: typeof QrCode;
  title: string;
  detail: string;
  on: boolean;
  index?: number;
}) {
  return (
    <div
      className="feature-demo-row flex items-center gap-3 rounded-lg border border-border bg-card p-2.5 sm:p-3"
      style={{ animationDelay: `${index * 140}ms` }}>
      <span
        className={`grid size-8 shrink-0 place-items-center rounded-md ${on ? "bg-accent text-primary" : "bg-muted text-muted-foreground"}`}>
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold">{tr(title)}</p>
        <p className="truncate text-[10px] text-muted-foreground">
          {tr(detail)}
        </p>
      </div>
      <Toggle on={on} />
    </div>
  );
}
function PrimaryAction({
  icon: Icon,
  label,
}: {
  icon: typeof QrCode;
  label: string;
}) {
  return (
    <div className="feature-demo-action flex min-h-10 items-center justify-center gap-2 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground">
      <Icon className="size-3.5" />
      {tr(label)}
    </div>
  );
}
function SuccessBar({ label }: { label: string }) {
  return (
    <div className="feature-demo-success flex items-center gap-2 rounded-md border border-primary/30 bg-accent p-2.5 text-xs font-semibold text-primary">
      <CheckCircle2 className="size-4 shrink-0" />
      {tr(label)}
    </div>
  );
}

function PaymentsCheckoutDemo() {
  return (
    <Window title="Página de pagamento do cliente" status="Seguro">
      <div className="flex h-full flex-col gap-3 p-3 sm:p-4">
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface p-3">
          <div className="min-w-0">
            <p className="truncate text-[10px] text-muted-foreground">
              Consultoria B2B • Empresa Horizonte
            </p>
            <p className="numeric-tabular mt-0.5 text-xl font-semibold">
              R$ 2.500,00
            </p>
          </div>
          <StatusPill tone="ok" label="Vence 14/10" />
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          <PaymentChoice icon={QrCode} label="Pix" />
          <PaymentChoice icon={Landmark} label="Boleto" />
          <PaymentChoice icon={CreditCard} label="Cartão" active />
        </div>
        <div className="grid flex-1 gap-3 sm:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-2 rounded-lg border border-border bg-card p-3">
            <DemoField label="Número do cartão" value="•••• •••• •••• 4821" />
            <div className="grid grid-cols-2 gap-2">
              <DemoField label="Validade" value="08/29" />
              <DemoField label="Titular" value="M. Oliveira" />
            </div>
            <DemoField label="Parcelamento" value="3x de R$ 833,33" strong />
            <PrimaryAction icon={ShieldCheck} label="Pagar R$ 2.500,00" />
          </div>
          <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3">
            <p className="text-[9px] font-semibold uppercase text-muted-foreground">
              Resumo
            </p>
            <SummaryLine label="Serviço" value="Consultoria" />
            <SummaryLine label="Parcelas" value="3x" />
            <SummaryLine label="Total" value="R$ 2.500,00" strong />
            <div className="mt-auto">
              <SuccessBar label="Cartão aprovado" />
            </div>
          </div>
        </div>
      </div>
    </Window>
  );
}

function PaymentsReceiptsDemo() {
  return (
    <Window title="Recebimentos do dia" status="Hoje">
      <div className="flex h-full flex-col gap-3 p-3 sm:p-4">
        <div className="grid grid-cols-3 gap-2">
          <DemoField label="Recebido" value="R$ 5.270,00" strong />
          <DemoField label="Aguardando" value="R$ 640,00" strong />
          <DemoField label="Cobranças" value="4 hoje" strong />
        </div>
        <div className="space-y-2">
          <ListRow
            index={0}
            icon={QrCode}
            title="Pix • Empresa Horizonte"
            detail="Confirmado às 10:12"
            value="R$ 2.500,00"
            tone="ok"
            label="Pago"
          />
          <ListRow
            index={1}
            icon={CreditCard}
            title="Cartão 3x • Atlas Consultoria"
            detail="Aprovado às 11:40"
            value="R$ 1.850,00"
            tone="ok"
            label="Pago"
          />
          <ListRow
            index={2}
            icon={Landmark}
            title="Boleto • Nexo Digital"
            detail="Compensado às 13:05"
            value="R$ 920,00"
            tone="ok"
            label="Pago"
          />
          <ListRow
            index={3}
            icon={Clock3}
            title="Pix • Orbe Studio"
            detail="Link enviado às 14:20"
            value="R$ 640,00"
            tone="wait"
            label="Aberto"
          />
        </div>
        <div className="rounded-lg border border-border bg-surface p-3">
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-muted-foreground">Meta do dia</span>
            <span className="font-semibold text-primary">89%</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="feature-demo-progress h-full rounded-full bg-primary" />
          </div>
        </div>
      </div>
    </Window>
  );
}

function RecurringAuthorizationDemo() {
  const { t: ui } = useTranslation("ui");
  return (
    <Window title="Autorização pelo banco" status="Aguardando">
      <div className="flex h-full flex-col gap-3 p-3 sm:p-4">
        <div className="grid flex-1 gap-3 sm:grid-cols-[0.9fr_1.1fr]">
          <div className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-3">
            <div className="flex items-center gap-2">
              <span className="grid size-8 place-items-center rounded-md bg-accent text-primary">
                <Landmark className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="text-[10px] text-muted-foreground">
                  App do seu banco
                </p>
                <p className="truncate text-xs font-semibold">
                  {ui("Pix Automático")}
                </p>
              </div>
            </div>
            <MiniInfo label="Recebedor" value="Empresa Horizonte" />
            <div className="grid grid-cols-2 gap-2">
              <MiniInfo label="Valor" value="R$ 890,00" />
              <MiniInfo label="Frequência" value="Mensal" />
            </div>
            <MiniInfo label="Primeira cobrança" value="12 de outubro" />
            <div className="mt-auto grid gap-2">
              <PrimaryAction icon={ShieldCheck} label="Autorizar" />
              <div className="flex min-h-9 items-center justify-center rounded-md border border-border text-[11px] font-medium text-muted-foreground">
                Agora não
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <TimelineItem
              icon={Send}
              title="Link de autorização enviado"
              detail="Hoje, 09:12"
              done
            />
            <TimelineItem
              icon={Eye}
              title="Cliente abriu no banco"
              detail="Hoje, 09:15"
              done
            />
            <TimelineItem
              icon={ShieldCheck}
              title="Confirmação do cliente"
              detail="Direto no app do banco"
              highlight
            />
            <TimelineItem
              icon={RefreshCw}
              title="Primeiro ciclo"
              detail="12 de outubro"
            />
          </div>
        </div>
        <DemoSummary
          items={[
            { icon: Landmark, label: "Feito no banco" },
            { icon: ShieldCheck, label: "Uma autorização" },
            { icon: RefreshCw, label: "Ciclos seguintes" },
          ]}
        />
      </div>
    </Window>
  );
}

function RecurringCyclesDemo() {
  const months = [
    "Jan",
    "Fev",
    "Mar",
    "Abr",
    "Mai",
    "Jun",
    "Jul",
    "Ago",
    "Set",
    "Out",
    "Nov",
    "Dez",
  ];
  return (
    <Window title="Ciclos da recorrência" status="Em dia">
      <div className="flex h-full flex-col gap-3 p-3 sm:p-4">
        <div className="grid grid-cols-3 gap-2">
          <DemoField label="Ciclos pagos" value="9 de 12" strong />
          <DemoField label="Valor mensal" value="R$ 890,00" strong />
          <DemoField label="Próximo" value="12/10" strong />
        </div>
        <div className="grid grid-cols-4 gap-2">
          {months.map((month, index) => {
            const paid = index < 9;
            const next = index === 9;
            return (
              <div
                key={month}
                className={`feature-demo-row flex flex-col items-center gap-1.5 rounded-lg border p-2.5 text-center ${paid ? "border-primary/30 bg-accent" : next ? "border-primary bg-card" : "border-border bg-card"}`}
                style={{ animationDelay: `${index * 60}ms` }}>
                <span className="text-[10px] font-semibold">{month}</span>
                {paid ? (
                  <Check className="size-3.5 text-primary" />
                ) : next ? (
                  <CalendarDays className="size-3.5 text-primary" />
                ) : (
                  <span className="size-3.5 rounded-full border border-border" />
                )}
                <span className="text-[8px] text-muted-foreground">
                  {paid ? "Pago" : next ? "Agendado" : "Futuro"}
                </span>
              </div>
            );
          })}
        </div>
        <div className="rounded-lg border border-border bg-surface p-3">
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-muted-foreground">Andamento do contrato</span>
            <span className="font-semibold text-primary">75%</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="feature-demo-progress h-full rounded-full bg-primary" />
          </div>
        </div>
      </div>
    </Window>
  );
}

function ContractsEditorDemo() {
  return (
    <Window title="Novo contrato" status="Rascunho">
      <div className="flex h-full flex-col gap-3 p-3 sm:p-4">
        <div className="grid flex-1 gap-3 sm:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-2">
            <DemoField label="Modelo" value="Prestação de serviços" />
            <DemoField label="Cliente" value="Atlas Consultoria" />
            <div className="grid grid-cols-2 gap-2">
              <DemoField label="Valor" value="R$ 4.200,00" strong />
              <DemoField label="Vigência" value="12 meses" />
            </div>
            <DemoField label="Cobrança" value="Mensal • Pix ou cartão" />
          </div>
          <div className="flex flex-col rounded-lg border border-border bg-card p-3 shadow-card">
            <div className="flex items-center gap-2 border-b border-border pb-2">
              <FileSignature className="size-4 text-primary" />
              <p className="text-xs font-semibold">Cláusulas do contrato</p>
            </div>
            <div className="mt-2 space-y-2">
              {[
                "Objeto do serviço",
                "Valor e forma de pagamento",
                "Prazo e vigência",
                "Cancelamento e rescisão",
              ].map((item, index) => (
                <div
                  key={item}
                  className="feature-demo-row flex items-center gap-2 rounded-md border border-border bg-surface p-2"
                  style={{ animationDelay: `${index * 140}ms` }}>
                  <span className="grid size-5 place-items-center rounded bg-primary text-primary-foreground">
                    <Check className="size-3" />
                  </span>
                  <span className="truncate text-[10px] font-medium sm:text-xs">
                    {item}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-auto pt-3">
              <PrimaryAction icon={Link2} label="Gerar link de assinatura" />
            </div>
          </div>
        </div>
        <DemoSummary
          items={[
            { icon: FileCheck2, label: "Modelo pronto" },
            { icon: Users, label: "Dados do cliente" },
            { icon: CreditCard, label: "Cobrança junto" },
          ]}
        />
      </div>
    </Window>
  );
}

function ContractsListDemo() {
  const { t: ui } = useTranslation("ui");
  return (
    <Window title={ui("Contratos")} status="3 ativos">
      <div className="flex h-full flex-col gap-3 p-3 sm:p-4">
        <div className="grid grid-cols-3 gap-2">
          <DemoField label="Assinados" value="18" strong />
          <DemoField label="Aguardando" value="3" strong />
          <DemoField label="Enviados hoje" value="2" strong />
        </div>
        <div className="space-y-2">
          <ListRow
            index={0}
            icon={FileSignature}
            title="Atlas Consultoria"
            detail="Assinado em 22/09 • R$ 4.200"
            tone="ok"
            label="Assinado"
          />
          <ListRow
            index={1}
            icon={Eye}
            title="Empresa Horizonte"
            detail="Visualizado há 5 min"
            tone="wait"
            label="Lendo"
          />
          <ListRow
            index={2}
            icon={Send}
            title="Nexo Digital"
            detail="Enviado hoje, 08:40"
            tone="wait"
            label="Enviado"
          />
          <ListRow
            index={3}
            icon={FileSignature}
            title="Orbe Studio"
            detail="Assinado em 18/09 • R$ 3.100"
            tone="ok"
            label="Assinado"
          />
        </div>
        <SuccessBar label="Cobrança liberada após a assinatura" />
      </div>
    </Window>
  );
}

function CheckoutBrandEditorDemo() {
  return (
    <Window title="Aparência do checkout" status="Prévia ao vivo">
      <div className="grid h-full gap-3 p-3 sm:grid-cols-[0.86fr_1.14fr] sm:p-4">
        <div className="flex flex-col gap-2">
          <div className="rounded-lg border border-border bg-surface p-3">
            <div className="flex items-center gap-2">
              <span className="grid size-9 shrink-0 place-items-center rounded-md bg-accent text-primary">
                <Image className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="text-[9px] text-muted-foreground">
                  Logo da empresa
                </p>
                <p className="truncate text-xs font-semibold">
                  Empresa Horizonte
                </p>
              </div>
              <StatusPill tone="ok" label="Enviada" />
            </div>
          </div>
          <div className="rounded-lg border border-border bg-card p-3">
            <div className="flex items-center gap-2">
              <Palette className="size-4 text-primary" />
              <p className="text-xs font-semibold">Cores da marca</p>
            </div>
            <div className="mt-3 grid grid-cols-4 gap-2" aria-hidden="true">
              <span className="aspect-square rounded-md bg-primary ring-2 ring-primary ring-offset-2 ring-offset-card" />
              <span className="aspect-square rounded-md bg-accent" />
              <span className="aspect-square rounded-md bg-foreground" />
              <span className="aspect-square rounded-md bg-muted" />
            </div>
          </div>
          <div className="rounded-lg border border-border bg-card p-3">
            <p className="text-[9px] font-semibold uppercase text-muted-foreground">
              Tema
            </p>
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              <span className="rounded-md border border-primary bg-accent px-2 py-2 text-center text-[9px] font-semibold text-primary">
                Clean
              </span>
              <span className="rounded-md border border-border bg-surface px-2 py-2 text-center text-[9px] text-muted-foreground">
                Wiize Recebe
              </span>
              <span className="rounded-md border border-border bg-foreground px-2 py-2 text-center text-[9px] text-background">
                Escuro
              </span>
            </div>
          </div>
          <PrimaryAction icon={Eye} label="Salvar nova aparência" />
        </div>
        <div className="flex min-w-0 flex-col rounded-lg border border-border bg-surface p-3">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MonitorSmartphone className="size-4 text-primary" />
              <p className="text-xs font-semibold">Prévia do cliente</p>
            </div>
            <StatusPill tone="ok" label="Desktop" />
          </div>
          <div className="flex flex-1 flex-col rounded-lg border border-border bg-card p-3 shadow-card">
            <div className="flex items-center gap-2 border-b border-border pb-3">
              <span className="grid size-8 place-items-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
                EH
              </span>
              <div>
                <p className="text-xs font-semibold">Empresa Horizonte</p>
                <p className="text-[9px] text-muted-foreground">
                  Pagamento seguro
                </p>
              </div>
            </div>
            <p className="mt-4 text-[9px] text-muted-foreground">
              Consultoria B2B
            </p>
            <p className="numeric-tabular mt-1 text-xl font-semibold">
              R$ 2.500,00
            </p>
            <div className="mt-4 grid grid-cols-3 gap-1.5">
              <PaymentChoice icon={QrCode} label="Pix" active />
              <PaymentChoice icon={Landmark} label="Boleto" />
              <PaymentChoice icon={CreditCard} label="Cartão" />
            </div>
            <div className="mt-auto">
              <PrimaryAction icon={ShieldCheck} label="Continuar pagamento" />
            </div>
          </div>
        </div>
      </div>
    </Window>
  );
}

function BrandedCheckoutDemo() {
  return (
    <Window title="Checkout da Empresa Horizonte" status="Seguro">
      <div className="flex h-full flex-col gap-3 p-3 sm:p-4">
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3 shadow-card">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
              EH
            </span>
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold">
                Empresa Horizonte
              </p>
              <p className="truncate text-[9px] text-muted-foreground">
                Atendimento • financeiro@horizonte.com.br
              </p>
            </div>
          </div>
          <span className="hidden items-center gap-1 text-[9px] font-medium text-primary sm:flex">
            <ShieldCheck className="size-3.5" />
            Ambiente protegido
          </span>
        </div>
        <div className="grid min-h-0 flex-1 gap-3 sm:grid-cols-[1.04fr_0.96fr]">
          <div className="flex flex-col rounded-lg border border-border bg-surface p-3">
            <p className="text-[9px] text-muted-foreground">Pagamento de</p>
            <p className="text-xs font-semibold">Consultoria B2B</p>
            <p className="numeric-tabular mt-2 text-2xl font-semibold">
              R$ 2.500,00
            </p>
            <div className="mt-4 grid grid-cols-3 gap-1.5">
              <PaymentChoice icon={QrCode} label="Pix" active />
              <PaymentChoice icon={Landmark} label="Boleto" />
              <PaymentChoice icon={CreditCard} label="Cartão" />
            </div>
            <div className="mt-3 rounded-md border border-primary/30 bg-accent p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[9px] text-muted-foreground">
                    Pix copia e cola
                  </p>
                  <p className="mt-0.5 text-[10px] font-semibold text-primary">
                    Código pronto para pagamento
                  </p>
                </div>
                <Copy className="size-4 text-primary" />
              </div>
            </div>
            <div className="mt-auto">
              <PrimaryAction icon={QrCode} label="Gerar Pix" />
            </div>
          </div>
          <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
            <p className="text-[9px] font-semibold uppercase text-muted-foreground">
              Resumo da cobrança
            </p>
            <SummaryLine label="Valor original" value="R$ 2.500,00" />
            <SummaryLine label="Vencimento" value="14/10/2026" />
            <SummaryLine label="Encargos" value="R$ 0,00" />
            <SummaryLine label="Total a pagar" value="R$ 2.500,00" strong />
            <div className="mt-auto rounded-md border border-border bg-surface p-2.5">
              <div className="flex items-center gap-2 text-[9px] text-muted-foreground">
                <ShieldCheck className="size-3.5 shrink-0 text-primary" />
                <span>Seus dados são protegidos durante o pagamento.</span>
              </div>
            </div>
          </div>
        </div>
        <DemoSummary
          items={[
            { icon: Image, label: "Marca reconhecível" },
            { icon: Palette, label: "Cores personalizadas" },
            { icon: ShieldCheck, label: "Pagamento protegido" },
          ]}
        />
      </div>
    </Window>
  );
}

function FinanceStatementDemo() {
  const rows: Array<[typeof QrCode, string, string, string, boolean]> = [
    [QrCode, "Pix • Empresa Horizonte", "22/09", "+ R$ 2.500,00", true],
    [BarChart3, "Taxa da cobrança", "22/09", "- R$ 24,75", false],
    [CreditCard, "Cartão • Atlas Consultoria", "21/09", "+ R$ 1.850,00", true],
    [Send, "Saque via Pix", "20/09", "- R$ 3.000,00", false],
    [Wallet, "Taxa de saque", "20/09", "- R$ 5,00", false],
    [Landmark, "Boleto • Nexo Digital", "19/09", "+ R$ 920,00", true],
  ];
  return (
    <Window title="Extrato" status="Setembro">
      <div className="flex h-full flex-col gap-3 p-3 sm:p-4">
        <div className="grid grid-cols-2 gap-2">
          <DemoField label="Entradas no mês" value="+ R$ 24.320,00" strong />
          <DemoField label="Saídas no mês" value="- R$ 3.029,75" strong />
        </div>
        <div className="space-y-1.5">
          {rows.map(([Icon, label, date, value, positive], index) => (
            <div
              key={label}
              className="feature-demo-row flex items-center gap-3 rounded-md border border-border bg-card p-2.5"
              style={{ animationDelay: `${index * 110}ms` }}>
              <span
                className={`grid size-7 shrink-0 place-items-center rounded-md ${positive ? "bg-accent text-primary" : "bg-muted text-muted-foreground"}`}>
                <Icon className="size-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium">{label}</p>
                <p className="text-[9px] text-muted-foreground">{date}</p>
              </div>
              <span
                className={`numeric-tabular shrink-0 text-[11px] font-semibold ${positive ? "text-primary" : "text-muted-foreground"}`}>
                {value}
              </span>
            </div>
          ))}
        </div>
      </div>
    </Window>
  );
}

function FinanceWithdrawDemo() {
  return (
    <Window title="Solicitar saque" status="Via Pix">
      <div className="flex h-full flex-col gap-3 p-3 sm:p-4">
        <div className="balance-hero rounded-lg p-4">
          <p className="text-[10px] opacity-75">Disponível para saque</p>
          <p className="numeric-tabular mt-1 text-2xl font-semibold">
            R$ 12.500,00
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <DemoField label="Valor do saque" value="R$ 3.000,00" strong />
            <DemoField label="Chave Pix" value="financeiro@empresa.com.br" />
            <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-accent px-3 py-2 text-[10px] font-semibold text-primary">
              <QrCode className="size-3.5" />
              Pix recomendado • mais rápido
            </div>
            <PrimaryAction icon={Send} label="Solicitar saque" />
          </div>
          <div className="space-y-2">
            <TimelineItem
              icon={Send}
              title="Solicitação registrada"
              detail="Saldo conferido"
              done
            />
            <TimelineItem
              icon={ShieldCheck}
              title="Análise da equipe"
              detail="Aprovação protegida"
              done
            />
            <TimelineItem
              icon={CheckCircle2}
              title="Pix enviado"
              detail="Para a conta cadastrada"
              highlight
            />
          </div>
        </div>
      </div>
    </Window>
  );
}

function CustomersProfileDemo() {
  const { t: ui } = useTranslation("ui");
  return (
    <Window title="Perfil do cliente" status="Em dia">
      <div className="flex h-full flex-col gap-3 p-3 sm:p-4">
        <div className="flex items-center gap-3 rounded-lg border border-border bg-surface p-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-primary font-display text-sm font-semibold text-primary-foreground">
            EH
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">Empresa Horizonte</p>
            <p className="text-[10px] text-muted-foreground">
              CNPJ 12.345.***/0001-**
            </p>
          </div>
          <StatusPill tone="ok" label="Ativo" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <MiniInfo label="E-mail" value="contato@horizonte.com.br" />
          <MiniInfo label="Telefone" value="(11) 9****-4321" />
          <MiniInfo label="Cidade" value="São Paulo • SP" />
          <MiniInfo label="Cliente desde" value="Março de 2026" />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <DemoField label="Total pago" value="R$ 7.500" strong />
          <DemoField label="Em aberto" value="R$ 2.500" strong />
          <DemoField label="Contratos" value="2 ativos" strong />
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {[
            [ui("Cobranças"), Wallet],
            [ui("Contratos"), FileSignature],
            ["Histórico", Clock3],
          ].map(([label, Icon], index) => {
            const I = Icon as typeof Wallet;
            return (
              <div
                key={label as string}
                className={`flex min-h-10 items-center justify-center gap-1.5 rounded-md border text-[10px] font-medium ${index === 0 ? "border-primary bg-accent text-primary" : "border-border bg-card text-muted-foreground"}`}>
                <I className="size-3.5" />
                {label as string}
              </div>
            );
          })}
        </div>
        <SuccessBar label="Dados completos para cobrar" />
      </div>
    </Window>
  );
}

function CustomersHistoryDemo() {
  const { t: ui } = useTranslation("ui");
  return (
    <Window title="Histórico do cliente" status="12 atividades">
      <div className="flex h-full flex-col gap-3 p-3 sm:p-4">
        <div className="flex items-center gap-2 rounded-lg border border-border bg-surface p-2.5">
          <UserRound className="size-4 text-primary" />
          <span className="flex-1 truncate text-xs font-semibold">
            Atlas Consultoria
          </span>
          <span className="text-[10px] text-muted-foreground">
            {ui("Últimos 30 dias")}
          </span>
        </div>
        <div className="relative space-y-2 pl-4 before:absolute before:bottom-3 before:left-1.5 before:top-3 before:w-px before:bg-primary/30">
          <TimelineItem
            icon={FileSignature}
            title="Contrato assinado"
            detail="18/09 • 14:22"
            done
          />
          <TimelineItem
            icon={Send}
            title="Cobrança enviada por link"
            detail="20/09 • 09:00"
            done
          />
          <TimelineItem
            icon={BellRing}
            title="Lembrete entregue"
            detail="21/09 • 09:00"
            done
          />
          <TimelineItem
            icon={CheckCircle2}
            title={ui("Pagamento recebido")}
            detail="22/09 • 10:12 • R$ 4.200,00"
            highlight
          />
          <TimelineItem
            icon={CalendarDays}
            title="Próxima cobrança"
            detail="22/10"
          />
        </div>
      </div>
    </Window>
  );
}

function CrmPipelineDemo() {
  const columns: Array<[string, Array<[string, string, boolean?]>]> = [
    [
      "Proposta",
      [
        ["Nexo Digital", "R$ 1.890"],
        ["Lumen Tech", "R$ 3.400"],
      ],
    ],
    [
      "Negociação",
      [
        ["Orbe Studio", "R$ 3.100"],
        ["Vale Serviços", "R$ 2.250"],
      ],
    ],
    ["Ganho", [["Atlas Consultoria", "R$ 4.200", true]]],
  ];
  return (
    <Window title="Funil no CRM Wiize" status="Ao vivo">
      <div className="flex h-full flex-col gap-3 p-3 sm:p-4">
        <div className="grid flex-1 grid-cols-3 gap-2">
          {columns.map(([title, deals], columnIndex) => (
            <div
              key={title}
              className={`flex flex-col gap-2 rounded-lg border p-2 ${columnIndex === 2 ? "border-primary/40 bg-accent/40" : "border-border bg-surface"}`}>
              <div className="flex items-center justify-between px-1">
                <p className="truncate text-[10px] font-semibold uppercase text-muted-foreground">
                  {title}
                </p>
                <span className="text-[9px] font-semibold text-primary">
                  {deals.length}
                </span>
              </div>
              {deals.map(([name, value, won], index) => (
                <div
                  key={name}
                  className="feature-demo-row rounded-md border border-border bg-card p-2 shadow-card"
                  style={{
                    animationDelay: `${(columnIndex * 2 + index) * 120}ms`,
                  }}>
                  <p className="truncate text-[10px] font-semibold sm:text-xs">
                    {name}
                  </p>
                  <p className="numeric-tabular mt-0.5 text-[10px] text-muted-foreground">
                    {value}
                  </p>
                  {won ? (
                    <span className="mt-2 inline-flex items-center gap-1 rounded bg-primary px-1.5 py-0.5 text-[8px] font-bold uppercase text-primary-foreground">
                      <Wallet className="size-2.5" />
                      Cobrança gerada
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          ))}
        </div>
        <SuccessBar label="Negócio ganho vira cobrança na Wiize Recebe" />
      </div>
    </Window>
  );
}

function CrmAutomationDemo() {
  return (
    <Window title="Automação da integração" status="Ativa">
      <div className="flex h-full flex-col gap-3 p-3 sm:p-4">
        <div className="space-y-2">
          <ToggleRow
            index={0}
            icon={Wallet}
            title="Criar cobrança ao ganhar negócio"
            detail="Valor e cliente vêm do CRM"
            on
          />
          <ToggleRow
            index={1}
            icon={FileSignature}
            title="Enviar contrato para assinatura"
            detail="Junto com o link de pagamento"
            on
          />
          <ToggleRow
            index={2}
            icon={Workflow}
            title="Atualizar etapa após pagamento"
            detail="Negociação marcada como paga"
            on
          />
          <ToggleRow
            index={3}
            icon={BellRing}
            title="Avisar o vendedor"
            detail="Notificação no CRM Wiize"
            on={false}
          />
        </div>
        <div className="rounded-lg border border-border bg-surface p-3">
          <p className="text-[9px] font-semibold uppercase text-muted-foreground">
            Últimas sincronizações
          </p>
          <div className="mt-2 space-y-2">
            <TimelineItem
              icon={RefreshCw}
              title="Atlas Consultoria sincronizado"
              detail="há 2 min"
              done
            />
            <TimelineItem
              icon={CheckCircle2}
              title="Pagamento refletido no CRM"
              detail="há 1 min"
              highlight
            />
          </div>
        </div>
      </div>
    </Window>
  );
}
