import { pageHead } from "@/lib/seo";
import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal-page";
export const Route = createFileRoute("/politica-de-cookies")({ head: () => pageHead({ path: "/politica-de-cookies", title: "Política de Cookies — Wiize Recebe", description: "Informações sobre cookies e armazenamento local no Wiize Recebe.", ogDescription: "Como cookies e tecnologias semelhantes apoiam o funcionamento do produto.", breadcrumb: [{ name: "Política de cookies", path: "/politica-de-cookies" }] }), component: Page });
function Page() { return <LegalPage eyebrow="Privacidade" title="Política de Cookies" description="Como tecnologias locais apoiam o funcionamento e a segurança do Wiize Recebe. Este conteúdo deve passar por revisão jurídica antes da publicação definitiva." sections={[
  { title: "1. O que são", paragraphs: ["Cookies e recursos semelhantes permitem manter sessões, lembrar preferências e proteger a navegação."] },
  { title: "2. Uso essencial", paragraphs: ["O produto utiliza recursos necessários para autenticação, segurança, prevenção de abuso, continuidade da sessão e preferência de tema. Sem eles, partes da plataforma podem não funcionar."] },
  { title: "3. Preferências", paragraphs: ["A preferência entre tema claro e escuro pode ser salva no navegador para ser aplicada em visitas futuras."] },
  { title: "4. Atualizações", paragraphs: ["Esta política será atualizada caso novas categorias de cookies ou ferramentas sejam adotadas."] },
]} />; }