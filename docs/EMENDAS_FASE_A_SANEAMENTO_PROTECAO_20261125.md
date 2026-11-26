# PACTO · Emendas Parlamentares · Fase A — Saneamento e proteção

**Data do levantamento:** 25/11/2026.  
**Fonte de dados:** banco Supabase ativo do projeto Lovable “Gestão de Empenhos” (PACTO); consultas exclusivamente `SELECT` via conector do projeto.  
**Código-base:** `main` do repositório `bruvini/pacto-joinville`, em 25/11/2026.

## 1. Escopo e limites da evidência

Esta fase inventaria e protege a execução financeira existente antes de alterar a cardinalidade de NEs, competências, subempenhos e pagamentos nas fases posteriores. **Nenhum lançamento, documento, NE, valor ou registro do banco foi alterado durante o levantamento.**

O conector do Lovable atingiu seu limite temporário de consultas depois das contagens, inventário de esquema, integridade e histórico. Assim, não foi possível executar validação transacional de novas regras no banco nem conferir backup/restauração. O PR prepara a mudança; **não comprova instalação nem homologação na base produtiva**.

Os saldos do PACTO representam dados cadastrados e não dispensam conciliação com e-Pública, SEI e extratos externos. Não publicar snapshots completos, UUIDs pessoais, assinaturas ou documentos SEI em repositório público.

## 2. Fotografia do banco (25/11/2026)

| Objeto | Registros exatos |
| --- | ---: |
| emendas | 1 |
| emenda_lancamentos | 1 |
| emenda_lancamento_meses | 1 |
| emenda_competencias | 1 |
| emenda_competencias_filhas | 1 |
| emenda_solicitacoes | 1 |
| emenda_etapas_documentais | 2 |
| emenda_assinaturas_conferidas | 5 |
| emenda_pareceres_financeiros | 1 |
| emenda_envios_sefaz | 1 |
| emenda_fluxo_documentos | 2 |
| emenda_fluxo_assinaturas | 3 |
| emenda_comprovantes | 0 |
| emenda_liberacoes | 0 |
| emenda_blocos_pagamento | 0 |
| emenda_anulacoes | 0 |
| emenda_conciliacoes_ne | 0 |
| emenda_encerramentos_sem_execucao | 0 |
| emenda_documentos | 0 |
| emenda_fontes | 0 |
| emenda_ajustes_valor | 0 |
| emenda_historico | 70 |

As 22 tabelas `emenda*` inspecionadas possuíam RLS habilitada. A consulta de contagens usa `count(*)`, não estatística estimada.

**Registro atual:** emenda **42510002/2026**, situação `ativa`. Valor original R$ 500.000,00; rendimento R$ 10.000,00; limite cadastral R$ 510.000,00. Uma NE de R$ 510.000,00 registrada, lançamento `emitido`, período mensal, competência 10/2026 e parcela 57; uma competência-filha. Nenhuma liberação, pagamento ou anulação lançados. Esses dados não demonstram inexistência de atos externos.

**Integridade:** dez verificações executadas tiveram resultado zero: lançamento sem solicitação válida, solicitação de outra emenda, mês de outra emenda, mês com competência inválida, filha de outra emenda, documento com emenda incompatível, documento de liberação sem mês, liberação órfã, pagamento sem liberação e NE emitida sem valor válido.

## 3. Histórico legado relevante

Os 70 eventos da tabela `emenda_historico` incluem **dois eventos `DELETE` de `emenda_lancamentos` que se referem ao mesmo identificador**, ambos datados de 29/10/2026. Um registro contém snapshot ampliado com `lancamento.status = emitido` e um documento do fluxo; não inclui pagamentos. **Não equivale à exclusão de dois lançamentos distintos.**

A função atualmente instalada `public.emenda_excluir_lancamento(uuid)` foi lida por `pg_get_functiondef`; possui `SECURITY DEFINER`, checagem de papel ACP/Admin e execução autorizada para `authenticated`. A definição corresponde ao fluxo de exclusão definitiva de 29/10/2026: registra snapshot forense e remove a cadeia operacional. Hash MD5 observado da definição instalada: `2f7f4f778e7f66e7939097311b479000`. O snapshot em histórico não substitui a restauração operacional de um registro.

**Risco confirmado:** uma NE documentada pode ser fisicamente removida do controle do PACTO e deixar de figurar nos indicadores, embora o ato externo permaneça. A existência de evento histórico em estado `emitido` confirma a necessidade de proteção.

## 4. Matriz de preservação para exclusão definitiva

