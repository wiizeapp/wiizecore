# Correção de saldo segura antes da aplicação

## Resultado esperado

Aplicar uma correção completa de antecipação e estorno no banco conectado **somente após passar nos testes de compatibilidade e segurança**. Não publicar, alterar segredos ou movimentar dinheiro real.

## Por que o candidato atual não pode ser aplicado

- Não inclui a correção da conclusão de antecipação; os testes anteriores dependem de outro arquivo instalado primeiro.
- Pode bloquear recusas legítimas do provedor e deixar reservas presas.
- Não elimina duplicidade de envio e contém ordem de travas incompatível com estornos de coprodução.

## Etapas

1. Criar uma única correção coordenada de saldo, reservas e envio exclusivo de operações; preservar valores históricos.
2. Ajustar confirmação e reconciliação para diferenciar operação nunca enviada, recusa oficial e resposta desconhecida.
3. Testar no esquema completo descartável: split 100/estorno 40/restante 60, antecipação com reserva, estorno parcial/total, repetição, concorrência, falhas de persistência e isolamento entre empresas. Nenhum teste negativo no banco compartilhado.
4. Se os testes passarem, aplicar pela ferramenta oficial e confirmar funções, triggers, RLS e permissões no banco conectado. Se houver bloqueio, não aplicar e registrar a causa.
5. Entregar os arquivos e resultados; manter publicação e teste real com Asaas pendentes, separados dos testes locais.

## Detalhes técnicos

- RPCs transacionais com ordem global de locks payment → operações/splits → wallets, revisada em todos os escritores envolvidos.
- Claim durável de submissão e resultados vinculados à operação/conexão; não confiar apenas em um event ID diferente.
- Dinheiro em NUMERIC/Decimal; RPCs financeiras service-only; sem escrita ordinária em saldo ou concessão de privilégios para testes.
- Uma migration autoritativa substitui os candidatos de documentação; validar com schema/triggers integrais, não somente fixture mínima.
- A verificação atual passou 33 testes de handlers e a fixture mínima; não comprova RLS autenticado A/B, fluxo Asaas, restauração ou segurança de 100%.