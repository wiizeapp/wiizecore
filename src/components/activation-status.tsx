import { Badge } from "@/components/ui/badge";

export const ACTIVATION_LABEL: Record<string, string> = {
  not_started: "Não iniciado", draft: "Rascunho", in_progress: "Em preenchimento", submitted: "Enviado",
  under_review: "Em análise", action_required: "Ação necessária", approved: "Aprovado", rejected: "Recusado", suspended: "Suspenso",
};
export const DOC_LABEL: Record<string, string> = {
  id_front: "Documento com foto — frente", id_back: "Documento com foto — verso", selfie: "Selfie segurando o documento",
  company_doc: "Contrato social ou cartão CNPJ", address_proof: "Comprovante de endereço", legal_rep_doc: "Documento do responsável legal",
};

export function ActivationBadge({ status }: { status: string }) {
  const variant = status === "approved" ? "default" : ["rejected", "suspended"].includes(status) ? "destructive" : status === "action_required" ? "outline" : "secondary";
  return <Badge variant={variant as "default"}>{ACTIVATION_LABEL[status] ?? status}</Badge>;
}
