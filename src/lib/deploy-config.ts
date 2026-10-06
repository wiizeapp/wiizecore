/**
 * Endereços que mudam entre ambientes (teste / produção).
 * Ao copiar o projeto, ajuste somente este arquivo.
 */
export const DEPLOY_CONFIG = {
  /** Endereço público oficial do site WiizePay. */
  publicSiteUrl: "https://wiizepay.com",
  /** Endereço estável usado quando o pedido vem do preview/localhost (avisos do Asaas). */
  stableFallbackUrl:
    "https://project--8edc01d5-8e9e-4cd9-bcf6-085c3e825be4-dev.lovable.app",
  /** Endereço que recebe avisos enviados ao Wiize CRM. */
  wiizeWebhookUrl:
    "https://wgokhkawjdxsmvfuhazb.supabase.co/functions/v1/wiize-pay-webhook",
  /** Endereços de retorno permitidos no login OAuth do Wiize CRM. */
  wiizeRedirectUris: [
    "https://wiize.com.br/configuracoes/integracoes/wiize-pay/callback",
    "https://www.wiize.com.br/configuracoes/integracoes/wiize-pay/callback",
    "https://wiize-lb2.lovable.app/configuracoes/integracoes/wiize-pay/callback",
  ],
} as const;
