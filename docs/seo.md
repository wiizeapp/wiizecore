# SEO — WiizePay

- Metadados públicos: `src/lib/seo.ts` (`pageHead`), domínio de `src/lib/deploy-config.ts`.
- Sitemap: `/sitemap.xml` (`src/routes/sitemap[.]xml.ts`, lista `PUBLIC_PATHS`). Atualize ao criar página pública.
- `public/robots.txt` e `public/llms.txt` usam o domínio oficial em texto; mude junto se o domínio mudar.
- Páginas privadas usam `noindex` no próprio `head()`; área interna também.
- Endereços curtos (/entrar, /criar-conta, /contato, /central-do-cliente, /plataforma-de-pagamentos, /gestao-de-cobrancas) fazem 301.

## Ações externas (dependem do dono)
1. Apontar o domínio `wiizepay.com` para o site publicado (hoje o site responde em outro endereço).
2. Google Search Console: verificar o domínio (DNS), enviar `https://wiizepay.com/sitemap.xml`, inspecionar `/`, `/sobre`, `/taxas`.
3. Bing Webmaster Tools: importar do Search Console.
4. Acompanhar: indexação, cliques, impressões, CTR, consultas e Core Web Vitals (dados reais só após tráfego).
5. Validar dados estruturados no Teste de pesquisa aprimorada do Google e no validator.schema.org após publicar.
