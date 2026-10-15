import { createFileRoute } from "@tanstack/react-router";
import { VerifyPanel } from "@/components/contracts/verify-panel";
import { VerifyLayout } from "@/components/contracts/verify-layout";

export const Route = createFileRoute("/verificar/$code")({
  head: () => ({
    meta: [
      { title: "Verificação de contrato — Wiize Core" },
      { name: "description", content: "Resultado da verificação de autenticidade de um contrato assinado na Wiize Core." },
      { property: "og:title", content: "Verificação de contrato — Wiize Core" },
      { property: "og:description", content: "Resultado da verificação de autenticidade de um contrato assinado na Wiize Core." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Page,
});

function Page() {
  const { code } = Route.useParams();
  return (
    <VerifyLayout title="Verificação de autenticidade" subtitle="Resultado da conferência deste contrato nos registros da Wiize Core.">
      <VerifyPanel initialCode={code} />
    </VerifyLayout>
  );
}
