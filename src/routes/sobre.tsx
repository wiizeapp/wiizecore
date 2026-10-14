import { pageHead } from "@/lib/seo";
import { createFileRoute } from '@tanstack/react-router';
import { AboutPage } from '@/components/institutional/about-page';
import { DEPLOY_CONFIG } from '@/lib/deploy-config';

export const Route = createFileRoute('/sobre')({
  head: () => pageHead({ path: "/sobre", title: "Sobre a WiizePay | Pagamentos e Gestão Integrados", description: "Conheça a visão da WiizePay: conectar clientes, contratos, cobranças e documentos, com autonomia para o cliente e transparência sobre a infraestrutura de pagamentos.", ogDescription: "Menos fragmentação na gestão. Mais simplicidade em cada cobrança. Conheça a plataforma e a infraestrutura que apoiam essa visão.", breadcrumb: [{ name: "Sobre a WiizePay", path: "/sobre" }] }),
  component: AboutPage,
});
