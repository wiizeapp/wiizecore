import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Fingerprint, Lock, ShieldCheck } from "lucide-react";
import { Brand } from "@/components/brand";

const POINTS = [
  { icon: ShieldCheck, title: "Autenticidade", text: "Confirma se o contrato foi emitido e assinado pela Wiize Core." },
  { icon: Fingerprint, title: "Integridade", text: "Qualquer alteração no PDF muda a impressão digital do arquivo." },
  { icon: Lock, title: "Privacidade", text: "O arquivo enviado não sai do seu aparelho." },
];

export function VerifyLayout({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="border-b border-border bg-card/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
          <Link to="/" aria-label="Wiize Core"><Brand /></Link>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <ShieldCheck className="h-3.5 w-3.5" /> Verificação oficial
          </span>
        </div>
      </header>

      <section className="relative overflow-hidden border-b border-border bg-gradient-to-b from-primary/10 to-transparent">
        <div className="mx-auto max-w-5xl px-4 py-12 md:py-16">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-primary">Wiize Core Contratos</p>
          <h1 className="font-display text-3xl font-bold tracking-tight md:text-4xl">{title}</h1>
          <p className="mt-3 max-w-2xl text-muted-foreground">{subtitle}</p>
        </div>
      </section>

      <main className="mx-auto grid w-full max-w-5xl flex-1 gap-8 px-4 py-10 lg:grid-cols-[1fr_280px]">
        <div>{children}</div>
        <aside className="space-y-3">
          {POINTS.map(({ icon: Icon, title: t, text }) => (
            <div key={t} className="surface-panel flex gap-3 p-4">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Icon className="h-4.5 w-4.5" /></span>
              <div><p className="text-sm font-semibold">{t}</p><p className="text-xs text-muted-foreground">{text}</p></div>
            </div>
          ))}
          <p className="px-1 text-xs text-muted-foreground">Assinaturas eletrônicas registradas com data, hora, IP e impressão digital do documento, conforme a MP 2.200-2/2001 e a Lei 14.063/2020.</p>
        </aside>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-6 text-xs text-muted-foreground">
          <span>© {new Date().getFullYear()} Wiize Core</span>
          <Link to="/verificar" className="hover:text-foreground">Verificar outro contrato</Link>
        </div>
      </footer>
    </div>
  );
}
