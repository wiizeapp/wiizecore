import { useEffect, useRef, useState } from "react";
import { Check, Layers, MousePointerClick, PenLine, Signature, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export type PlacerSigner = { key: string; label: string; role: string };
export type PlacedField = { signerKey: string; page: number; x: number; y: number; w: number; h: number; kind?: "signature" | "initials" };

const COLORS = ["#178C61", "#2563EB", "#D97706", "#9333EA", "#DC2626", "#0891B2", "#65A30D", "#DB2777"];
const SIZE = { signature: { w: 0.28, h: 0.07 }, initials: { w: 0.1, h: 0.05 } } as const;

/** Mostra o PDF página por página; clique para colocar a assinatura da pessoa escolhida e arraste para ajustar. */
export function SignaturePlacer({ pdf, signers, value, onChange }: { pdf: Uint8Array; signers: PlacerSigner[]; value: PlacedField[]; onChange: (f: PlacedField[]) => void }) {
  const [pages, setPages] = useState<(string | null)[]>([]);
  const [ratio, setRatio] = useState<number[]>([]);
  const [kind, setKind] = useState<"signature" | "initials">("signature");
  const [active, setActive] = useState(signers[0]?.key ?? "");
  const [err, setErr] = useState<string | null>(null);
  const drag = useRef<{ i: number; dx: number; dy: number; el: HTMLElement } | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
        const doc = await pdfjs.getDocument({ data: pdf.slice() }).promise;
        const n = Math.min(doc.numPages, 60);
        const rs: number[] = [];
        for (let p = 1; p <= n; p++) { const vp = (await doc.getPage(p)).getViewport({ scale: 1 }); rs.push(vp.height / vp.width); }
        if (!alive) return;
        setRatio(rs); setPages(Array(n).fill(null));
        for (let p = 1; p <= n; p++) {
          const page = await doc.getPage(p);
          const vp = page.getViewport({ scale: 1.3 });
          const c = document.createElement("canvas");
          c.width = vp.width; c.height = vp.height;
          await page.render({ canvasContext: c.getContext("2d")!, viewport: vp }).promise;
          const url = c.toDataURL("image/jpeg", 0.8);
          if (!alive) return;
          setPages((prev) => prev.map((v, i) => (i === p - 1 ? url : v)));
        }
      } catch { if (alive) setErr("Não conseguimos abrir este PDF para posicionar as assinaturas."); }
    })();
    return () => { alive = false; };
  }, [pdf]);

  useEffect(() => { if (!signers.some((s) => s.key === active)) setActive(signers[0]?.key ?? ""); }, [signers, active]);

  const color = (k: string) => COLORS[Math.max(0, signers.findIndex((s) => s.key === k)) % COLORS.length]!;
  const labelOf = (k: string) => signers.find((s) => s.key === k)?.label ?? "?";
  const clamp = (v: number, max: number) => Math.min(Math.max(v, 0), max);

  const place = (e: React.MouseEvent<HTMLDivElement>, page: number) => {
    if (drag.current || !active) return;
    const r = e.currentTarget.getBoundingClientRect();
    const { w: W, h: H } = SIZE[kind];
    const x = clamp((e.clientX - r.left) / r.width - W / 2, 1 - W);
    const y = clamp((e.clientY - r.top) / r.height - H / 2, 1 - H);
    onChange([...value, { signerKey: active, page, x, y, w: W, h: H, kind }]);
  };

  const onDown = (e: React.PointerEvent<HTMLDivElement>, i: number) => {
    e.stopPropagation();
    const el = e.currentTarget.parentElement as HTMLElement;
    const r = e.currentTarget.getBoundingClientRect();
    drag.current = { i, dx: e.clientX - r.left, dy: e.clientY - r.top, el };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current; if (!d) return;
    const r = d.el.getBoundingClientRect();
    const f = value[d.i]!;
    const x = clamp((e.clientX - r.left - d.dx) / r.width, 1 - f.w);
    const y = clamp((e.clientY - r.top - d.dy) / r.height, 1 - f.h);
    onChange(value.map((v, j) => (j === d.i ? { ...v, x, y } : v)));
  };
  const onUp = () => { setTimeout(() => { drag.current = null; }, 0); };

  const missing = signers.filter((s) => !value.some((v) => v.signerKey === s.key && v.kind !== "initials"));
  const initialsAll = () => {
    if (!active || !pages.length) return;
    const idx = signers.findIndex((s) => s.key === active);
    const { w, h } = SIZE.initials;
    const x = clamp(0.86 - idx * (w + 0.01), 1 - w), y = 0.9;
    const kept = value.filter((v) => !(v.signerKey === active && v.kind === "initials"));
    onChange([...kept, ...pages.map((_, i) => ({ signerKey: active, page: i + 1, x: Math.max(0, x), y, w, h, kind: "initials" as const }))]);
  };

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">1. Quem assina</p>
        <div className="flex flex-wrap gap-2">
          {signers.map((s) => {
            const n = value.filter((v) => v.signerKey === s.key).length;
            const on = active === s.key;
            return (
              <button key={s.key} type="button" onClick={() => setActive(s.key)} aria-pressed={on}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left transition ${on ? "border-primary bg-primary/10 ring-1 ring-primary" : "border-border hover:bg-muted"}`}>
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-primary-foreground" style={{ background: color(s.key) }}>{s.label.trim().slice(0, 1).toUpperCase()}</span>
                <span className="min-w-0">
                  <span className="block truncate text-xs font-semibold">{s.label}</span>
                  <span className="block text-[11px] text-muted-foreground">{s.role}{n ? ` · ${n} campo${n > 1 ? "s" : ""}` : ""}</span>
                </span>
                {value.some((v) => v.signerKey === s.key && v.kind !== "initials") ? <Check className="h-4 w-4 text-primary" /> : null}
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-3 border-t border-border pt-3">
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">2. O que colocar</p>
            <div className="inline-flex rounded-lg border border-border bg-muted p-1">
              {([["signature", PenLine, "Assinatura"], ["initials", Signature, "Rubrica"]] as const).map(([k, Icon, l]) => (
                <button key={k} type="button" onClick={() => setKind(k)} aria-pressed={kind === k}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${kind === k ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                  <Icon className="h-3.5 w-3.5" />{l}
                </button>
              ))}
            </div>
          </div>
          <Button type="button" size="sm" variant="outline" disabled={!pages.length} onClick={initialsAll}>
            <Layers className="mr-1.5 h-4 w-4" />Rubrica em todas as páginas
          </Button>
        </div>
        <p className="mt-3 flex items-start gap-1.5 text-xs text-muted-foreground"><MousePointerClick className="mt-0.5 h-3.5 w-3.5 shrink-0" />Clique no documento para colocar o campo. Arraste para mudar de lugar.</p>
      </div>
      {missing.length ? <p className="rounded-md border border-warning/40 bg-warning/10 p-2 text-xs">Falta posicionar: {missing.map((m) => m.label).join(", ")}</p> : null}
      {err ? <p className="text-sm text-destructive">{err}</p> : !pages.length ? (
        <div className="space-y-3">
          <p className="flex items-center gap-2 text-xs text-muted-foreground"><span className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />Preparando as páginas do PDF…</p>
          <div className="skeleton-shimmer mx-auto aspect-[1/1.414] w-full max-w-[560px] rounded-lg" />
        </div>
      ) : (
        <div className="max-h-[60vh] space-y-4 overflow-y-auto rounded-lg border border-border bg-muted/40 p-3" onPointerMove={onMove} onPointerUp={onUp}>
          {pages.map((src, idx) => (
            <div key={idx}>
              <p className="mx-auto mb-1.5 max-w-[560px] text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Página {idx + 1} de {pages.length}</p>
              <div className="relative mx-auto w-full max-w-[560px] cursor-crosshair select-none bg-white shadow" style={{ aspectRatio: `1 / ${ratio[idx]}` }} onClick={(e) => place(e, idx + 1)}>
                {src ? <img src={src} alt="" draggable={false} className="pointer-events-none absolute inset-0 h-full w-full animate-in fade-in duration-300" /> : (
                  <div className="skeleton-shimmer absolute inset-0 flex items-center justify-center"><span className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>
                )}
                {value.map((f, i) => f.page !== idx + 1 ? null : (
                  <div key={i} onPointerDown={(e) => onDown(e, i)} onClick={(e) => e.stopPropagation()}
                    className="group absolute flex cursor-move items-center gap-1 rounded-md border-2 border-dashed px-1.5 text-[10px] font-semibold shadow-sm backdrop-blur-[1px] transition hover:border-solid"
                    style={{ left: `${f.x * 100}%`, top: `${f.y * 100}%`, width: `${f.w * 100}%`, height: `${f.h * 100}%`, borderColor: color(f.signerKey), background: `${color(f.signerKey)}1f`, color: color(f.signerKey) }}>
                    {f.kind === "initials" ? <Signature className="h-3 w-3 shrink-0" /> : <PenLine className="h-3 w-3 shrink-0" />}
                    <span className="min-w-0 flex-1 truncate">{f.kind === "initials" ? "Rubrica" : labelOf(f.signerKey)}</span>
                    <button type="button" aria-label="Remover campo" className="absolute -right-2 -top-2 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-destructive-foreground opacity-0 shadow transition group-hover:opacity-100 focus:opacity-100" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onChange(value.filter((_, j) => j !== i)); }}>
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
