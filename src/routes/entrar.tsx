import { createFileRoute, redirect } from "@tanstack/react-router";

// Endereço curto: redireciona permanentemente para a página oficial (sem conteúdo duplicado).
export const Route = createFileRoute("/entrar")({
  beforeLoad: () => { throw redirect({ to: "/auth", statusCode: 301 }); },
});
