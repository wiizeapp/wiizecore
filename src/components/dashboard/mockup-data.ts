/** Local screenshot fixtures only. Never persist or use for financial operations. */
export function canUseDashboardMockup(email: string | undefined) {
  return email?.trim().toLowerCase() === "caiowiize@gmail.com";
}

type MockupRange = { start: Date; end: Date; prevStart: Date; prevEnd: Date };
export function dashboardMockupData(range: MockupRange, translate: (key: string) => string) {
  const customers = ["Horizonte Studio", "Atlas Digital", "Nexo Consultoria", "Aurora Design", "Prisma Tech", "Vértice Marketing", "Lumina Studio", "Nova Essência"].map((name, i) => ({ id: `mock-customer-${i}`, name, created_at: range.start.toISOString() }));
  const services = ["Consultoria estratégica", "Gestão de marketing", "Desenvolvimento web", "Design de marca", "Suporte mensal"].map((name, i) => ({ id: `mock-service-${i}`, name: translate(name) }));
  const day = (date: Date) => date.toISOString().slice(0, 10);
  const makePayment = (i: number, timestamp: Date, status: string, recurring = false) => {
    const gross = 420 + (i % 13) * 135;
    return { id: `mock-payment-${status}-${timestamp.getTime()}-${i}`, description: services[i % services.length]?.name ?? "", gross_amount: gross, net_amount: Math.round(gross * 9700) / 10000, platform_fee_amount: Math.round(gross * 300) / 10000, refunded_amount: 0, status, method: ["pix", "credit_card", "boleto"][i % 3] ?? "pix", created_at: timestamp.toISOString(), paid_at: status === "paid" ? timestamp.toISOString() : null, due_on: day(timestamp), customer_id: customers[i % customers.length]?.id ?? null, service_id: services[i % services.length]?.id ?? null, subscription_id: recurring ? `mock-subscription-${i % 8}` : null, installment_count: 1 };
  };
  const spread = (start: Date, end: Date, count: number) => Array.from({ length: count }, (_, i) => makePayment(i, new Date(start.getTime() + (end.getTime() - start.getTime()) * (i + 0.5) / count), "paid"));
  const payments = [...spread(range.start, range.end, 96), ...spread(range.prevStart, range.prevEnd, 72)];
  const now = new Date();
  for (let month = 0; month < 12; month++) {
    for (let i = 0; i < 8 + month; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() - 11 + month, 10, 12);
      payments.push(makePayment(i + month, date, "paid", true));
    }
  }
  for (let i = 0; i < 24; i++) {
    const row = makePayment(i, new Date(now.getFullYear(), now.getMonth(), now.getDate() + i + 1, 12), "pending", true);
    row.created_at = new Date(range.start.getTime() + 1000).toISOString();
    payments.push(row);
  }
  for (let i = 0; i < 7; i++) {
    const row = makePayment(i, new Date(now.getFullYear(), now.getMonth(), now.getDate() - i - 1, 12), "overdue");
    row.created_at = new Date(range.start.getTime() + 1000).toISOString();
    payments.push(row);
  }
  // First charges for new customers stay within the selected period.
  const newCustomers = ["Órbita Studio", "Elo Digital", "Vivaz Tech"].map((name, i) => ({ id: `mock-new-${i}`, name, created_at: range.start.toISOString() }));
  newCustomers.forEach((customer, i) => { const row = makePayment(i, new Date(range.start.getTime() + 2000 + i * 1000), "paid"); row.customer_id = customer.id; payments.push(row); });
  return {
    customers: [...customers, ...newCustomers], services, payments,
    wallet: { available_balance: 48372.63, pending_balance: 18645.24 },
    refunds: [{ id: "mock-refund", refund_amount: 840, completed_at: range.start.toISOString() }],
    extras: { contracts: 38, subscriptions: 24, activation: "approved", fiscalConfigured: true, invoicesIssued: 86, invoicesPending: 4, invoicesError: 1,
      transactions: Array.from({ length: 5 }, (_, i) => ({ id: `mock-transaction-${i}`, amount: 1240 + i * 360, description: `${translate("Recebimento liberado")} · ${customers[i]?.name ?? ""}`, kind: "payment", occurred_at: new Date(now.getTime() - i * 3600000).toISOString() })) },
  };
}