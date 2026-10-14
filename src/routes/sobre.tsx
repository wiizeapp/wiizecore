import { createFileRoute } from '@tanstack/react-router';
import { AboutPage } from '@/components/institutional/about-page';
import { DEPLOY_CONFIG } from '@/lib/deploy-config';

export const Route = createFileRoute('/sobre')({
  head: () => ({
    meta: [
      { title: 'Sobre nós — WiizePay | Gestão e pagamentos conectados' },
      { name: 'description', content: 'Conheça a visão da WiizePay: conectar clientes, contratos, cobranças e documentos, com autonomia para o cliente e transparência sobre a infraestrutura de pagamentos.' },
      { property: 'og:title', content: 'Sobre nós — WiizePay' },
      { property: 'og:description', content: 'Menos fragmentação na gestão. Mais simplicidade em cada cobrança. Conheça a plataforma e a infraestrutura que apoiam essa visão.' },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary_large_image' },
    ],
    links: [{ rel: 'canonical', href: new URL('/sobre', DEPLOY_CONFIG.publicSiteUrl).href }],
  }),
  component: AboutPage,
});
