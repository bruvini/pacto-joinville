# PACTO Joinville · Emendas Parlamentares · Fase H
## Plano de homologação, migração histórica conservadora, segurança e implantação controlada

**Data-base:** 26/11/2026 · **Equipe destinatária:** ACP / equipe fiscal e de controle de convênios · **Módulo:** Emendas.  
**Código:** `feat/emendas-fase-h-homologacao-controlada-20261126`, baseado na Fase G.  
**Situação:** KIT DE HOMOLOGAÇÃO PREPARADO; **não homologado funcionalmente e não implantado em produção pelo assistente**.

### 1. Ponto de partida e limitações

A Fase G apresentou todas as fontes disponíveis, sem modelos financeiros conflitantes e sem lançamentos executados. A leitura direta H0 no banco acessível ao projeto apontou:

| Indicador | Valor registrado |
|---|---:|
| Emendas / NEs emitidas / competências | 1 / 1 / 1 |
| NE emitida e líquida | R$ 510.000,00 |
| Disponível para anulação | R$ 510.000,00 |
| Distribuições / subempenhos / programações | 0 / 0 / 0 |
| Pagamentos novos / pagamentos legados / anulações | 0 / 0 / 0 |
| Documentos de fluxo anterior / eventos de auditoria | 2 / 70 |
| Documento do fluxo de liberação sem liberação associada | 1 |
| Invariantes financeiros H0 inconsistentes | 0 |

A consulta de classificação (a futura view H1, **testada apenas como SELECT**) reconheceu um documento `contexto=lib:<competencia>` sem vínculo com ato financeiro e sem SEI suficiente. Ele é **pendente_conferencia**. Isso não representa comprovante, Aviso de Subempenho ou pagamento.

A auditoria do histórico inclui operações `DELETE` antigas. O número total de eventos excluídos do histórico não deve ser interpretado como número de pagamentos ou subempenhos apagados. Cada registro precisa ser analisado por tabela, `registro_id` e snapshot.

**Decisão:** não inserir nenhum subempenho, comprovante, liberação ou anulação nova para reproduzir artificialmente o livro antigo. Com os lançamentos financeiros legados atualmente vazios, a migração de valores operacionais é **zero linha**. O legado documental original permanece.

### 2. Artefatos e ordem de uso

1. `scripts/emendas-fase-h0-baseline-readonly.sql` — executar e salvar JSON antes de alterar o ambiente; comparar com a restauração e repetir ao final.
2. `supabase/migrations/20261126160000_emendas_fase_h1_classificacao_legado.sql` — **única migration aditiva da H**, que cria uma view `security_invoker`; não insere, atualiza, apaga nem converte dinheiro, documentos ou NEs.
3. `scripts/emendas-fase-h2-seguranca-readonly.sql` — verificar RLS, `SECURITY DEFINER`, grant de RPCs, ausência de acesso anônimo, `search_path`, políticas e views invocadoras.
4. `scripts/emendas-fase-h3-pos-implantacao-readonly.sql` — auditoria da classificação do legado, integridade financeira e **cobertura observável** de cada cenário.
5. `scripts/emendas-fase-h-smoke-rls.mjs` — testes com tokens reais de homologação para Admin, ACP, ACO e anônimo, sem atos válidos de escrita.
6. `src/lib/emendas/fase-h-homologacao.test.ts` — testes estáticos/contratuais para proteção da migração, diagnósticos e segurança.

A interface da G ganha uma consulta recolhível **Conferência do legado**, com status, motivo, link SEI quando existente e CSV auditável. A classificação **não é homologação documental automática**: uma referência preenchida precisa ser conferida no SEI.

### 3. Pré-requisitos obrigatórios (portões de implantação)

