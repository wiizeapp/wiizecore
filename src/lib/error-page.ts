import { BRAND_CONFIG } from "./brand-config";

export function renderErrorPage(): string {
  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <title>${BRAND_CONFIG.displayName} | Esta página não carregou</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex, nofollow" />
    <meta name="theme-color" content="#fafafa" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Outfit:wght@700&display=swap" rel="stylesheet" />
    <style>
      :root { color-scheme: light; --background: #fafafa; --foreground: #172421; --muted: #61716a; --primary: #147d59; --primary-hover: #106447; --primary-foreground: #fff; --surface: #fff; --border: #dde5e0; --accent-surface: #edf6f0; --focus: #147d59; }
      * { box-sizing: border-box; }
      body { font: 15px/1.7 'Manrope', system-ui, -apple-system, sans-serif; background: var(--background); color: var(--foreground); min-height: 100vh; min-height: 100svh; margin: 0; display: flex; flex-direction: column; letter-spacing: 0; }
      header { padding: 28px 40px; border-bottom: 1px solid var(--border); }
      .brand { font: 700 24px/1 'Outfit', system-ui, sans-serif; color: var(--foreground); text-decoration: none; display: inline-flex; align-items: center; min-height: 32px; }
      .brand span { color: var(--primary); }
      main { flex: 1; display: grid; place-items: center; padding: 64px 24px 100px; }
      .content { max-width: 480px; width: 100%; text-align: center; }
      .status-icon { width: 80px; height: 80px; margin: 0 auto 28px; display: grid; place-items: center; background: var(--accent-surface); color: var(--primary); border: 1px solid var(--border); border-radius: 50%; }
      svg { flex-shrink: 0; }
      h1 { font-size: 30px; font-weight: 800; line-height: 1.25; margin: 0 0 16px; text-wrap: balance; }
      p { max-width: 380px; color: var(--muted); margin: 0 auto 32px; text-wrap: pretty; }
      .actions { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
      .action { min-height: 48px; padding: 12px 20px; border-radius: 8px; font: inherit; font-weight: 700; line-height: 1.4; cursor: pointer; text-decoration: none; border: 1px solid transparent; display: inline-flex; align-items: center; justify-content: center; gap: 9px; transition: background-color 150ms ease, border-color 150ms ease; }
      .primary { background: var(--primary); color: var(--primary-foreground); }
      .primary:hover { background: var(--primary-hover); }
      .secondary { background: var(--surface); color: var(--foreground); border-color: var(--border); }
      .secondary:hover { background: var(--accent-surface); border-color: var(--muted); }
      a:focus-visible, button:focus-visible { outline: 3px solid var(--focus); outline-offset: 4px; }
      @media (max-width: 480px) { header { padding: 24px; } main { padding: 48px 24px 72px; } h1 { font-size: 26px; } .actions { flex-direction: column; } .action { width: 100%; } }
      @media (prefers-reduced-motion: reduce) { .action { transition: none; } }
    </style>
  </head>
  <body>
    <header>
      <a class="brand" href="/" aria-label="${BRAND_CONFIG.displayName}">${BRAND_CONFIG.brandName}<span>${BRAND_CONFIG.productLabel}</span></a>
    </header>
    <main>
    <section class="content" aria-labelledby="error-title">
      <div class="status-icon" aria-hidden="true">
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M12 12v3"/><path d="M12 18h.01"/></svg>
      </div>
      <h1 id="error-title">Esta página não carregou</h1>
      <p>Algo deu errado do nosso lado. Tente novamente ou volte ao início.</p>
      <div class="actions">
        <button class="action primary" type="button" onclick="location.reload()"><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 7a7 7 0 0 1 12-1l2 6M4 12l2 6a7 7 0 0 0 12-1"/></svg><strong>Tentar novamente</strong></button>
        <a class="action secondary" href="/"><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 19-7-7 7-7M5 12h14"/></svg><strong>Voltar ao início</strong></a>
      </div>
    </section>
    </main>
  </body>
</html>`;
}
