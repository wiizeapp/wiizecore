import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal-page";
export const Route = createFileRoute("/politica-de-cookies")({ head: () => ({ meta: [{ title: "Política de Cookies — WiizePay" }, { name: "description", content: "Informações sobre cookies e armazenamento local no WiizePay." }, { property: "og:title", content: "Política de Cookies — WiizePay" }, { property: "og:description", content: "Como cookies e tecnologias semelhantes apoiam o funcionamento do produto." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }), component: Page });
function Page() { return <LegalPage eyebrow="Privacidade" title="Política de Cookies" description="Como tecnologias locais apoiam o funcionamento e a segurança do WiizePay. Este conteúdo deve passar por revisão jurídica antes da publicação definitiva." sections={[
  { title: "1. O que são", paragraphs: ["Cookies e recursos semelhantes permitem manter sessões, lembrar preferências e proteger a navegação."] },
  { title: "2. Uso essencial", paragraphs: ["O produto utiliza recursos necessários para autenticação, segurança, prevenção de abuso, continuidade da sessão e preferência de tema. Sem eles, partes da plataforma podem não funcionar."] },
  { title: "3. Preferências", paragraphs: ["A preferência entre tema claro e escuro pode ser salva no navegador para ser aplicada em visitas futuras."] },
  { title: "4. Atualizações", paragraphs: ["Esta política será atualizada caso novas categorias de cookies ou ferramentas sejam adotadas."] },
]} />; }