**Portão P0 — repositório e ambiente.**
- Revisar encadeamento de PRs A → B → C → D → E → F → G → H; confirmar que a publicação contém o commit homologado e não uma versão antiga por cache ou merge pendente.
- Preparar ambiente de homologação separado de produção: banco, URL, credenciais e projeto de autenticação distintos. Não usar a NE operacional de R$ 510 mil como massa de testes.
- Configurar matriz de usuários de teste com os perfis reais: Admin, ACP e ACO, além de uma sessão anônima. Evitar service_role em cliente ou smoke.
- Reservar registro de mudanças, revisor ACP e responsável técnico pela implantação. A homologação deve ser assinada por responsáveis designados, não inferida do status de CI.

**Portão P1 — backup restaurável.**
- Identificar mecanismo ativo do provedor (backup gerenciado, snapshot/PITR ou dump PostgreSQL) e o ponto de recuperação imediatamente anterior à implantação.
- Criar **backup restaurável** do banco abrangendo schema, dados, funções, triggers, policies e histórico; conservar cópia segura, criptografada, fora do ambiente de testes.
- **Restaurar em banco segregado** e repetir H0 nele; comparar quantidades, saldos, total de eventos e fingerprints do histórico e dos livros financeiros. Documentar ID do backup, data/hora, destino de restauração, operador e resultados.
- Verificar separadamente objetos da Storage API e suas permissões. Um backup PostgreSQL geralmente preserva metadados da Storage, mas não os bytes dos objetos.
- Validar procedimento de recuperação de autenticação, papéis, secrets, endpoints e arquivos externos. A restauração da base não restaura necessariamente tudo.
- Não registrar senhas, JWTs ou strings de conexão no GitHub, em CSV ou em SEI.

