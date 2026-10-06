import { useEffect, useRef, useState } from "react";
import { Eraser, PenLine, Type } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Recorta o desenho ao traço (sem bordas vazias) para ele ocupar todo o campo no PDF. */
function trimmedPng(c: HTMLCanvasElement) {
  const ctx = c.getContext("2d")!;
  const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height);
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (data[(y * width + x) * 4 + 3]! > 0) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return c.toDataURL("image/png");
  const pad = 8; x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(width - 1, x1 + pad); y1 = Math.min(height - 1, y1 + pad);
  const out = document.createElement("canvas"); out.width = x1 - x0 + 1; out.height = y1 - y0 + 1;
  out.getContext("2d")!.drawImage(c, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  return out.toDataURL("image/png");
}

export type SignatureValue = { mode: "typed" | "drawn"; signatureImage: string; initialsImage: string };

export const SIGNATURE_FONTS = [
  { id: "dancing", label: "Clássica", family: "Dancing Script", weight: 600 },
  { id: "greatvibes", label: "Elegante", family: "Great Vibes", weight: 400 },
  { id: "allura", label: "Fina", family: "Allura", weight: 400 },
  { id: "satisfy", label: "Moderna", family: "Satisfy", weight: 400 },
  { id: "homemade", label: "Manuscrita", family: "Homemade Apple", weight: 400 },
] as const;
type FontId = (typeof SIGNATURE_FONTS)[number]["id"];
const fontOf = (id: FontId) => SIGNATURE_FONTS.find((f) => f.id === id) ?? SIGNATURE_FONTS[0];

function initialsOf(name: string) {
  return name.trim().split(/\s+/).filter((p) => p.length > 2 || /^[A-ZÀ-Ý]/.test(p)).slice(0, 3).map((p) => p[0]!.toUpperCase()).join("") || name.slice(0, 2).toUpperCase();
}

async function textToPng(text: string, w: number, h: number, fontId: FontId) {
  const f = fontOf(fontId);
  const FONT = `'${f.family}', 'Brush Script MT', cursive`;
  try { await document.fonts.load(`${f.weight} 64px '${f.family}'`); } catch { /* usa fonte alternativa */ }
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d")!;
  let size = h * 0.62;
  ctx.font = `${f.weight} ${size}px ${FONT}`;
  while (ctx.measureText(text).width > w * 0.92 && size > 14) { size -= 2; ctx.font = `${f.weight} ${size}px ${FONT}`; }
  ctx.fillStyle = "#0f2a4a";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, w / 2, h / 2);
  return c.toDataURL("image/png");
}

function DrawBox({ label, height, onChange }: { label: string; height: number; onChange: (png: string | null) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const dirty = useRef(false);
  useEffect(() => {
    const c = ref.current!;
    const r = c.getBoundingClientRect();
    c.width = Math.max(300, Math.round(r.width * 2)); c.height = height * 2;
    const ctx = c.getContext("2d")!;
    ctx.lineWidth = 4; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#0f2a4a";
  }, [height]);
  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * e.currentTarget.width, y: ((e.clientY - r.top) / r.height) * e.currentTarget.height };
  };
  const clear = () => {
    const c = ref.current!; c.getContext("2d")!.clearRect(0, 0, c.width, c.height); dirty.current = false; onChange(null);
  };
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={clear}><Eraser className="mr-1 h-3.5 w-3.5" />Limpar</Button>
      </div>
      <canvas
        ref={ref}
        className="w-full cursor-crosshair touch-none rounded-md border border-dashed border-border bg-white outline-none transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20"
        tabIndex={0}
        aria-label={`${label}: desenhe usando o mouse ou o dedo`}
        style={{ height }}
        onPointerDown={(e) => { drawing.current = true; e.currentTarget.setPointerCapture(e.pointerId); const p = pos(e); const ctx = e.currentTarget.getContext("2d")!; ctx.beginPath(); ctx.moveTo(p.x, p.y); }}
        onPointerMove={(e) => { if (!drawing.current) return; const p = pos(e); const ctx = e.currentTarget.getContext("2d")!; ctx.lineTo(p.x, p.y); ctx.stroke(); dirty.current = true; }}
        onPointerUp={(e) => { drawing.current = false; if (dirty.current) onChange(trimmedPng(e.currentTarget)); }}
      />
    </div>
  );
}

