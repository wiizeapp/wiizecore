import logoAssetUrl from "@/assets/wiizepay-logo-v2.png";
const logoAsset = { url: logoAssetUrl };
import internalLogo from "@/assets/wiizepay-logo-internal.png";
import { cn } from "@/lib/utils";

export function Brand({ compact = false, className, color, accentColor, beta = false }: { compact?: boolean; className?: string; color?: string; accentColor?: string; beta?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-display font-bold text-foreground", className)} style={color ? { color } : undefined}>
      <img src={beta ? internalLogo : logoAsset.url} alt="" className="h-7 w-7 rounded-md" />
      {!compact ? <span className="text-xl">Wiize<span style={{ color: accentColor ?? "var(--brand-pay)" }}>Pay</span></span> : null}
      {beta ? <span className="rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-none tracking-wider text-primary">Beta</span> : null}
    </span>
  );
}