import { z } from "zod";

/** Aparência do checkout: só cores, textos curtos e logo. Nunca HTML ou código. */
export type CheckoutAppearance = {
  theme: "wiize" | "clean" | "dark";
  /** Cor principal da marca, independente das demais cores do checkout. */
  brandColor: string;
  /** Fundo de toda a página do checkout (área atrás dos cartões). */
  background: string;
  /** Faixa do topo com a logo. */
  header: string;
  /** Cartões e painéis sobre o fundo. */
  surface: string;
  button: string;
  buttonText: string;
  text: string;
  mutedText: string;
  radius: number;
  logoUrl: string | null;
  /** Caminho interno no armazenamento privado; a URL temporária é gerada no servidor. */
  logoPath: string | null;
  logoMode: "logo" | "logo_name" | "name";
  displayName: string | null;
  supportEmail: string | null;
  supportPhone: string | null;
  title: string | null;
  description: string | null;
  supportText: string | null;
};

export const THEMES: Record<CheckoutAppearance["theme"], Pick<CheckoutAppearance, "background" | "header" | "surface" | "button" | "buttonText" | "text" | "mutedText" | "radius">> = {
  wiize: { background: "#F6F8F7", header: "#FFFFFF", surface: "#FFFFFF", button: "#087A45", buttonText: "#FFFFFF", text: "#111827", mutedText: "#5B6472", radius: 12 },
  clean: { background: "#FFFFFF", header: "#FFFFFF", surface: "#FFFFFF", button: "#111827", buttonText: "#FFFFFF", text: "#111827", mutedText: "#6B7280", radius: 10 },
  dark: { background: "#0B0F14", header: "#10161E", surface: "#151B23", button: "#15803D", buttonText: "#FFFFFF", text: "#F3F4F6", mutedText: "#A3ACB9", radius: 12 },
};

export const DEFAULT_APPEARANCE: CheckoutAppearance = {
  theme: "wiize",
  brandColor: THEMES.wiize.button,
  ...THEMES.wiize,
  logoUrl: null,
  logoPath: null,
  logoMode: "logo_name",
  displayName: null,
  supportEmail: null,
  supportPhone: null,
  title: null,
  description: null,
  supportText: null,
};

const hex = z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Cor inválida");
const safeText = (max: number) =>
  z.string().trim().max(max).refine((v) => !/[<>{}]|javascript:/i.test(v), "Texto com caracteres não permitidos").nullable();

export const appearanceSchema = z.object({
  theme: z.enum(["wiize", "clean", "dark"]),
  brandColor: hex.default(THEMES.wiize.button),
  background: hex,
  header: hex,
  surface: hex,
  button: hex,
  buttonText: hex,
  text: hex,
  mutedText: hex,
  radius: z.number().int().min(0).max(24),
  logoUrl: z.string().url().max(2000).refine((u) => u.startsWith("https://"), "Logo inválida").nullable(),
  logoPath: z.string().regex(/^[0-9a-f-]{36}\/[A-Za-z0-9._-]{1,80}$/).nullable(),
  logoMode: z.enum(["logo", "logo_name", "name"]),
  displayName: safeText(60),
  supportEmail: z.string().trim().email().max(120).nullable(),
  supportPhone: z.string().trim().regex(/^[0-9 ()+-]{8,20}$/, "Telefone inválido").nullable(),
  title: safeText(60),
  description: safeText(160),
  supportText: safeText(120),
});

/** Lê com segurança qualquer valor salvo, completando com o padrão. */
export function normalizeAppearance(raw: unknown): CheckoutAppearance {
  const source = (raw && typeof raw === "object" ? raw : {}) as Partial<CheckoutAppearance>;
  const merged = { ...DEFAULT_APPEARANCE, ...source };
  if (!source.brandColor) merged.brandColor = source.button ?? DEFAULT_APPEARANCE.brandColor;
  // Versões salvas antes da cor do cabeçalho existir continuam com o topo igual às superfícies.
  if (!source.header) merged.header = merged.surface;
  const parsed = appearanceSchema.safeParse(merged);
  return parsed.success ? parsed.data : DEFAULT_APPEARANCE;
}

/** A cor principal também orienta os botões do checkout, com texto legível. */
export function withBrandColor(appearance: CheckoutAppearance, color: string): CheckoutAppearance {
  const brandColor = hex.parse(color).toUpperCase();
  return { ...appearance, brandColor, button: brandColor, buttonText: readableOn(brandColor) };
}

function luminance(color: string) {
  const n = color.replace("#", "");
  const ch = [0, 2, 4].map((i) => {
    const c = parseInt(n.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!;
}

export function contrastRatio(a: string, b: string) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1! + 0.05) / (l2! + 0.05);
}

/** Cor do texto do botão escolhida automaticamente para ficar legível. */
export function readableOn(color: string) {
  return contrastRatio(color, "#FFFFFF") >= contrastRatio(color, "#111827") ? "#FFFFFF" : "#111827";
}

/** Lista problemas de legibilidade (WCAG AA). */
export function contrastIssues(a: Pick<CheckoutAppearance, "background" | "surface" | "button" | "buttonText" | "text" | "mutedText">) {
  const issues: string[] = [];
  // Textos aparecem tanto sobre o fundo da página quanto sobre os cartões.
  if (contrastRatio(a.text, a.surface) < 4.5) issues.push("text");
  if (contrastRatio(a.mutedText, a.surface) < 3) issues.push("mutedText");
  if (contrastRatio(a.button, a.buttonText) < 4.5) issues.push("buttonText");
  if (contrastRatio(a.text, a.background) < 4.5 || contrastRatio(a.mutedText, a.background) < 3) issues.push("background");
  return issues;
}

/** Cores de texto do cabeçalho: usa as cores escolhidas quando legíveis, senão ajusta sozinho. */
export function headerTextColors(a: Pick<CheckoutAppearance, "header" | "text" | "mutedText">) {
  const text = contrastRatio(a.text, a.header) >= 4.5 ? a.text : readableOn(a.header);
  const muted = contrastRatio(a.mutedText, a.header) >= 3 ? a.mutedText : `color-mix(in srgb, ${text} 72%, ${a.header})`;
  return { text, muted };
}
