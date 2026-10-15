import { pageHead } from "@/lib/seo";
import { createFileRoute } from "@tanstack/react-router";
import { ResourcePage, type ResourcePageConfig } from "@/components/resource-page";
import { FileCheck2, Receipt, UserRound } from "lucide-react";
import { PortalPhonePremium, PortalPremium } from "@/components/home/premium-visuals";

const config: ResourcePageConfig = {
  eyebrow: "Portal do cliente",
  title: "Seu cliente com tudo",
  highlight: "na palma da mão.",
  description: "Recibos, contratos assinados, documentos e próximas cobranças em um portal com a sua marca. Seu cliente encontra sozinho o que precisa, e você responde menos mensagens.",
  visual: "customers",
  heroDemo: <PortalPremium scene={1} />,
  heroFloats: { orbit: [UserRound, Receipt], left: { icon: Receipt, label: "Recibo disponível", value: "R$ 2.500,00" }, chip: { icon: FileCheck2, label: "Contrato assinado" }, note: ["Próxima cobrança", "15 de outubro"] },
  sectionVisuals: [<PortalPremium key="r" scene={2} />, <PortalPremium key="c" scene={3} />, <PortalPhonePremium key="d" />],
  steps: [
    { title: "Cobre normalmente", description: "Assim que o cliente tem a primeira cobrança, o link do portal fica disponível no cadastro dele." },
    { title: "Envie o link", description: "O cliente entra com o e-mail e os 6 primeiros dígitos do CPF ou CNPJ, sem criar senha." },
    { title: "Ele resolve sozinho", description: "Baixa recibos, vê contratos, abre documentos e paga as próximas cobranças pelo celular." },
  ],
  sectionTitle: "Recibos em PDF sempre que o cliente precisar.",
  sectionDescription: "Cada pagamento aprovado gera um recibo com os dados do pagador e da sua empresa, pronto para baixar na hora.",
  benefits: ["Recibos com CPF ou CNPJ do cliente", "Próximas cobranças com pagamento rápido", "Contratos assinados e todas as versões", "Documentos que você anexa no cadastro do cliente"],
  faqs: [
    ["O cliente precisa criar uma conta?", "Não. Ele entra com o e-mail cadastrado e os 6 primeiros dígitos do CPF ou CNPJ."],
    ["O portal é seguro?", "Sim. Cada cliente vê apenas os próprios dados, as tentativas de acesso são limitadas e a sessão expira sozinha."],
    ["O portal usa minha marca?", "Sim. Ele segue a logo e as cores que você configurou no checkout personalizado."],
    ["Como envio documentos para o cliente?", "Pelo cadastro do cliente, na aba Documentos. Você dá um nome ao arquivo e ao botão, e ele aparece no portal."],
  ],
};

export const Route = createFileRoute("/portal-do-cliente")({
  head: () => pageHead({ path: "/portal-do-cliente", title: "Central do Cliente | Wiize Recebe", description: "Um portal com sua marca para o cliente baixar recibos, ver contratos e documentos e pagar cobranças.", ogDescription: "Seu cliente com recibos, contratos e documentos na palma da mão.", breadcrumb: [{ name: "Central do cliente", path: "/portal-do-cliente" }] }),
  component: () => <ResourcePage config={config} />,
});
