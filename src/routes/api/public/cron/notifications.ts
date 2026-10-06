import { createFileRoute } from "@tanstack/react-router";

/**
 * Rotina diária: lembra cobranças em atraso (1, 3 e 7 dias) e contratos com link perto de vencer.
 * Protegida pela senha das tarefas automáticas; cada aviso é enviado uma única vez.
 */
async function run(request: Request) {
  const { authenticateWiizePayCron } = await import("@/lib/cron-auth.server");
  const denied = authenticateWiizePayCron(request);
  if (denied) return denied;
  const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
  const { notifyTenant, emailPerson, brl, tenantName } = await import("@/lib/notify.server");
  const day = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
  let sent = 0;

  for (const d of [1, 3, 7]) {
    const { data: rows } = await admin.from("payments")
      .select("id, tenant_id, gross_amount, due_on, invoice_url, customers(name, email)")
      .eq("status", "overdue").eq("due_on", day(d)).limit(500);
    for (const p of rows ?? []) {
      const c = p.customers as { name?: string | null; email?: string | null } | null;
      if (d === 1) await notifyTenant(admin, {
        tenantId: p.tenant_id, kind: "payment.overdue", dedupeKey: `payment.overdue:${p.id}`, link: "/cobrancas",
        title: "Cobrança em atraso", body: `A cobrança de ${c?.name ?? "cliente"} (${brl(p.gross_amount)}) está em atraso.`,
        email: { subject: `Cobrança em atraso — ${c?.name ?? "cliente"}` },
      });
      if (c?.email && p.invoice_url) {
        const company = await tenantName(admin, p.tenant_id);
        await emailPerson(admin, {
          tenantId: p.tenant_id, kind: "payment.overdue_reminder", dedupeKey: `payment.overdue_reminder:${p.id}:d${d}`,
          email: { to: c.email, subject: `Lembrete de pagamento — ${company}`, title: "Lembrete de pagamento pendente",
            intro: `Olá, ${c.name ?? ""}. A cobrança de ${company} está em aberto há ${d} dia(s). Se já pagou, desconsidere.`,
            lines: [{ label: "Valor", value: brl(p.gross_amount) }], cta: { label: "Pagar agora", url: p.invoice_url } },
        });
        sent++;
      }
    }
  }

  const soon = new Date(Date.now() + 2 * 86400000).toISOString();
  const { data: links } = await admin.from("contract_links")
    .select("id, tenant_id, contract_id, expires_at, contracts(title, status)")
    .is("revoked_at", null).gt("expires_at", new Date().toISOString()).lt("expires_at", soon).limit(500);
  for (const l of links ?? []) {
    const c = l.contracts as { title?: string; status?: string } | null;
    if (!c || ["signed", "cancelled", "expired"].includes(c.status ?? "")) continue;
    await notifyTenant(admin, {
      tenantId: l.tenant_id, kind: "contract.expiring", dedupeKey: `contract.expiring:${l.id}`, link: `/contratos/${l.contract_id}`,
      title: "Link de assinatura perto de vencer", body: `O link do contrato “${c.title ?? "Contrato"}” vence em até 2 dias e ainda faltam assinaturas.`,
      email: { subject: "Contrato aguardando assinatura" },
    });
  }
  return Response.json({ ok: true, reminders: sent });
}

export const Route = createFileRoute("/api/public/cron/notifications")({
  server: { handlers: { GET: ({ request }) => run(request), POST: ({ request }) => run(request) } },
});
