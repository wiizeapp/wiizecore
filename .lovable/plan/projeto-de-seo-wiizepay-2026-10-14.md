# Projeto de SEO — WiizePay

## Diagnóstico inicial (já verificado)
- O site já é renderizado no servidor: títulos, textos e links chegam prontos para o Google.
- Quase todas as páginas públicas têm título e descrição próprios, mas só `/sobre` tem endereço oficial (canonical). Nenhuma página tem dados estruturados.
- Não existe `sitemap.xml` nem `llms.txt`; o `robots.txt` libera tudo, sem apontar sitemap.
- Páginas privadas (painel, links de pagamento, contratos, portal, convites, login técnico) não pedem "não indexar".
- O domínio oficial está em um único arquivo de configuração (`https://wiizepay.com`), o que permite padronizar tudo.
- Já existem páginas equivalentes às sugeridas: `/cobrancas-e-pagamentos`, `/gestao-financeira`, `/gestao-de-clientes`, `/portal-do-cliente`, `/suporte`, `/taxas`, `/sobre`, `/auth`. Vou reutilizá-las em vez de criar cópias.

## O que será feito

**1. Base comum de SEO**
- Um único utilitário que monta título, descrição, endereço oficial, Open Graph e Twitter de cada página a partir da configuração da marca e do domínio.
- Dados da empresa (Organization + WebSite + SoftwareApplication) só com informações confirmadas: nome, site, logo, descrição e e-mail de contato. Sem avaliações, preços ou números inventados.

**2. Páginas públicas**
- Revisar título, descrição, H1 único e canonical de todas as páginas públicas (início, sobre, taxas, recursos, políticas, suporte, segurança, prazos).
- Breadcrumb (caminho de navegação) nos dados estruturados das páginas internas.
- Página inicial com título "WiizePay | Plataforma de Pagamentos e Gestão Unificada".

**3. Novos endereços curtos (sem conteúdo duplicado)**
- `/plataforma-de-pagamentos`, `/gestao-de-cobrancas`, `/central-do-cliente`, `/contato`, `/entrar`, `/criar-conta` redirecionam permanentemente (301) para as páginas que já existem. Nada é duplicado e o login/cadastro continuam iguais.

**4. Perguntas frequentes**
- Nova página `/perguntas-frequentes` com respostas verdadeiras baseadas nos recursos reais (o que é a WiizePay, diferença entre gateway e plataforma integrada, taxas, acesso, portal do cliente, infraestrutura Asaas). Textos traduzidos para EN/ES.

**5. Proteção das páginas privadas**
- Marcar como "não indexar" painel, pagamento, assinatura, portal individual, convites, ativação, OAuth, redefinição de senha e verificação.

**6. Arquivos para buscadores e IAs**
- `/sitemap.xml` gerado automaticamente a partir das páginas públicas, sem datas falsas.
- `robots.txt` apontando o sitemap e bloqueando áreas técnicas (sem bloquear estilos/scripts).
- `/llms.txt` com resumo honesto da marca e links para as páginas oficiais.

**7. Rodapé e links internos**
- Garantir links reais no rodapé para Sobre, Taxas, Recursos, Perguntas frequentes, Suporte e Entrar (ajuda nos sitelinks).

**8. Documentação**
- Guia em `docs/seo.md`: Google Search Console, Bing, envio do sitemap, acompanhamento de cliques/impressões e o que depende de ação sua.

## Fora do escopo / limitações
- Não altero pagamentos, login, banco de dados nem visual.
- Não crio artigos de blog (precisariam de autor e datas reais).
- Medição de velocidade real (Core Web Vitals) depende do site publicado; farei apenas checagens locais e direi isso claramente.
- Imagem de compartilhamento: uso a logo oficial existente; uma imagem 1200x630 dedicada só se você aprovar.
- Verificação no Google/Bing exige sua conta — não invento códigos.

## Detalhes técnicos
- `src/lib/seo.ts` (helper `pageHead`, JSON-LD), domínio de `DEPLOY_CONFIG.publicSiteUrl`.
- Redirecionamentos via `beforeLoad` + `redirect({ statusCode: 301 })`.
- Sitemap via rota servidor `src/routes/sitemap[.]xml.ts` seguindo a receita oficial.
- `noindex` no `head()` de cada rota privada e no layout `_authenticated`.
- Validação: build, Playwright nas rotas principais (status, title único, canonical, JSON-LD parseável), testes existentes.
