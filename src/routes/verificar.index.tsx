import { pageHead } from "@/lib/seo";
import { createFileRoute } from "@tanstack/react-router";
import { VerifyPanel } from "@/components/contracts/verify-panel";
import { VerifyLayout } from "@/components/contracts/verify-layout";

export const Route = createFileRoute("/verificar/")({
  head: () => pageHead({ path: "/verificar", title: "Verificar contrato — Wiize Core", description: "Confira se um contrato assinado pela Wiize Core é autêntico usando o código ou o arquivo PDF.", ogDescription: "Confira a autenticidade de contratos assinados eletronicamente na Wiize Core.", breadcrumb: [{ name: "Verificar contrato", path: "/verificar" }] }),
  component: () => (
    <VerifyLayout title="Verificar contrato" subtitle="Digite o código de verificação que aparece no rodapé do PDF ou envie o arquivo para confirmar se ele é autêntico.">
      <VerifyPanel />
    </VerifyLayout>
  ),
});
