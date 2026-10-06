import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";

const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Busca tolerante: ignora acentos/maiúsculas e compara números sem pontuação (CPF, telefone, valores). */
export function matchesSearch(query: string, values: unknown[]): boolean {
  const q = norm(query.trim());
  if (!q) return true;
  const text = norm(values.filter((v) => v !== null && v !== undefined).map(String).join(" "));
  const qDigits = q.replace(/\D/g, "");
  const onlyNumeric = /^[\d\s.,/()+-]+$/.test(q);
  if (onlyNumeric && qDigits) return text.replace(/\D/g, "").includes(qDigits) || text.includes(q);
  return q.split(/\s+/).every((w) => text.includes(w));
}

export function SearchField({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative w-full sm:max-w-xs">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder ?? "Pesquisar"} className="pl-9 pr-8" aria-label={placeholder ?? "Pesquisar"} />
      {value ? (
        <button type="button" onClick={() => onChange("")} aria-label="Limpar busca" className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground">
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}
