import { createFileRoute } from "@tanstack/react-router";
import { absoluteUrl } from "@/lib/seo";

// Somente páginas públicas e indexáveis. Atualize ao criar/remover páginas públicas. Sem lastmod (sem data confiável).
export const PUBLIC_PATHS = [
  "/", "/sobre", "/taxas", "/cobrancas-e-pagamentos", "/gestao-financeira", "/gestao-de-clientes",
  "/portal-do-cliente", "/contratos-digitais", "/checkout-com-sua-marca", "/integracao-crm-wiize",
  "/lembretes-de-cobranca", "/pix-automatico", "/prazos", "/seguranca-e-confianca", "/perguntas-frequentes",
  "/suporte", "/auth", "/verificar", "/termos-de-uso", "/politica-de-privacidade", "/politica-de-cookies",
  "/politica-de-pagamentos", "/politica-de-cancelamento-e-reembolso",
];

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: () => {
        const urls = PUBLIC_PATHS.map((p) => `  <url><loc>${absoluteUrl(p)}</loc></url>`).join("\n");
        const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
        return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
      },
    },
  },
});
