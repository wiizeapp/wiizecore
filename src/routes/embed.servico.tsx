import { createFileRoute } from "@tanstack/react-router";
import { EmbedApp } from "@/components/embed/embed-app";

export const Route = createFileRoute("/embed/servico")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Serviço — WiizePay no Wiize" },
      { name: "description", content: "Janela segura da WiizePay dentro do Wiize CRM." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Serviço — WiizePay no Wiize" },
      { property: "og:description", content: "Janela segura da WiizePay dentro do Wiize CRM." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <EmbedApp kind="service" />,
});
