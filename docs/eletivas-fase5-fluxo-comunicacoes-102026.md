# Fase 5 — Auditoria operacional e comunicações · HTML v2.42.2

Referência: **Auditoria - Cirurgias Eletivas - 102026.html**, SHA-256 `75494e80e28fc59596e43a2ba0fb7a0caf9a50bafbd3a5f4c94dd95a22fe7186`. Regras extraídas de `communicationSuggestedDestination`, `setAihCommunication`, `queueRegularizationCommunication`, `reopenCommunication`, `markCommunicationsSent`, `gemasEcCurrentData`, `buildCentralDraft`, `buildGemasDraft`, `REG_STEPS`, `regStartFlow`, `updateRegFlow`, `correctionsForRegFlow` e `syncRegFlowFromCorrections`.

## Arquitetura escolhida

**Não recriar Fila ou Decisões:** abas `Painel financeiro` e `Conciliação e decisões` já têm filtros `Itens conciliados`, `Fila de auditoria`, dossiês por AIH e `ec_decidir_item` com justificativa, versionamento, conflito otimista e revisão. A tabela `eletivas_correcoes` já contém `competencia_origem`, `aihs`, `referencia_origem`, documento SEI, fingerprint e uma restrição parcial para impedir que a mesma correção aprovada gere dois créditos. A Fase 5 usa tudo isso, sem criar tabelas paralelas para itens, decisões ou correções.

**Persistência operacional institucional:** o HTML guarda comunicações e fluxos FPO no `localStorage` por CNES. Como o Pacto é multiusuário/institucional, migramos estados para cinco tabelas específicas com RLS somente-leitura e escrita EXCLUSIVAMENTE pelas funções autenticadas ACP/Admin:

1. `eletivas_fpo_fluxos`: AIH, item original, competência, etapa (1–8), valor ESTIMADO (nunca somado) e versão otimista.
2. `eletivas_fpo_fluxos_eventos`: etapas, documentos/SEI, autoria, data e reaberturas sem apagar acontecimentos anteriores.
3. `eletivas_fpo_vinculos`: correção aprovada recebida em competência posterior, vinculada 1:1 ao fluxo de origem. **Não altera o valor de `eletivas_correcoes` nem a contabiliza de novo.**
4. `eletivas_comunicacoes`: fila única por competência/tipo/caso, destino, status e assinatura derivada dos dados vigentes; UNIQUE parcial por AIH e competência.
5. `eletivas_comunicacoes_eventos`: histórico imutável dos destinos, envios, comprovantes e reaberturas.

As tabelas não substituem `eletivas_eventos`, `eletivas_decisoes_revisoes` nem os lançamentos do Convênio.

## Regras do HTML preservadas

**Central de Regulação:** AIHs com faixa/composição `bad` ou `review`, destino sugerido `regulacao`; a Central confirma adequação da distribuição e procedimento principal/filhos. Encaminhamento consolidado por competência e destino, não um e-mail para cada AIH.

**FPO interno:** `fpo` inicia tratamento interno; não se encaminha automaticamente à GEMAS por existir previsão na FPO oficial. O fluxo tem oito etapas: (1) FPO a corrigir; (2) FPO corrigida; (3) competência reprocessada; (4) aguardando aprovação; (5) produção aprovada; (6) solicitar revisão à GEMAS; (7) aguardando correção no EC; (8) correção recebida/encerrado. A mudança de etapa exige justificativa; a partir da etapa 2, evidência documental. Oito só ocorre por correção recebida aprovada e vinculada, integralmente comprovada em relação à estimativa; se parcial, fica em 7. Reabertura de etapa inferior exige justificativa e mantém histórico.

**GEMAS regularização:** um fluxo FPO somente é elegível para comunicação quando a produção está comprovadamente na etapa 5, 6 ou 7. O estado 8 deixa de estar na fila. A minuta registra valores **estimados, não reconhecidos**.

**GEMAS Encontro de Contas:** decisões `oficio` e `analise` da competência geram uma minuta consolidada. Diferença a cobrar somente corresponde a `expected-payValue` para ofício, com exceção de envelopes; um item em análise é comunicação técnica e não crédito líquido. A assinatura do conjunto de decisões permite bloquear registro de envio caso alguma decisão/justificativa tenha sido alterada desde a formação da fila.

