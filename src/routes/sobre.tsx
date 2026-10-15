import { pageHead } from "@/lib/seo";
import { createFileRoute } from '@tanstack/react-router';
import { AboutPage } from '@/components/institutional/about-page';

export const Route = createFileRoute('/sobre')({
  head: () => pageHead({ path: "/sobre", title: "Sobre a Wiize Recebe | Pagamentos e Gestão Integrados", description: "Conheça a visão da Wiize Recebe: conectar clientes, contratos, cobranças e documentos, com autonomia para o cliente e transparência sobre a infraestrutura de pagamentos.", ogDescription: "Menos fragmentação na gestão. Mais simplicidade em cada cobrança. Conheça a plataforma e a infraestrutura que apoiam essa visão.", breadcrumb: [{ name: "Sobre a Wiize Recebe", path: "/sobre" }] }),
  component: AboutPage,
});
