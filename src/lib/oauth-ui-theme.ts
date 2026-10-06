export type OAuthUiTheme = "light" | "dark";

const THEME_KEY = "wiize-theme";

export function parseOAuthUiTheme(value: unknown): OAuthUiTheme | undefined {
  return value === "light" || value === "dark" ? value : undefined;
}

export function themeFromOAuthReturnPath(path: string | undefined): OAuthUiTheme | undefined {
  if (!path?.startsWith("/oauth/authorize?")) return undefined;
  try {
    return parseOAuthUiTheme(new URL(path, "https://wiizepay.local").searchParams.get("ui_theme"));
  } catch {
    return undefined;
  }
}

export function resolveOAuthUiTheme(requested?: OAuthUiTheme): OAuthUiTheme {
  if (requested) return requested;
  const saved = window.localStorage.getItem(THEME_KEY);
  if (saved === "light" || saved === "dark") return saved;
  if (saved === "system") return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  return "light";
}

export function applyOAuthUiTheme(requested?: OAuthUiTheme): OAuthUiTheme {
  const theme = resolveOAuthUiTheme(requested);
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
  document.documentElement.dataset["oauthUiTheme"] = theme;
  return theme;
}
