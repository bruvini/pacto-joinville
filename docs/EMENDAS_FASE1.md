# Emendas Parlamentares — Fase 1 · Cadastro e fundação

## Escopo entregue

A primeira fase cria um domínio próprio (`emendas*`), sem reutilizar `lancamentos_pagamento` como tabela financeira. A emenda tem identificação, autoria, modalidade, recurso de origem, objeto, finalidade, prestador vinculado, convênio/termo opcionais, proposta, processo SEI, periodicidade, competência inicial, prazo e exigência de atesto.

A interface inclui:
- `/emendas`: listagem, busca, filtros por exercício/situação e cadastro;
- `/emendas/$id`: visão geral, edição cadastral, documentos, fontes/dotações, ajustes formais e histórico;
- Matrizes relacionais: a instituição deve corresponder ao convênio; o termo deve pertencer ao convênio; o PostgreSQL rejeita vínculos incompatíveis.
- Documentos normativos, administrativos, de processos e financeiros: múltiplos registros independentes com número e link SEI, situação e data;
- Referências de dotações/fontes com exercício, valor de referência opcional e evidência SEI;
- Ajuste do valor autorizado exclusivamente por registro formal auditado e RPC autenticada, preservando valor-base imutável.

## Banco e segurança

Migration: `supabase/migrations/20261028171500_emendas_fase1_cadastro_fundacao.sql`.

| Recurso | Função |
|---|---|
| `emendas` | Cadastro/valor inicial imutável |
| `emenda_documentos` | Documentos múltiplos por emenda |
| `emenda_fontes` | Dotações/fontes e evidências |
| `emenda_ajustes_valor` | Ajustes assinados documentalmente; sem UPDATE/DELETE pela API |
| `emenda_historico` | Auditoria automática; sem UPDATE/DELETE pela API |
| `emendas_resumo` | View `security_invoker=true` para somar ajustes e valor vigente |
| `emenda_registrar_ajuste` | RPC com autorização ACP/Admin, bloqueio de linha e lançamento atômico |

Todas as tabelas do módulo usam RLS: leitura para `admin`, `acp`, `aco`; mutação de cadastro/documentos/fontes para `admin`, `acp`; histórico e ajustes somente leitura pela API. A RPC controla os ajustes positivos e negativos e registra documento SEI e justificativa. Não há exclusões silenciosas.

### Observação sobre migrações e tipos

Mantenha a migration versionada e os tipos Supabase sincronizados (`src/integrations/supabase/types.ts`). Para reproduzir em outro ambiente, aplique a migration pelo SQL Editor ou pelo pipeline de migrações. Use `npm run check:schema`, `npm test` e `npm run build`.

## O que NÃO existe nesta fase

- Solicitação de empenho, reserva de saldo, Nota de Empenho e competências filhas;
- Liberações, pagamentos, anulações e recomposição de saldo;
- Assinaturas por documento de execução, embora o cadastro já permita seus atos de referência;
- Dashboard de tramitação por etapa ou integração com sistemas externos.

Assim, o **limite autorizado vigente** é cadastral e não representa saldo disponível para novos empenhos. Nenhum valor foi rateado em competências. Não foi alterado nenhum módulo existente nem foram feitos registros simulados na produção.

## Próximas fases

2. Competência global, múltiplas solicitações/NE, filhos mensais/trimestrais/anuais e reservas transacionais;
3. Etapas de dotação, autorização, solicitação, assinaturas e NE, com documentação vinculada;
4. Liberações independentes e complementares por competência, atesto, pagamento interno e encerramento sem execução;
5. Anulação residual transacional e fechamento da nota;
6. Indicadores, controles, relatórios e homologação de concorrência.

### Referência reservada exclusivamente à homologação

Use ambiente de teste: Hospital Municipal São José; Convênio 107/2021/PMJ; emenda 42510002/2026; proposta 36000790627202600; R$ 510.000,00; dotação 1291; fonte 16003110; SEI 26.0.083102-3; competência 10/2026. **Não inserir dados fictícios em produção.**

## Observabilidade e risco

A interface reflete dados registrados no PACTO; não presume ato, assinatura, pagamento ou anulação efetivamente executados em sistemas externos. Autorização por RLS permanece obrigatória mesmo se uma funcionalidade não estiver visível no menu. A homologação deve validar novamente os acessos por papéis usando contas reais, sem dados operacionais simulados.
