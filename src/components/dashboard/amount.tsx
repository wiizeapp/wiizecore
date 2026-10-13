/** Preserves the exact localized/masked value while separating its visual parts. */
export function DashboardAmount({ value }: { value: string }) {
  const match = value.match(/^(.*?)(\d[\d.,]*)([,.]\d{2})$/);
  if (!match) return <span>{value}</span>;
  return (
    <span className="numeric-tabular inline-flex max-w-full items-baseline whitespace-nowrap" aria-label={value}>
      <span aria-hidden="true" className="mr-1 text-[0.8em] font-medium text-muted-foreground">{match[1]}</span>
      <span aria-hidden="true">{match[2]}</span>
      <span aria-hidden="true" className="relative -top-[0.45em] text-[0.38em] font-normal text-muted-foreground">{match[3]}</span>
    </span>
  );
}