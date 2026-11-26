# PACTO Joinville — Emendas Parlamentares — Fase G
## Interface gerencial, indicadores, alertas, exportações e linha do tempo

**Data:** 26/11/2026. **Branch:** `feat/emendas-fase-g-interface-gerencial-20261126`.  
**Dependências:** Fases A–F instaladas e homologadas em banco; a Fase G não adiciona tabelas, RPCs nem migrations.

### 1. Base de referência

O pós-flight F fornecido pelo usuário confirmou:
- três views de fechamento, RPCs de anulação/conciliação e **16 gatilhos**;
- **nove verificações de integridade com resultado zero**;
- 1 emenda, 1 NE, 1 competência operacional pendente, 1 NE com residual para anular;
- 0 pagamentos, 0 subempenhos, 0 anulações e 0 NEs conciliadas.

Esses números representam o momento da extração. **Não são dados sintéticos da nova interface**. A Fase G deve mostrar corretamente a situação sem inventar parcelas ou percentuais de pagamento.

### 2. Reorganização da página

A tela do lançamento passa a ter:

1. **Nota de Empenho como referência:** número/exercício/SEI, situação e seis indicadores, com rótulo de escopo.
2. **Formalização:** passos documentais anteriores e assinaturas, preservados em seção expansível.
3. **Distribuição:** painel de alocação por competência da Fase C, sem rateio automático.
4. **Competências e subempenhos:** cada competência contém sua execução, saldo e lista de solicitações individualizadas; cada solicitação mantém as três subetapas da Fase D e os cartões de pagamento da Fase E.
5. **Anulação e conciliação:** fechamento da Fase F com atos SEI, documentos pendentes e saldo.
6. **Linha do tempo financeira:** eventos de `emenda_historico` filtrados por lançamento, links SEI quando extraídos dos registros e opção de consultar mais eventos anteriores.

A navegação usa âncoras internas, não altera o roteamento e não cria lançamentos automáticos.

### 3. Seis indicadores distintos

| Indicador | Origem | Escopo | Conceito |
|---|---|---|---|
| Autorizado vigente | `emendas_resumo.valor_autorizado_vigente` | Emenda | Valor autorizado com rendimentos e ajustes cadastrados |
| Reservado | `emendas_resumo.valor_reservado` | Emenda | Reservas das solicitações de NE, não subempenhos |
| Empenhado | `emendas_resumo.valor_empenhado` na visão geral; `emenda_f_ne_painel.valor_ne_emitida` na NE | Emenda ou NE | Notas efetivamente emitidas |
| Subempenhado | `emenda_f_ne_painel.subempenhos_confirmados_valor` | NEs do modelo novo | Avisos confirmados, sem somar liberações legadas |
| Programado | `emenda_pagamento_subempenhos_painel.valor_programado` | Subempenhos novos | Última programação vigente de cada parcela; versões antigas não se acumulam |
| Pago líquido | `emenda_f_ne_painel.pago_liquido_novo` ou `pago_legado` segundo modelo | Emenda ou NE | Pagamento real, líquido de devoluções/estornos no modelo novo |

**Nunca somar esses seis indicadores.** São conceitos de estágios diferentes. A programação não é pagamento, e a distribuição por competência não é um novo compromisso financeiro.

### 4. Alertas operacionais e evidências

O painel gerencial oferece filtros de tipo, prioridade e busca por NE, competência e documento SEI. Uma ocorrência pode ter mais de uma classificação se representar pendências diferentes; **a quantidade de alertas não equivale à quantidade de NEs**.

| Tipo | Critério resumido | Encaminhamento |
|---|---|---|
| NE sem utilização | Emitida, não conciliada, sem compromissos nem pagamentos nos dois livros | Conferir distribuição, execução pretendida ou anulação |
| Solicitação sem Aviso | Subempenho não cancelado sem documento `aviso_subempenho` concluído | Abrir subetapas, conferir assinaturas e encaminhamento |
| Aguardando pagamento | Aviso confirmado e nenhum pagamento líquido, com saldo positivo | Programar ou registrar pagamento real |
| Pagamento parcial | Pagamento líquido positivo e saldo a pagar ainda positivo | Registrar demais parcelas, manter conciliação pendente |
| Pago sem conciliação | Saldo a pagar zerado, mas conciliação individual ausente | Conferir SEI e registrar conciliação |
| Saldo potencialmente anulável | `saldo_disponivel_anular>0` na NE não conciliada | Analisar cabimento jurídico/financeiro e formalizar procedimento |
| Distribuição a rever | `saldo_a_anular_fechamento>saldo_disponivel_anular` | Reduzir apenas alocação não comprometida |
| Competência pendente sem movimento | Sem distribuição, subempenhos, liberação ou pagamento; status pendente | Verificar e, se verdadeiro, registrar sem execução com SEI |
| Documento pendente | Cadeia de subempenho com subetapa ainda sem conclusão | Conferir matrícula/assinatura/encaminhamento conforme matriz |
| Modelos conflitantes | NE com movimentos incompatíveis entre livros | Bloquear encerramento e realizar análise crítica |

