import { createFileRoute, redirect } from "@tanstack/react-router";

// Endereço curto: redireciona permanentemente para a página oficial (sem conteúdo duplicado).
export const Route = createFileRoute("/central-do-cliente")({
  beforeLoad: () => { throw redirect({ to: "/portal-do-cliente", statusCode: 301 }); },
});
