import { createFileRoute, redirect } from "@tanstack/react-router";

// Endereço curto: redireciona permanentemente para a página oficial (sem conteúdo duplicado).
export const Route = createFileRoute("/plataforma-de-pagamentos")({
  beforeLoad: () => { throw redirect({ to: "/cobrancas-e-pagamentos", statusCode: 301 }); },
});
