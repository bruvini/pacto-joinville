# PVH · Fase A — implementação e implantação controlada

**Escopo aprovado:** modelo de NE multicompetência, valor solicitado separado do emitido, meses de abrangência explícitos e estrutura para anulação contábil SOMENTE do saldo residual. Preservar as NEs e utilizações anteriores. Não implementar as Fases B–E nesta entrega.

**Situação atual (09/11/2026):** código na branch \`feat/pvh-ne-multicompetencia-fase-a\`. A migration NÃO foi aplicada ao banco de produção: ausência de confirmação de um backup restaurável e limite de consultas do Lovable. Não declarar backup realizado nem banco atualizado.

## Arquivos

- Migration: \`supabase/migrations/20261109140000_pvh_ne_multicompetencia_fase_a.sql\`
- Preflight (somente SELECT): \`scripts/pvh-fase-a-preflight.sql\`
- Postflight (somente SELECT): \`scripts/pvh-fase-a-postflight.sql\`
- Backup lógico local: \`scripts/pvh-fase-a-backup.ps1\`
- Teste estático e regressão de schema: \`src/lib/pvh/fase-a-ne-multicompetencia.test.ts\`

## Pré-requisitos de segurança

1. Escolher janela operacional e confirmar que não há lançamentos concorrentes.
2. No Lovable, **More → Database → Manage → Backups**, localizar o último backup diário e registrar data, hora, capacidade de restauração e política de retenção. O backup diário pode estar defasado. **Não presumir que foi criado neste instante**.
3. Preferencialmente também realizar **exportação independente** por **Database → Manage → Settings → Export data** ou usar \`pg_dump\` com credenciais fora do repositório. O script PowerShell exige \`PACTO_DB_URL\` e ferramentas PostgreSQL instaladas.
4. Restaurar cópia de teste em banco de homologação e conferir tabelas, funções, assinaturas e vínculos de PVH. O teste \`pg_restore --list\` só valida a leitura do catálogo: não é prova de restauração bem-sucedida.
5. Executar \`scripts/pvh-fase-a-preflight.sql\` (SELECT) e guardar os resultados em local institucional seguro, **fora do GitHub**.
6. Verificar duplicidades, dados legados irregulares, compatibilidade do Postgres com regex e RLS. Conferir a integridade das NEs 6606/2026 e 6604/2026 vinculadas a 10/2026.

### Aplicação em homologação

Executar o arquivo **inteiro** \`20261109140000_pvh_ne_multicompetencia_fase_a.sql\` em uma única operação. Inclui \`BEGIN\` e \`COMMIT\`: erro deve impedir o commit. **Não copiar trechos isolados**.

Depois:
- executar postflight, verificar \`alocacoes_historicas_sem_mes = 0\`;
- confirmar **nenhuma anulação fictícia** e que \`valor_solicitado\` legado permanece NULL;
- validar RLS nos dois novos cadastros, teste de usuário anônimo (sem leitura) e teste de papel ACP/ACO (somente leitura);
- comparar totais de NEs, alocações e subempenhos antes/depois;
- confirmar que as 2 NEs de outubro continuam com R$ 1.240.000,00 e R$ 1.775.502,09 alocados;
- executar testes do projeto e smoke test da Etapa 3 e Etapa 4 no aplicativo.

### Aplicação em produção

Somente com evidência de restauração, preflight e homologação aprovados. Realizar durante uma janela sem operações simultâneas, com responsável autorizado. Executar a migration e repetir o postflight. Registrar resultado e identificação do backup na documentação interna; **não registrar senhas ou dados pessoais em commit público**.

## Compatibilidade com registros históricos

- \`pvh_empenhos.valor_total\` continua sendo o montante da NE emitida; \`valor_solicitado\` novo fica NULL quando o pedido histórico é desconhecido.
- Alocações existentes continuam inalteradas. A tabela \`pvh_empenho_competencias\` importa somente os meses efetivamente presentes nas alocações legadas (origem \`historica_alocacao\`).
- O mês em que a solicitação foi criada é guardado como \`historica_origem_pendente\` **quando não havia alocação**, sem inferir competência futura autorizada.
- A Fase A não muda \`pvh_rebalancear_alocacoes_origem\`, \`pvh_alocar_saldo_empenho\`, \`pvh_preparar_etapa4\` ou as regras de conclusão de etapas; substituições ocorrerão nas fases seguintes, de forma transacional.
- \`pvh_empenho_anulacoes\` nasce vazia: valores somente serão registrados após ato SEI comprovado e validações financeiras implementadas na Fase E.
- Nenhuma função nova permite anulações ou alocações diretamente neste momento. Tabelas novas são somente leitura para usuários autenticados autorizados; futuras escritas precisarão de RPCs seguras e auditadas.

## Governança e limites

**Não é uma implementação completa do fluxo multi-competência.** A existência de colunas/tabelas não habilita seleção de meses, redistribuição, automatismo em nova competência nem anulação. Tentar registrar anulação manualmente antes da Fase E é proibido operacionalmente.

As duas tabelas novas possuem RLS, políticas de SELECT por papéis e triggers de auditoria. Não existem políticas de INSERT/UPDATE/DELETE para operadores. \`service_role\` possui privilégios de backend; não pode ser exposta no cliente.

O FK da tabela de abrangência usa ON DELETE CASCADE **somente para preservar exclusão de solicitações antigas que não tenham uso**, conforme fluxo legado. A tabela de anulação utiliza ON DELETE RESTRICT para impedir exclusão de NE com anulação registrada. Os fluxos de cancelamento lógico e proteção de uso permanecem itens obrigatórios da Fase E.

## Reversão

O commit pode ser revertido sem mexer no banco se a migration não foi aplicada. Depois da aplicação, as tabelas e colunas devem ser preservadas até uma decisão formal sobre rollback — não executar \`DROP TABLE\` nem \`DELETE\` automaticamente.

O plano seguro é: interromper alterações, avaliar alterações posteriores, restaurar **em novo ambiente primeiro** a partir do backup verificado, conciliar os registros e somente então deliberar uma restauração produtiva. Um restore em produção pode apagar ações realizadas após o ponto escolhido.

## Critérios de aceite

- Backup recuperável e teste de restauração: **pendente de comprovação**.
- Migration preparada: concluída na branch.
- Histórico preservado: por desenho, sem \`UPDATE\` ou \`DELETE\` de alocações/subempenhos; precisa de homologação para ser comprovado.
- Segurança: RLS/grants/políticas previstos; validação real pendente.
- Fases B–E: explicitamente fora do escopo desta implantação.
