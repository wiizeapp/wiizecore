import { pageHead } from "@/lib/seo";
import { createFileRoute } from "@tanstack/react-router";
import { Mail, MessageCircle, ReceiptText, ShieldCheck } from "lucide-react";
import { PublicPage } from "@/components/public-site";
import { Button } from "@/components/ui/button";
import { BRAND_CONFIG, supportMailto } from "@/lib/brand-config";

export const Route = createFileRoute("/suporte")({
  head: () => pageHead({ path: "/suporte", title: "Contato e Suporte | WiizePay", description: "Entre em contato com o suporte do WiizePay para dúvidas sobre a conta e pagamentos.", ogDescription: "Ajuda para sua conta, cobranças e pagamentos.", breadcrumb: [{ name: "Suporte", path: "/suporte" }] }), component: SuportePage,
});

function SuportePage() {
  return <PublicPage><main className="section-shell py-16 lg:py-24"><p className="text-xs font-bold uppercase text-primary">Suporte</p><h1 className="mt-3 text-4xl font-semibold sm:text-5xl">Como podemos ajudar?</h1><p className="mt-4 max-w-2xl text-lg leading-8 text-muted-foreground">Fale com a equipe WiizePay usando nosso único canal oficial de atendimento.</p><div className="mt-12 grid gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-3"><SupportItem icon={ReceiptText} title="Pagamentos" text="Dúvidas sobre cobranças, confirmações, estornos ou reembolsos." /><SupportItem icon={ShieldCheck} title="Privacidade" text="Solicitações sobre dados pessoais e exercício de direitos." /><SupportItem icon={MessageCircle} title="Conta e produto" text="Ajuda com acesso, configuração e uso do WiizePay." /></div><div className="mt-10 border-l-2 border-primary pl-6"><p className="text-sm text-muted-foreground">E-mail oficial</p><a className="mt-1 block text-xl font-semibold text-primary" href={supportMailto("Atendimento WiizePay")}>{BRAND_CONFIG.contactEmail}</a><p className="mt-3 max-w-lg text-sm leading-6 text-muted-foreground">Não oferecemos atendimento por telefone ou WhatsApp neste momento. Descreva sua dúvida e, se for sobre um pagamento, informe o identificador exibido no comprovante.</p><Button asChild className="mt-5"><a href={supportMailto("Atendimento WiizePay")}><Mail className="h-4 w-4" />Falar com o suporte</a></Button></div></main></PublicPage>;
}

function SupportItem({ icon: Icon, title, text }: { icon: typeof Mail; title: string; text: string }) { return <div className="bg-background p-6"><Icon className="h-5 w-5 text-primary" /><h2 className="mt-5 font-semibold">{title}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p></div>; }