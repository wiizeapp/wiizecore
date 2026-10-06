export type PeriodKey = "hoje" | "ontem" | "7d" | "15d" | "30d" | "custom";

export const PERIOD_OPTIONS: { key: Exclude<PeriodKey, "custom">; label: string }[] = [
  { key: "hoje", label: "Hoje" },
  { key: "ontem", label: "Ontem" },
  { key: "7d", label: "7 dias" },
  { key: "15d", label: "15 dias" },
  { key: "30d", label: "30 dias" },
];

export type Range = { start: Date; end: Date; prevStart: Date; prevEnd: Date; granularity: "hour" | "day" };

const DAY = 86_400_000;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export function resolveRange(key: PeriodKey, from?: string, to?: string): Range {
  const today = startOfDay(new Date());
  let start: Date;
  let end: Date;
  if (key === "custom" && from && to) {
    start = startOfDay(new Date(`${from}T00:00:00`));
    end = new Date(startOfDay(new Date(`${to}T00:00:00`)).getTime() + DAY);
  } else if (key === "ontem") {
    start = new Date(today.getTime() - DAY);
    end = today;
  } else if (key === "7d" || key === "15d" || key === "30d") {
    const n = Number.parseInt(key, 10);
    end = new Date(today.getTime() + DAY);
    start = new Date(end.getTime() - n * DAY);
  } else {
    start = today;
    end = new Date(today.getTime() + DAY);
  }
  const len = end.getTime() - start.getTime();
  return {
    start,
    end,
    prevStart: new Date(start.getTime() - len),
    prevEnd: start,
    granularity: len <= DAY ? "hour" : "day",
  };
}

/** Soma em centavos inteiros para evitar erros de arredondamento. */
export const toCents = (v: number | string | null | undefined) => Math.round(Number(v ?? 0) * 100);

export function pctChange(curr: number, prev: number): number | null {
  if (prev === 0) return curr === 0 ? 0 : null;
  return ((curr - prev) / prev) * 100;
}

export function buckets(range: Range) {
  const out: { key: string; label: string; start: number; end: number }[] = [];
  const step = range.granularity === "hour" ? 3_600_000 : DAY;
  for (let t = range.start.getTime(); t < range.end.getTime(); t += step) {
    const d = new Date(t);
    out.push({
      key: String(t),
      label:
        range.granularity === "hour"
          ? `${String(d.getHours()).padStart(2, "0")}h`
          : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
      start: t,
      end: t + step,
    });
  }
  return out;
}
