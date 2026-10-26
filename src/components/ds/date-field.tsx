import { useState } from "react";
import { ptBR } from "date-fns/locale";
import { CalendarDays, X } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const toISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fromISO = (s: string) => { const [y, m, d] = s.split("-").map(Number) as [number, number, number]; return new Date(y, m - 1, d); };
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

type Props = {
  value: string;
  onChange: (iso: string) => void;
  min?: string | undefined;
  max?: string | undefined;
  placeholder?: string;
  id?: string;
  invalid?: boolean;
  shortcuts?: { label: string; days: number }[];
};

/** Seletor de data da WiizePay: calendário em português, mês/ano rápidos e atalhos. Valor em AAAA-MM-DD. */
export function DateField({ value, onChange, min, max, placeholder = "Escolher data", id, invalid, shortcuts }: Props) {
  const [open, setOpen] = useState(false);
  const selected = value ? fromISO(value) : undefined;
  const minD = min ? fromISO(min) : undefined;
  const maxD = max ? fromISO(max) : undefined;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const pick = (d: Date | undefined) => { if (!d) return; onChange(toISO(d)); setOpen(false); };
  const allowed = (d: Date) => (!minD || d >= minD) && (!maxD || d <= maxD);
  const items = shortcuts ?? [{ label: "Hoje", days: 0 }, { label: "+7 dias", days: 7 }, { label: "+30 dias", days: 30 }];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button id={id} type="button"
          className={cn("flex h-10 w-full items-center gap-2 rounded-md border bg-background px-3 text-left text-sm transition-colors hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            invalid ? "border-destructive" : "border-input")}>
          <CalendarDays className="h-4 w-4 shrink-0 text-primary" />
          <span className={cn("flex-1 truncate", !selected && "text-muted-foreground")}>
            {selected ? selected.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "long", year: "numeric" }) : placeholder}
          </span>
          {selected ? <X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" onClick={(e) => { e.stopPropagation(); onChange(""); }} /> : null}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto overflow-hidden p-0" align="start">
        <div className="flex flex-wrap gap-1.5 border-b border-border bg-muted/30 p-2">
          {items.map((s) => {
            const d = addDays(today, s.days);
            return (
              <button key={s.label} type="button" disabled={!allowed(d)} onClick={() => pick(d)}
                className="rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium hover:border-primary hover:text-primary disabled:opacity-40">
                {s.label}
              </button>
            );
          })}
        </div>
        <Calendar
          mode="single"
          locale={ptBR}
          selected={selected}
          onSelect={pick}
          defaultMonth={selected ?? minD ?? today}
          captionLayout="dropdown"
          startMonth={new Date(today.getFullYear() - 5, 0)}
          endMonth={new Date(today.getFullYear() + 10, 11)}
          disabled={[...(minD ? [{ before: minD }] : []), ...(maxD ? [{ after: maxD }] : [])]}
          className="pointer-events-auto p-3"
        />
      </PopoverContent>
    </Popover>
  );
}

export const isoToday = () => toISO(new Date());
export const isoAddMonths = (iso: string, n: number) => {
  const d = fromISO(iso); const day = d.getDate();
  d.setDate(1); d.setMonth(d.getMonth() + n);
  d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return toISO(d);
};
export const monthsBetween = (a: string, b: string) => {
  const x = fromISO(a), y = fromISO(b);
  let m = (y.getFullYear() - x.getFullYear()) * 12 + (y.getMonth() - x.getMonth());
  if (y.getDate() < x.getDate()) m -= 1;
  return Math.max(1, m);
};