/** Escolha da assinatura: padrão (nome cadastrado em letra de assinatura) ou desenhada, com rubrica. */
export function SignaturePad({ name, onChange }: { name: string; onChange: (v: SignatureValue | null) => void }) {
  const [mode, setMode] = useState<"typed" | "drawn">("typed");
  const [typedName, setTypedName] = useState(name);
  const [font, setFont] = useState<FontId>("dancing");
  const [preview, setPreview] = useState<{ sig: string; ini: string } | null>(null);
  const [drawn, setDrawn] = useState<{ sig: string | null; ini: string | null }>({ sig: null, ini: null });

  useEffect(() => { setTypedName((v) => v || name); }, [name]);

  useEffect(() => {
    let alive = true;
    if (mode === "typed") {
      const n = typedName.trim();
      if (n.length < 3) { setPreview(null); onChange(null); return; }
      void (async () => {
        const sig = await textToPng(n, 900, 220, font);
        const ini = await textToPng(initialsOf(n), 360, 220, font);
        if (!alive) return;
        setPreview({ sig, ini });
        onChange({ mode: "typed", signatureImage: sig, initialsImage: ini });
      })();
    } else {
      onChange(drawn.sig && drawn.ini ? { mode: "drawn", signatureImage: drawn.sig, initialsImage: drawn.ini } : null);
    }
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, typedName, drawn, font]);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {([["typed", Type, "Assinatura padrão"], ["drawn", PenLine, "Desenhar"]] as const).map(([k, Icon, l]) => (
          <button key={k} type="button" onClick={() => setMode(k)}
            className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition ${mode === k ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted"}`}>
            <Icon className="h-4 w-4" />{l}
          </button>
        ))}
      </div>
      {mode === "typed" ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
            <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
              <p className="border-b border-border px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Sua assinatura</p>
              <div className="relative flex h-28 items-center justify-center bg-white px-4">
                {preview ? <img src={preview.sig} alt="Prévia da assinatura" className="max-h-20 max-w-full" /> : <span className="text-xs text-muted-foreground">Informe seu nome completo</span>}
                <span className="pointer-events-none absolute inset-x-6 bottom-5 border-b border-dashed border-muted-foreground/40" />
              </div>
            </div>
            <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
              <p className="border-b border-border px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Sua rubrica</p>
              <div className="relative flex h-28 items-center justify-center bg-white px-3">
                {preview ? <img src={preview.ini} alt="Prévia da rubrica" className="max-h-16 max-w-full" /> : null}
                <span className="pointer-events-none absolute inset-x-4 bottom-5 border-b border-dashed border-muted-foreground/40" />
              </div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">A assinatura usa o nome completo informado acima. A rubrica aparece nas páginas marcadas do contrato.</p>
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Estilo da letra</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {SIGNATURE_FONTS.map((f) => (
                <button key={f.id} type="button" onClick={() => setFont(f.id)} aria-pressed={font === f.id}
                  className={`flex flex-col items-start rounded-lg border px-3 py-2 text-left transition ${font === f.id ? "border-primary bg-primary/10 ring-1 ring-primary" : "border-border hover:bg-muted"}`}>
                  <span className="w-full truncate text-xl leading-tight text-foreground" style={{ fontFamily: `'${f.family}', cursive`, fontWeight: f.weight }}>{typedName.trim() || "Seu nome"}</span>
                  <span className="text-[11px] text-muted-foreground">{f.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <DrawBox label="Assinatura" height={140} onChange={(sig) => setDrawn((d) => ({ ...d, sig }))} />
          <DrawBox label="Rubrica" height={90} onChange={(ini) => setDrawn((d) => ({ ...d, ini }))} />
          <p className="text-xs text-muted-foreground">Desenhe com o mouse ou com o dedo.</p>
        </div>
      )}
    </div>
  );
}
