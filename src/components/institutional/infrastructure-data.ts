/** Public historical figures, not Wiize Core operating results. */
export const infrastructureData = {
  period: 2025,
  publishedAt: '2026-07-03',
  source: {
    url: 'https://blog.asaas.com/release/balanco-financeiro-asaas/',
    label: 'Consultar publicação dos resultados',
  },
  disclaimer: 'Os números apresentados referem-se aos resultados do exercício de 2025 da infraestrutura de pagamentos utilizada pela plataforma, divulgados em 2026. Eles não representam volume transacionado, receita ou lucro da Wiize Core.',
  metrics: [
    { id: 'volume', value: 67, previous: 43.5, prefix: 'R$', unit: 'bilhões', description: 'Volume total de pagamentos processados', growth: 54, source: 'https://blog.asaas.com/release/balanco-financeiro-asaas/' },
    { id: 'revenue', value: 563, previous: 339.5, prefix: 'R$', unit: 'milhões', description: 'Receita bruta anual da infraestrutura', growth: 64, source: 'https://blog.asaas.com/release/balanco-financeiro-asaas/' },
    { id: 'profit', value: 41, previous: 11.5, prefix: 'Mais de R$', unit: 'milhões', description: 'Lucro líquido reportado pela infraestrutura', source: 'https://blog.asaas.com/release/balanco-financeiro-asaas/' },
  ],
} as const;
