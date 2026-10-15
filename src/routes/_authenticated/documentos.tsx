import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/ds";
import { CustomerDocuments } from "@/components/customers/customer-documents";

export const Route = createFileRoute("/_authenticated/documentos")({
  head: () => ({ meta: [{ title: "Arquivos e documentos — Wiize Recebe" }, { name: "description", content: "Documentos dos clientes guardados no Google Drive da empresa." }] }),
  component: Documentos,
});

function Documentos() {
  return (
    <div className="space-y-6">
      <PageHeader title="Arquivos e documentos" description="Todos os documentos anexados aos clientes. Para anexar um novo, abra o cliente e use a aba Documentos." />
      <CustomerDocuments />
    </div>
  );
}