| Condição do lançamento | Tratamento proposto |
| --- | --- |
| Rascunho sem atos posteriores, sem confirmação de dotação, sem assinatura ou parecer | Exclusão definitiva permitida, com registro de auditoria |
| Rascunho com dotação ainda não confirmada, sem outros atos | Exclusão permitida |
| Rascunho com dotação confirmada, parecer, assinatura ou documentos do fluxo | Bloquear exclusão; exigir tratamento administrativo |
| Solicitação formalizada/encaminhada | Bloquear exclusão; cancelar ou retificar formalmente em fluxo futuro |
| NE emitida ou lançamento `emitido` | Bloquear exclusão; preservar NE e todas as vinculações |
| Comprovante, liberação, pagamento, anulação, conciliação ou encerramento | Bloquear exclusão, independentemente do status apresentado |
| Lançamento já excluído logicamente | Bloquear nova exclusão |

**Importante:** esta fase **não cria um novo fluxo de cancelamento de NE** nem altera o registro no SEI/e-Pública. O tratamento de casos formalizados deve permanecer administrativo e explícito, sem exclusão física.

## 5. Entregas técnicas nesta branch

1. **Migration proposta:** `supabase/migrations/20261125170000_emendas_fase_a_protecao_exclusao.sql`. Reinstala a RPC original preservando snapshots e historização, porém valida primeiro status, solicitação e atos documentais/financeiros sob bloqueio de linha; usa `RAISE EXCEPTION` antes de qualquer deleção quando há compromisso. Acrescenta trigger `BEFORE DELETE` sobre `emenda_lancamentos` para impedir exclusão física direta de lançamento não rascunho ou vinculado a solicitação.
2. **Interface:** botão de exclusão habilitado apenas quando o rascunho parece livre de atos, mantendo validação independente na RPC. Nenhuma NE ou pagamento será excluído pelo fluxo normal depois da migration. 
3. **Testes:** `protecao-exclusao.test.ts` e adequação dos testes estáticos das migrations anteriores; novas regras não reescrevem migrations históricas.
4. **Inventário reproduzível:** `scripts/emendas-fase-a-inventario-readonly.sql`; executar antes e depois da implantação, armazenando os resultados em local institucional controlado.

O código na branch **não equivale a alteração aplicada no banco de produção**. A interface com proteção apenas visual não pode ser considerada barreira financeira sem a RPC correspondente.

## 6. Implantação sem perda de histórico

### Preflight e preparação

1. Confirmar que a `main` e o banco operacional ainda possuem as versões inspecionadas; o conector Lovable não garante que migrations versionadas foram aplicadas apenas por existirem no GitHub.
2. Validar backup atual e **teste real de restauração em ambiente separado**. Backups diários defasados ou apenas `pg_restore --list` não bastam. Registrar data/hora, escopo e responsável.
3. Executar `scripts/emendas-fase-a-inventario-readonly.sql` e guardar contagens, saldos, histórico e hash da função, sem copiar dados sensíveis ao GitHub.
4. Preparar ambiente de homologação com dados sintéticos, incluindo situações de cancelamento e rascunho.

### Homologação obrigatória antes de produção

1. Aplicar migration inteira, em transação, **somente na homologação** e validar presença de trigger/RPC.
2. Excluir rascunho sem atos, verificar perda apenas do rascunho e manutenção do snapshot de auditoria.
3. Tentar excluir rascunho com dotação confirmada, com parecer, com assinatura, com documento de fluxo, com envio, formalizado e com NE; **todos devem falhar sem nenhuma exclusão parcial**, inclusive por chamada direta da RPC.
4. Para lançamentos emitidos, tentar `DELETE` físico direto em transação que seja revertida e confirmar que trigger recusa; não testar contra dados reais em produção.
5. Testar papéis ACP/Admin autorizados e ACO/usuário não autorizado; apenas ACP/Admin devem poder excluir rascunho permitido.
6. Rodar testes automatizados e build; considerar as falhas legadas já existentes separadamente de regressões novas.

### Produção

Somente após homologação, backup restaurável e aprovação institucional, aplicar a migration e verificar sua versão/hash. **Publicar interface apenas depois que a RPC restritiva estiver vigente.** Reexecutar inventário e comparar contagens do instante anterior e posterior, com zero alterações financeiras esperadas por aplicação de DDL.

Se houver divergência, interromper operações e preservar os dados. Evitar `DROP`/reversão destrutiva; não reinstalar a RPC antiga permissiva como rollback. Uma incompatibilidade de interface pode ser tratada com rollback do frontend, mantendo a proteção do banco.

## 7. Dependências das fases seguintes

- **Fase B:** manter vínculo imutável da NE emitida a novos subempenhos e integrar novas tabelas à matriz de exclusão/proteção.
- **Fase C:** validar competências multimeses sem inferir valores executados.
- **Fases D/E:** vincular avisos e pagamentos aos subempenhos, não a documentos com contexto único por competência.
- **Fase F:** implementar cancelamento, retificação, anulação e reconciliação com estados formais, sem permitir exclusões destrutivas.

**Ponto de controle:** antes de criar qualquer nova tabela de movimentação financeira, atualizar a RPC de exclusão, o guard correspondente e os testes de preservação para incluir os novos relacionamentos.
