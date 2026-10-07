# Cabeçalhos de segurança e DNS — WiizePay (07/10/2026)

Regras no código: `src/lib/security-headers.ts` (aplicadas em `src/start.ts` a páginas, funções do servidor e APIs). Arquivos estáticos: `vercel.json`.

## Exceções documentadas
- `script-src 'unsafe-inline'`: o SSR do TanStack Start injeta scripts de hidratação inline e o `__root.tsx` tem o script de tema inicial. Para remover: gerar nonce por requisição e repassá-lo ao router (`ssr.nonce`) e ao script de tema.
- `style-src 'unsafe-inline'`: atributos `style` do React, Radix UI e Sonner. Remoção exigiria refatorar esses componentes.
- `unsafe-eval`: não usado.
- COEP não aplicado: exigiria CORP/CORS em Google Tag Manager, Meta Pixel, fontes Google, fotos de perfil Google e URLs assinadas do armazenamento; quebraria rastreamento e imagens. O site não usa SharedArrayBuffer, então não há ganho.
- Preview/editor (localhost, *.lovable.app): CSP completa em modo monitoramento (Report-Only) e moldura liberada só para o editor; produção aplica a CSP completa, `X-Frame-Options: SAMEORIGIN` e `COOP: same-origin`.
- `Server: Vercel` e `x-vercel-id` são inseridos pela hospedagem depois da aplicação; não é possível removê-los pelo código.

## DNS (wiizepay.com — DNS na Hostinger, site na Vercel, e-mail via Resend)
Observado em 07/10/2026: sem SPF na raiz, sem MX na raiz, DKIM `resend._domainkey` presente, SPF/MX em `send.wiizepay.com` (Resend), DMARC `p=none`, sem CAA, sem DNSSEC, certificado Let's Encrypt.

| Tipo | Host | Valor |
|---|---|---|
| TXT (SPF) | `@` | `v=spf1 -all` (a raiz não envia e-mail; o Resend usa `send`). Se adotar Google Workspace: `v=spf1 include:_spf.google.com -all` |
| TXT (DMARC fase 1) | `_dmarc` | `v=DMARC1; p=none; rua=mailto:wiizepay@gmail.com; adkim=s; aspf=r` |
| DMARC fase 2 (após 2–4 semanas sem falhas) | `_dmarc` | `v=DMARC1; p=quarantine; pct=100; rua=mailto:wiizepay@gmail.com; adkim=s; aspf=r` |
| DMARC fase 3 | `_dmarc` | `v=DMARC1; p=reject; rua=mailto:wiizepay@gmail.com; adkim=s; aspf=r` |
| CAA | `@` | `0 issue "letsencrypt.org"` |
| CAA | `@` | `0 issuewild ";"` |
| CAA | `@` | `0 iodef "mailto:wiizepay@gmail.com"` |

DNSSEC: hPanel Hostinger → Domínios → wiizepay.com → DNS / Nameservers → DNSSEC → Ativar (com os nameservers da Hostinger o DS é publicado automaticamente).
