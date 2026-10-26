import { createFileRoute } from "@tanstack/react-router";
import { VerifyPanel } from "@/components/contracts/verify-panel";
import { VerifyLayout } from "@/components/contracts/verify-layout";

export const Route = createFileRoute("/verificar/$code")({
  head: () => ({
    meta: [
      { title: "Verificação de contrato — WiizePay" },
      { name: "description", content: "Resultado da verificação de autenticidade de um contrato assinado na WiizePay." },
      { property: "og:title", content: "Verificação de contrato — WiizePay" },
      { property: "og:description", content: "Resultado da verificação de autenticidade de um contrato assinado na WiizePay." },
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
    <VerifyLayout title="Verificação de autenticidade" subtitle="Resultado da conferência deste contrato nos registros da WiizePay.">
      <VerifyPanel initialCode={code} />
    </VerifyLayout>
  );
}
