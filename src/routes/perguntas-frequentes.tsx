import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicPage } from "@/components/public-site";
import { faqJsonLd, pageHead } from "@/lib/seo";
import { BRAND_CONFIG } from "@/lib/brand-config";

export const FAQS: Array<[string, string]> = [
  ["O que é a Wiize Core?", "A Wiize Core é uma plataforma de software para prestadores de serviços que reúne pagamentos, cobranças, clientes, contratos e gestão financeira em um só lugar."],
  ["A Wiize Core é um banco?", "Não. A Wiize Core é uma plataforma de software. O processamento dos pagamentos e a guarda dos valores são feitos pela infraestrutura de pagamentos parceira (Asaas), por meio de uma conta vinculada à sua empresa."],
  ["Qual a diferença entre um gateway de pagamento e uma plataforma de gestão integrada?", "Um gateway apenas processa pagamentos. A Wiize Core conecta o pagamento ao cliente, ao contrato, à cobrança e ao financeiro da empresa, para que tudo fique organizado no mesmo histórico."],
  ["Quais formas de pagamento posso oferecer?", "Pix, Pix Automático, boleto e cartão de crédito, conforme a ativação da sua conta."],
  ["Quais são as taxas da Wiize Core?", "Não há mensalidade. Você paga por pagamento recebido, de acordo com a forma de pagamento. Os valores atualizados ficam na página de taxas, que mostra a tabela oficial vigente."],
  ["Como funciona a gestão de cobranças?", "Você cria cobranças avulsas, parceladas ou recorrentes, acompanha o status de cada uma e pode ativar lembretes automáticos de vencimento."],
  ["Como funciona a central do cliente?", "Seu cliente acessa o portal com e-mail e CPF/CNPJ completos para consultar e pagar cobranças, baixar recibos, notas fiscais autorizadas, contratos e documentos disponibilizados pela sua empresa."],
  ["Como acesso a Wiize Core?", "Pela página Entrar, com e-mail e senha. Novas empresas criam a conta na mesma página e depois ativam o recebimento enviando os dados solicitados."],
  ["Como falo com o suporte?", `Pelo e-mail oficial ${BRAND_CONFIG.contactEmail}. No momento não há atendimento por telefone ou WhatsApp.`],
];

export const Route = createFileRoute("/perguntas-frequentes")({
  head: () => pageHead({
    path: "/perguntas-frequentes",
    title: "Perguntas Frequentes | Wiize Core",
    description: "Respostas sobre a Wiize Core: o que é, taxas, formas de pagamento, gestão de cobranças, central do cliente, acesso e suporte.",
    breadcrumb: [{ name: "Perguntas frequentes", path: "/perguntas-frequentes" }],
    jsonLd: [faqJsonLd(FAQS)],
  }),
  component: FaqPage,
});

function FaqPage() {
  return (
    <PublicPage>
      <main className="section-shell py-16 lg:py-24">
        <p className="text-xs font-bold uppercase text-primary">Perguntas frequentes</p>
        <h1 className="mt-3 text-4xl font-semibold sm:text-5xl">Dúvidas sobre a Wiize Core</h1>
        <p className="mt-4 max-w-2xl text-lg leading-8 text-muted-foreground">Respostas diretas sobre pagamentos, cobranças, taxas, acesso e atendimento.</p>
        <div className="mt-12 grid max-w-3xl gap-4">
          {FAQS.map(([q, a]) => (
            <section key={q} className="rounded-xl border border-border bg-card p-6">
              <h2 className="text-lg font-semibold">{q}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{a}</p>
            </section>
          ))}
        </div>
        <nav aria-label="Páginas relacionadas" className="mt-10 flex flex-wrap gap-4 text-sm font-medium text-primary">
          <Link to="/taxas" className="hover:underline">Ver taxas</Link>
          <Link to="/cobrancas-e-pagamentos" className="hover:underline">Plataforma de pagamentos</Link>
          <Link to="/portal-do-cliente" className="hover:underline">Central do cliente</Link>
          <Link to="/auth" className="hover:underline">Entrar ou criar conta</Link>
        </nav>
      </main>
    </PublicPage>
  );
}
