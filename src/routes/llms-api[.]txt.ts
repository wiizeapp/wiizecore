import { createFileRoute } from "@tanstack/react-router";

/** Documentação da API em texto puro para ferramentas de IA. Pública e sem dados sensíveis. */
export const Route = createFileRoute("/llms-api.txt")({
  server: {
    handlers: {
      GET: async () => {
        const { buildUniversalAiGuide } = await import("@/lib/api-docs-content");
        return new Response(`# WiizePay API\n\n${buildUniversalAiGuide()}\n`, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
      },
    },
  },
});