Referências técnicas de backup: [Supabase Database Backups](https://supabase.com/docs/guides/platform/backups) e [Supabase CLI database dump](https://supabase.com/docs/reference/cli/supabase-db-dump). Os comandos efetivos devem respeitar a versão/infraestrutura e permissões da instância. **Listar backups ou executar um dump não comprova restauração**; o teste real é obrigatório.

**Portão P2 — integridade inicial.**
- H0: diferenças justificadas entre o ambiente original e a cópia só são toleradas se forem consequência de anonimização formalmente documentada. Sem isso, divergências financeiras ou de histórico bloqueiam o aceite.
- H2: nenhuma tabela operacional sem RLS; nenhuma das RPCs críticas acessível anonimamente; views financeiras com invocador; nenhuma execução de RPC permitida a ACO.
- H3: invariantes de integridade devem estar em zero. Pendências operacionais e cenários não exercitados devem ser diferenciados de inconsistências.

### 4. Matriz funcional mínima com dados sintéticos isolados

**Cenário H01 — NE multicompetência.** Criar emenda **exclusiva de homologação** e registrar NE de R$ 120.000,00 com três competências outubro, novembro e dezembro/2026. Conferir número/exercício/valor documental no SEI de teste. Verificar que o sistema **não distribui automaticamente** R$ 40 mil por mês.

**H02 — distribuição explícita.** Com justificativas de teste, alocar manualmente outubro R$ 40.000,00, novembro R$ 50.000,00 e dezembro R$ 30.000,00. Conferir total R$ 120.000,00, parcelas e impossibilidade de exceder NE líquida.

**H03 — múltiplos subempenhos na mesma competência.** Em outubro, registrar duas solicitações independentes de R$ 15.000,00 e R$ 25.000,00 da mesma NE e competência. Em novembro, uma terceira de R$ 35.000,00. Verificar sequências, IDs, isolamento de documentos/assinaturas e limites. Homologar as três subetapas (solicitação de liquidação, Aviso de Movimento — Empenho em Liquidação, Aviso de Movimento — Subempenho). Cada ato deverá usar **documento e link legítimos de homologação**, nunca um número SEI fabricado no ambiente real.

**H04 — assinatura e encaminhamento.** Tentar concluir uma subetapa sem matriz homologada, assinatura exigível ou encaminhamento obrigatório; esperar rejeição. Repetir com a matriz aprovada pela ACP e registrar a confirmação efetiva de envio; conferir trilha.

**H05 — pagamento programado não realizado.** Programar R$ 10.000,00 em uma parcela do subempenho de R$ 15.000,00 sem cadastrar comprovante. Esperado: **programado R$ 10 mil, pago R$ 0** e saldo a pagar ainda R$ 15 mil.

**H06 — pagamentos parciais e mais parcelas.** No subempenho de R$ 15 mil, programar e comprovar R$ 10 mil e depois R$ 5 mil em parcela distinta. No de R$ 25 mil, programar/comprovar R$ 25 mil. No de R$ 35 mil, inicialmente comprovar apenas R$ 15 mil de uma programação total de R$ 35 mil, depois comprovar os R$ 20 mil restantes. Esperado: novembro fica **parcialmente pago, com R$ 20 mil pendentes**, até o segundo comprovante. O valor líquido final do conjunto deve ser R$ 75 mil, após conciliação individual e sem duplicidade de eventos.

**H07 — anulação protegida.** Após os compromissos de R$ 75 mil, ainda restam R$ 45 mil para anular ao final. Entretanto, com R$ 120 mil distribuídos, o saldo inicialmente livre para anular é R$ 0. Cancelar a distribuição de dezembro, sem compromisso, e ajustar a de novembro de R$ 50 mil para **R$ 35 mil** com justificativa. A distribuição cai a R$ 75 mil; o residual de R$ 45 mil poderá ser anulado com ato e documento SEI próprios. O banco deve rejeitar qualquer anulação acima do valor livre. Não criar anulação enquanto a distribuição conflitante existir.

**H08 — competência sem execução.** Dezembro, após retirada formal de sua distribuição e confirmação de ausência de atos, deverá aceitar encerramento **sem execução**, com justificativa e documento SEI. Não exigir comprovante de pagamento fictício. Outubro/novembro só serão concluídos após pagamentos e conciliações individuais. A conciliação final da NE deve preservar R$ 120 mil emitidos, R$ 45 mil anulados, R$ 75 mil compromissados e R$ 75 mil pagos.

**H09 — uma competência, duas NEs e virada de exercício.** Criar outra NE de teste vinculada a novembro/2026–janeiro/2027, com distribuição manual própria para novembro. Demonstrar que a mesma competência recebe duas NEs independentes, com exercícios e limites próprios. Não alterar a NE H01 já fechada; use cenário separado ou prepare previamente a segunda NE.

**H10 — estorno, devolução, reprogramação e retificação.** Em outra NE/subempenho de teste, comprovar pagamento, registrar estorno/devolução com valor positivo e documento individual, reprogramar quando necessário, cadastrar nova parcela e conciliar apenas quando programado vigente e pago líquido coincidirem com o valor subempenhado. Retificar número/link SEI preservando o original e a justificativa. Rejeitar pagamento líquido negativo ou superior ao subempenhado.

**H11 — idempotência.** Reenviar exatamente a mesma solicitação com a mesma chave idempotente e parâmetros; retornar o mesmo registro, sem duplicar valor ou sequência. Reutilizar a chave com parâmetros diferentes; esperar rejeição e registro coerente de auditoria.

**H12 — concorrência real.** Utilizar **duas sessões independentes ACP**, duas contas distintas e barreira de início simultânea em ambiente isolado. Com saldo livre de R$ 20 mil, tentar subempenhar R$ 15 mil em cada sessão. Esperado: não permitir dois compromissos que totalizem R$ 30 mil. Em outra NE, tentar duas anulações concorrentes acima do residual; só cabe a operação que respeitar o saldo serializado. Registrar requisições, horários, códigos de erro e saldos finais. **Não testar concorrência com dados produtivos.**

**H13 — papéis e RLS.** Conferir com sessões reais:
- **Admin:** leitura e atos permitidos pela matriz; alterações auditadas.
- **ACP:** leitura, solicitações, documentos, pagamentos e conciliação conforme seus fluxos.
- **ACO:** leitura dos dados que suas policies autorizam, sem criar/alterar/anular/conciliar.
- **Anônimo:** nenhuma leitura financeira privilegiada nem execução de RPCs.
- Confirmar que alterar o papel via metadados editáveis do usuário não concede permissões. Verificar RPCs `SECURITY DEFINER` com `auth.uid()`, `has_any_role` e `search_path` controlado.

**H14 — trilha histórica e imutabilidade.** Verificar origem/ID, momento, autor, valor e SEI dos eventos. Após conciliar NE, tentar anular, distribuir, inserir subempenho ou pagamento, alterar a evidência/concilição histórica ou excluir um ato. Esperado: bloqueio transacional. Exportar timeline e conferir que PDFs/documentos não sumiram.

**H15 — legado incompleto.** Gerar em homologação documentos do fluxo antigo com e sem vínculo de liberação e SEI. Confirmar a classificação na view H1, a apresentação no painel, exportação CSV e ausência de subempenhos/comprovantes novos. Em produção, analisar o documento antigo já identificado, mantendo seu status **pendente_conferencia** até prova externa e decisão ACP.

**H16 — regressão da emenda como um todo.** Com pelo menos duas NEs, conciliar só a primeira e deixar pagamento parcial na segunda. O resumo global deve continuar pendente. Não rotular emenda como concluída se restar lançamento ativo sem NE, pagamento parcial, documento ou residual por anular.

### 5. Matriz de evidências de cada caso

A equipe deverá manter um registro por teste, com: código H01–H16, identificador do ambiente, operador ACP/ACO/Admin, data/hora, entrada utilizada, NE/competência/subempenho envolvidos, IDs de eventos, documentos SEI de **teste**, resposta HTTP/SQL, valor antes/depois, resultado esperado, resultado obtido, aprovação/reprovação, issue correspondente, evidência de auditoria e revisor.

Não tratar **cenário sem registros** como aprovado. Na saída H3, valores zero em `ne_multicompetencia`, `multiplos_subempenhos_na_mesma_competencia`, `pagamentos_parciais` ou `retificacoes_documentais` significam que aquela massa de dados ainda **não comprova** o caso.

### 6. Migração histórica e conferência do livro anterior

A H1 classifica registros originais e preserva seus IDs; separa ato financeiro de mero documento. Possíveis saídas:
- `evidencia_documental_presente`: referência SEI cadastrada e vínculo estrutural identificado; a ACP ainda precisa conferir o documento real.
- `pendente_conferencia`: falta vínculo, número/link SEI ou há inconsistência de valor; não converter.
- `elegivel_conversao_automatica=false` para **todas** as fontes. Um registro legado documentado continua no livro legado.

**Procedimento de migração para futuros registros legados efetivos:** exportar origem e referência, validar existência e conteúdo externo de NE, Aviso e comprovante, definir correspondência inequívoca com a competência e a NE, verificar ausência de duplicidade na cadeia nova, obter aceite ACP e executar script de conversão **específico ao conjunto homologado**, em transação com chave de idempotência e evidência de origem. Não publicar rotina genérica que invente sequência, número de Aviso ou comprovante. Se qualquer documento obrigatório estiver ausente, manter pendência na origem.

**Situação desta base:** existem zero liberações e pagamentos financeiros do legado; portanto **nenhuma conversão financeira pode ser homologada sobre dados reais nesse momento**. A migração aditiva documental é verificável com H1; cenários de conversão só podem ser ensaiados com massa sintética aprovada e fontes reais de teste.

### 7. Smoke automatizado de permissão com tokens de homologação

O script `scripts/emendas-fase-h-smoke-rls.mjs` requer:
`HOMO_SUPABASE_URL`, `HOMO_SUPABASE_ANON_KEY`,
`PROD_SUPABASE_URL`, `HOMO_TOKEN_ADMIN`, `HOMO_TOKEN_ACP`,
`HOMO_TOKEN_ACO`, `HOMO_ASSERT_ISOLATED=SIM_AMBIENTE_SEGREGADO`.

As URLs devem apontar para projetos diferentes. O script lê dados e tenta RPCs com argumentos inválidos (**valor zero, IDs nulos**), verificando retorno `42501` para ACO/anônimo e `23514` para ACP/Admin, sem realizar inserções. É um **smoke**, não substitui o exercício completo H01–H16. Executar localmente em terminal seguro usando `node scripts/emendas-fase-h-smoke-rls.mjs`; não colar JWTs no chat ou em logs.

### 8. Sequência de implantação

1. Revisar PRs e construir artefato da branch H a partir da G; registrar SHA, autor, checksum do bundle e data.
2. Validar **backup restaurável** e a cópia segregada; H0 deve corresponder à base de origem (exceto anonimização documentada).
3. Aplicar H1 no ambiente de homologação; verificar view invocadora, RLS e classificação pendente.
4. Executar H2, H3, smoke real de papéis e cenários H01–H16. Corrigir defeitos por nova migration/commit e repetir regressão.
5. Registrar aprovação do responsável ACP, controle de mudanças e responsável técnico de banco/infraestrutura. Sem aceite formal, não implantar.
6. Planejar janela curta com bloqueio temporário de escritas e comunicação à equipe; garantir que NEs e pagamentos não sejam alterados entre backup e corte.
7. Aplicar **somente migration H1** em produção, pois A–G já devem estar implantadas. Publicar frontend homologado de modo coordenado. Não alterar schema financeiro já existente sem nova mudança aprovada.
8. Limpar/incrementar versão dos assets conforme pipeline, validar que a aplicação apresenta a versão efetiva, permissões, painel da NE, conferência de legado, exportações e timeline.
9. Executar H0/H2/H3 pós-implantação e comparar com valores pré-corte. Registrar evidências e liberar usuários gradualmente. Monitorar erros de RPC, permissão, limites e performance.
10. Encerrar a janela somente após o aceite funcional e financeiro.

**Rollback:** em problema estritamente de interface, reverter o bundle/commit e manter H1 (view aditiva) inativa para o cliente; não excluir registros nem refazer migrações financeiras. Em erro da view, isolar o componente na interface e elaborar migration corretiva. **Não restaurar cegamente a produção** após novos atos SEI, empenhos, anulações ou pagamentos: analisar delta e impactos, preservar trilhas e validar procedimento com DBA/ACP. Um restore integral pode sobrescrever atos legítimos feitos entre backup e incidente.

### 9. Critérios de aceite (todos obrigatórios)

- [ ] Ambiente de homologação realmente separado e dados sintéticos protegidos.
- [ ] Backup **restaurado com sucesso**, H0 confrontado e Storage coberta ou documentada.
- [ ] H1 executada e pendências legadas visíveis, sem alteração nos livros financeiros.
- [ ] H2 sem acesso anônimo indevido, sem falhas de RLS/grants e ACO sem mutações.
- [ ] H3 sem inconsistências; 16 cenários com evidência própria e justificativa das exceções.
- [ ] Concorrência, idempotência e ações após conciliação rejeitadas conforme esperado.
- [ ] Testes unitários, build, TypeScript e contratos executados; desvios preexistentes identificados.
- [ ] ACP conferiu documentos SEI e chancelou matriz de assinaturas para emendas.
- [ ] Aprovação formal e janela de implantação registrada.
- [ ] Validação pós-implantação com aceite, log de erros e plano de rollback documentados.

**Somente após essas assinaturas e resultados o status poderá ser alterado para “migração homologada e implantação concluída”.** A existência do PR, do SQL ou de testes unitários não implica esse estado.
