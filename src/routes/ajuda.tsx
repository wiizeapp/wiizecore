import { pageHead } from "@/lib/seo";
import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { PublicPage } from "@/components/public-site";
import { useHasSession } from "@/components/help/help-parts";

// Central de Ajuda pública: só conteúdo estático e taxas públicas.
// Ações (sugestões/avaliações) continuam exigindo login no servidor.
export const Route = createFileRoute("/ajuda")({
  component: HelpLayout,
  head: () => pageHead({ path: "/ajuda", title: "Central de Ajuda | WiizePay", description: "Encontre respostas sobre cobranças, recebimentos, contratos e sua conta WiizePay." }),
});

function HelpLayout() {
  const { t: ui } = useTranslation("ui");
  const signed = useHasSession();
  return (
    <PublicPage>
      <main className="section-shell py-10 lg:py-14">
        {signed ? (
          <div className="mb-6"><Link to="/painel" className="text-sm font-medium text-primary hover:underline">← {ui("Voltar ao painel")}</Link></div>
        ) : null}
        <Outlet />
      </main>
    </PublicPage>
  );
}
