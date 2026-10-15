import { Link } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

const LABELS: [keyof Steps, string][] = [
  ["company", "Empresa"],
  ["municipality", "Município"],
  ["fiscal", "Configuração fiscal"],
  ["service", "Serviço"],
  ["issuance", "Emissão"],
];
type Steps = { company: boolean; municipality: boolean; fiscal: boolean; service: boolean; issuance: boolean };

export function FiscalOnboarding({ steps, done }: { steps: Steps; done: number }) {
  return (
    <section className="surface-panel mb-6 p-5 sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="font-display text-base font-semibold tracking-tight">Configure suas notas fiscais</h2>
          <p className="mt-1 text-xs text-muted-foreground">Vamos configurar sua empresa para emitir NFS-e pelo Wiize Recebe.</p>
        </div>
        <Button asChild><Link to="/notas-fiscais/configuracoes">Começar configuração</Link></Button>
      </div>
      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between text-xs"><span className="text-muted-foreground">{done} de 5 etapas concluídas</span><span className="font-semibold text-primary">{done * 20}%</span></div>
        <Progress value={done * 20} />
      </div>
      <ol className="mt-4 grid gap-2 sm:grid-cols-5">
        {LABELS.map(([k, l]) => (
          <li key={k} className="flex items-center gap-2 text-xs">
            <span className={`grid h-5 w-5 place-items-center rounded-full ${steps[k] ? "bg-primary text-primary-foreground" : "border border-border"}`}>{steps[k] ? <Check className="h-3 w-3" /> : null}</span>
            <span className={steps[k] ? "text-foreground" : "text-muted-foreground"}>{l}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
