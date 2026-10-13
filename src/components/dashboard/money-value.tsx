/** Preserva o formatador da aplicação (idioma e privacidade), alterando só a tipografia. */
export function MoneyValue({ value }: { value: string }) {
  const match = /^(.*?)(\d[\d.,\s]*)([.,]\d{2})(.*)$/.exec(value);
  if (!match) return <span>{value}</span>;
  return <span className="inline-flex max-w-full items-baseline whitespace-nowrap" aria-label={value}>
    <span className="mr-1 text-[0.72em] font-medium text-muted-foreground" aria-hidden>{match[1]}</span>
    <span aria-hidden>{match[2]}</span>
    <span className="text-[0.52em] font-medium text-muted-foreground" aria-hidden>{match[3]}</span>
    {match[4] && <span className="ml-1 text-[0.72em] font-medium text-muted-foreground" aria-hidden>{match[4]}</span>}
  </span>;
}