import { createFileRoute } from "@tanstack/react-router";
import { VerifyPanel } from "@/components/contracts/verify-panel";
import { VerifyLayout } from "@/components/contracts/verify-layout";

export const Route = createFileRoute("/verificar/")({
  head: () => ({
    meta: [
      { title: "Verificar contrato — WiizePay" },
      { name: "description", content: "Confira se um contrato assinado pela WiizePay é autêntico usando o código ou o arquivo PDF." },
      { property: "og:title", content: "Verificar contrato — WiizePay" },
      { property: "og:description", content: "Confira a autenticidade de contratos assinados eletronicamente na WiizePay." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <VerifyLayout title="Verificar contrato" subtitle="Digite o código de verificação que aparece no rodapé do PDF ou envie o arquivo para confirmar se ele é autêntico.">
      <VerifyPanel />
    </VerifyLayout>
  ),
});
