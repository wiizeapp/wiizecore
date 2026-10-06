import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { formatBRL } from "@/lib/format";

const monthlyConfig = {
  total: { label: "Recebido", color: "var(--chart-1)" },
} satisfies ChartConfig;

const adminConfig = {
  value: { label: "Valor", color: "var(--chart-1)" },
} satisfies ChartConfig;

type MonthData = { key: string; label: string; total: number };

export function MonthlyRevenueChart({ data }: { data: MonthData[] }) {
  const hasValues = data.some((item) => item.total > 0);
  if (!hasValues) {
    return <div className="grid h-64 place-items-center rounded-md border border-dashed border-border text-sm text-muted-foreground">Os recebimentos aparecerão aqui.</div>;
  }

  return (
    <ChartContainer config={monthlyConfig} className="h-64 w-full aspect-auto">
      <BarChart accessibilityLayer data={data} margin={{ left: 4, right: 4, top: 12 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={10} />
        <YAxis hide />
        <ChartTooltip cursor={false} content={<ChartTooltipContent formatter={(value) => formatBRL(Number(value))} />} />
        <Bar dataKey="total" fill="var(--color-total)" radius={[5, 5, 0, 0]} maxBarSize={54} />
      </BarChart>
    </ChartContainer>
  );
}

type AdminData = { label: string; value: number };

export function AdminOverviewChart({ data }: { data: AdminData[] }) {
  const hasValues = data.some((item) => item.value > 0);
  if (!hasValues) {
    return <div className="grid h-72 place-items-center rounded-md border border-dashed border-border text-sm text-muted-foreground">As movimentações da plataforma aparecerão aqui.</div>;
  }

  return (
    <ChartContainer config={adminConfig} className="h-72 w-full aspect-auto">
      <BarChart accessibilityLayer data={data} layout="vertical" margin={{ left: 8, right: 18 }}>
        <CartesianGrid horizontal={false} />
        <XAxis type="number" hide />
        <YAxis dataKey="label" type="category" tickLine={false} axisLine={false} width={94} tickMargin={8} />
        <ChartTooltip cursor={false} content={<ChartTooltipContent formatter={(value) => formatBRL(Number(value))} />} />
        <Bar dataKey="value" fill="var(--color-value)" radius={[0, 5, 5, 0]} maxBarSize={30} />
      </BarChart>
    </ChartContainer>
  );
}