**Deduplicação e prova de envio:** uma mesma AIH só pode ter um registro de comunicação na competência. Registros já enviados não voltam à fila por simples clique; reabertura exige justificativa de pelo menos 15 caracteres. O servidor registra assunto, protocolo/SEI, autor, data e hash do conteúdo do lote. O usuário copia o e-mail e encaminha pelo correio institucional; **o sistema NÃO envia e-mails nem afirma que foram enviados sem confirmação explícita do fiscal**.

## SQL obrigatório no Lovable

Execute no banco real, após todas as migrations já aplicadas das Fases 0–4:

1. [Migration Fase 5](../supabase/migrations/20261016220000_eletivas_fase5_fluxo_comunicacoes.sql) — cria cinco tabelas, RLS e RPCs. Uma transação: qualquer erro implica rollback.
2. [Verificação somente leitura](../supabase/tests/20261016221000_eletivas_fase5_verificacao.sql) — checa tabelas, RLS, permissões e contadores de fluxo.

**A aplicação da migration não foi realizada automaticamente.** A conexão Supabase disponível neste chat não corresponde ao banco do Pacto-Lovable.

## Homologação guiada no aplicativo

1. Atualize o Lovable para o último commit; abra `Encontro de Contas → 07/2026 → Comunicações e FPO`. Confira os quatro indicadores e as quatro áreas: casos, FPO, fila e histórico.
2. Em `Casos de faixa / AIH`, abra um caso `bad` ou `review`, confirme o dossiê e selecione **Central de Regulação**; registre justificativa e salve. Confirme que reabrir a tela não duplica a AIH.
3. Em `Fila e minutas`, selecione dois casos da Central, gere UMA minuta consolidada com os dois; copie o assunto e corpo. Sem protocolo/SEI, não registre envio.
4. Se realmente enviou o e-mail institucional, informe o protocolo e marque como enviado. O sistema então bloqueia repetição; uma reabertura exigirá motivo de 15 caracteres. Se não enviou, deixe na fila.
5. Em `Regularização FPO`, escolha uma AIH de múltiplas/faixa, informe motivo e valor estimado; registre etapa 1. Tente avançar sem documento: deve bloquear; informe documento para avançar uma etapa por vez. Até a 4, GEMAS não recebe comunicação; na 5, a opção GEMAS surge.
6. Na competência subsequente, registre uma **correção recebida** no fluxo já existente `Relatórios e atesto`, com competência de origem correta, referência única e documento SEI. Aprovação fiscal segue `ec_revisar_correcao`. Retorne ao fluxo original e vincule a correção aprovada: deve aparecer o valor recebido sem somá-lo de novo; caso parcial, etapa 7.
7. Faça decisão `oficio` com diferença maior que R$ 0,02 e outra `analise` pela Fila de Auditoria. Abra `Comunicações e FPO → Fila e minutas → Preparar comunicação consolidada GEMAS`. Revise o texto, copie, envie por e-mail institucional e só então registre o protocolo.
8. Se uma decisão mudar após preparar a fila, o envio deve bloquear por assinatura divergente. Reprepare (se ainda não enviada) ou reabra com justificativa (se enviada).
9. Confira `Histórico de envios` e `Linha do tempo`. A comunicação e a regularização têm históricos individuais auditáveis, sem substituir a trilha fiscal existente.

## Limites de homologação e segurança

- Não foram enviados e-mails, alterados atestos, empenhos ou valores de lançamento.
- Valores estimados FPO nunca geram produção/pagamento nem são incluídos no atesto.
- Histórico de reenvios fica persistido, mas **protocolo e confirmação de envio dependem da declaração do servidor**. O sistema não consegue verificar o recebimento pelo destinatário sem conectores institucionais.
- Paridade com o HTML em correções/comunicações depende de confrontar fluxos e decisões com a mesma competência e AIHs reais; testes sintéticos não substituem homologação do fluxo de serviço.
- A migration está preparada para o SQL Editor, mas ainda precisa ser aplicada e testada na instância institucional. A validação de CI não substitui migrações no banco real.
