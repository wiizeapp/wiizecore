export function durationLabel(c: { duration_months?: number | null; starts_on?: string | null; ends_on?: string | null }) {
  if (c.duration_months) return `${c.duration_months} ${c.duration_months === 1 ? "mês" : "meses"}`;
  if (c.starts_on && c.ends_on) {
    const m = Math.max(1, Math.round((new Date(c.ends_on).getTime() - new Date(c.starts_on).getTime()) / (30.44 * 864e5)));
    return `${m} ${m === 1 ? "mês" : "meses"}`;
  }
  return "Indeterminado";
}
