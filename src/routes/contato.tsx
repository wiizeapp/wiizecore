import { createFileRoute, redirect } from "@tanstack/react-router";

// Endereço curto: redireciona permanentemente para a página oficial (sem conteúdo duplicado).
export const Route = createFileRoute("/contato")({
  beforeLoad: () => { throw redirect({ to: "/suporte", statusCode: 301 }); },
});
