/** Public provider identity; official individualised assets must stay remote and unchanged. */
export const FINANCIAL_PROVIDER = {
  name: "Asaas",
  site: "https://asaas.com",
  email: "contato@asaas.com.br",
  phone: "0800 009 0037",
  phoneHref: "tel:08000090037",
  supportHref: "mailto:contato@asaas.com.br",
  seals: {
    positive: "https://baas.asaas.com/selos/Servicos_financeiros_Asaas-Reduzida-Positivo.svg?id=06c8be61-1052-4d22-840b-54dde2ecf134",
    black: "https://baas.asaas.com/selos/Servicos_financeiros_Asaas-Reduzida-Negativo-Preto.svg?id=06c8be61-1052-4d22-840b-54dde2ecf134",
    white: "https://baas.asaas.com/selos/Servicos_financeiros_Asaas-Reduzida-Negativo-Branco.svg?id=06c8be61-1052-4d22-840b-54dde2ecf134",
  },
} as const;