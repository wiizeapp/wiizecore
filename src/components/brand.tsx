import logoAssetUrl from "@/assets/wiizepay-logo-v2.png";
const logoAsset = { url: logoAssetUrl };
import internalLogo from "@/assets/wiizepay-logo-internal.png";
import { cn } from "@/lib/utils";
import { BRAND_CONFIG } from "@/lib/brand-config";

export function Brand({ compact = false, className, color, accentColor, beta = false, size = "md" }: { compact?: boolean; className?: string; color?: string; accentColor?: string; beta?: boolean; size?: "sm" | "md" | "lg" }) {
  const mark = size === "lg" ? "h-9 w-9" : size === "sm" ? "h-6 w-6" : "h-7 w-7";
  const word = size === "lg" ? "text-2xl" : size === "sm" ? "text-lg" : "text-xl";
  return (
    <span aria-label={BRAND_CONFIG.displayName} className={cn("inline-flex shrink-0 items-center gap-2 whitespace-nowrap font-brand font-bold leading-none text-foreground", className)} style={color ? { color } : undefined}>
      <img src={beta ? internalLogo : logoAsset.url} alt="" className={cn("rounded-md", mark)} />
      {!compact ? <span className={cn(word, "leading-none")}>{BRAND_CONFIG.brandName}<span style={{ color: accentColor ?? "var(--brand-pay)" }}>{BRAND_CONFIG.productLabel}</span></span> : null}
      {beta ? <span className="rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-none tracking-wider text-primary">Beta</span> : null}
    </span>
  );
}