Os alertas levam à NE correta e mostram link direto da evidência SEI quando disponível. **Ausência de link é mostrada como ausência de evidência vinculada**, jamais se fabrica URL.

### 5. Quatro exportações principais

- **Pendências filtradas CSV:** severidade, tipo, valores, NE, competência, SEI e identificadores de lançamento e subempenho.
- **NEs CSV:** valores e saldos reconciliados, situação, documentos e pendências por NE.
- **Competências CSV:** distribuição, compromissos, pagamentos, situação de execução e documento de encerramento sem execução.
- **Pagamentos CSV:** uma linha por parcela, separando programação, comprovante, devolução, estorno e líquido, com links SEI.

A linha do tempo da NE pode ser exportada em um **quinto CSV**, usando o conjunto de eventos carregados. O modal informa se existem páginas anteriores que ainda precisam ser carregadas.

CSV em UTF-8 com BOM, separador `;` e neutralização de conteúdos que poderiam ser interpretados como fórmula pelo Excel. Números são exportados em campos separados de descrições e evidências.

### 6. Segurança, limite de resultados e desempenho

O painel consulta somente views com `security_invoker` e tabelas já cobertas por RLS; não introduz novos privilégios. O carregamento de registros é paginado em páginas de 500, com limite de segurança explícito de 10.000 linhas por conjunto: se for ultrapassado, o relatório falha visivelmente em vez de exportar valores incompletos sem aviso.

A linha do tempo preserva o histórico da emenda. Como muitos eventos podem pertencer a outros lançamentos, a página consulta inicialmente os 500 registros mais recentes da emenda e permite carregar lotes anteriores, filtrando depois para o lançamento.

Não há automação de movimentações no e-Pública ou no SEI; as ações operacionais continuam subordinadas às RPCs e triggers das Fases B–F.

### 7. Testes obrigatórios

1. Uma emenda com apenas uma NE sem utilização mostra indicador pago zero, alerta NE sem utilização e saldo potencialmente anulável, sem apresentar pagamentos fictícios.
2. Uma mesma competência possui duas solicitações com sequências independentes; ambas ficam agrupadas na competência e acessíveis com documentos individuais.
3. Três competências mensais do mesmo lançamento permanecem distintas, mesmo em virada de exercício, sem rateio automático.
4. Aviso não concluído gera alerta mesmo que haja solicitação/encaminhamento documentado.
5. Aviso confirmado, programação registrada, nenhum pagamento efetivo: saldo programado >0 e pago líquido =0.
6. Pagamento parcial de R$ 30 mil sobre subempenho de R$ 60 mil: alerta de pagamento parcial e saldo a pagar R$ 30 mil.
7. Subempenho totalmente pago, sem conciliação: ainda há alerta de conferência; NE não fica concluída automaticamente.
8. Competência sem execução formalizada: deve exibir o documento SEI, não exigir comprovante de pagamento.
9. Emenda com duas NEs, uma concluída e outra pendente: consolidação permanece pendente.
10. Tabelas de ocorrências exportam documentos corretos, números SEI, identificadores, links HTTPS e não executam fórmulas injetadas em campos de texto.
11. Usuário com permissão apenas de consulta consegue visualizar o que o RLS permitir, sem registrar distribuição, Aviso ou pagamento.
12. Verificar carregamento com mais de 500 eventos e mais de 500 subempenhos; nenhuma ocorrência anterior pode desaparecer silenciosamente.
13. Confirmar atualização dos painéis depois de registrar atos de anulação, distribuição, subempenho e pagamento.
14. Abrir pelo painel gerencial o lançamento apontado por alerta e localizar sua competência e respectiva solicitação.

### 8. Implantação

Não há SQL de alteração. O arquivo `scripts/emendas-fase-g-postflight-readonly.sql` é uma **consulta diagnóstica opcional**, com um JSON que permite comparar as principais contagens de alertas diretamente nas views do banco.

A publicar: revisão do PR #82, validação de build/TypeScript/testes, homologação visual em ambiente segregado, conferência de permissões e publicação da interface depois de confirmar a instalação das Fases A–F.

**Não mesclar PRs em sequência fora de ordem:** A → B → C → D → E → F → G. Se uma branch anterior não estiver mesclada, manter a G baseada na F até a integração formal, evitando publicação de código antigo.
