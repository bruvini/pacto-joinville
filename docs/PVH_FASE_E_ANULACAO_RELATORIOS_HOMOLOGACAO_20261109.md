# PVH · Fase E — anulação residual, relatórios e auditoria

**Situação em 09/11/2026:** código e migration preparados em branch isolada, **NÃO aplicados ao banco e NÃO publicados**. O PR #49 (Fase D) ainda exige aplicação e homologação do SQL; a Fase C (#48) tem dependência própria. A existência do código GitHub não comprova instalação no Supabase.

## Regras definitivas

1. A NE original mantém valor emitido, número, SEI, alocações e subempenhos; a anulação ocupa registro separado, com data, número/link SEI, justificativa e autor.
2. **Anulação efetiva ≠ pendência.** Não criar baixa fictícia enquanto o ato contábil não estiver concluído e documentalmente comprovado.
3. **Somente saldo residual integral**, recalculado na transação: emitido − soma das alocações globais. O valor digitado deve coincidir com o registrado no ato SEI. Não anular valor já utilizado, nem permitir uma segunda anulação da mesma NE.
4. Após a baixa, o saldo é zero; o motor da Fase C não pode redistribuí-lo. Alterações e exclusões de alocações existentes e mudanças materiais na NE ficam bloqueadas. Retificações exigem procedimento formal próprio.
5. A mesma NE pode cobrir diferentes competências. A trilha de auditoria registra a anulação no histórico da competência de origem e em **cada competência que consumiu a NE**, mas a baixa contábil só existe uma vez. O relatório mensal deixa claro quais valores são globais.
6. A RPC é limitada a perfis **ACP e administração**. ACO pode consultar as informações autorizadas pela RLS, mas não registrar uma baixa. CRUD direto de anulações permanece bloqueado pela estrutura da Fase A.

## Entregas

- `supabase/migrations/20261109200000_pvh_anulacao_residual_fase_e.sql`: RPC com lock transacional por instituição, checagem de documento, valor exato e declaração explícita de encerramento do saldo.
- `src/components/pvh/AnulacaoResidualPvh.tsx`: formulário de anulação do saldo residual da NE emitida, conferência de valores, registro SEI, justificativa e confirmação; histórico da baixa aparece mesmo para usuários sem direito de registrar.
- `src/lib/pvh/anulacao.ts`: validações e extrato CSV por NE/ano com valores emitidos, alocados, anulados e saldo global. CSV protege contra fórmulas em campos livres.
- `src/lib/pvh/relatorio.ts`: seção financeira amplia extrato da NE sem duplicar valor global por competência. Linha do tempo e identificação de SEI preservadas.
- `src/lib/pvh/historico.ts`: evento de anulação traduzido para linguagem administrativa.
- `scripts/pvh-fase-e-integridade.sql`: auditoria **somente SELECT** para comparar saldos e eventos antes/depois da implantação.

## Checklist de homologação — obrigatório

**Preflight:**
- [ ] Conferir PRs #48 e #49 e migrations A/B/C/D realmente aplicadas no banco correto. Confirmar `to_regprocedure(...)` e definição, não apenas nome da função.
- [ ] Criar backup separado de dados e definições, testar RESTAURAÇÃO em homologação e registrar hash, data, ambiente e responsável.
- [ ] Fazer reconciliação de NEs e alocações com `scripts/pvh-fase-c-integridade.sql` e o script E; zerar divergências antes de avançar.
- [ ] Confirmar outubro/2026, NEs 6604/2026 (HMSJ) e 6606/2026 (Bethesda) com números e valores originais intactos, sem simular baixa em produção.
- [ ] Conferir regras de concessão de roles e permissões RLS no ambiente de homologação.

**Cenários operacionais em homologação, com NEs fictícias ou cópia anonimizada:**
- [ ] NE R$ 1.000,00; alocada em dois meses R$ 200,00 + R$ 300,00; ato de anulação R$ 500,00 → emitido permanece R$ 1.000,00, alocado R$ 500,00, anulado R$ 500,00 e saldo R$ 0,00.
- [ ] Valor digitado de R$ 499,99, data futura, link não HTTPS, ausência de motivo ou declaração, NE sem emissão, NE sem saldo → operação recusada sem INSERT nem histórico contábil.
- [ ] Segunda tentativa de anulação da mesma NE → recusada sem alterar o ato anterior.
- [ ] Dois navegadores simultâneos: um tenta consumir saldo e outro anular. A soma emitido = alocado + anulado deve permanecer exata, sem deadlock.
- [ ] Edição ou exclusão da NE/alocação após anulação → recusada; pagamentos, subempenhos, notas SEI e assinaturas permanecem intocados.
- [ ] Perfil ACO e usuário não autorizado: RPC recusada. ACP/admin autenticados: permitidos apenas com documentação íntegra.
- [ ] Anulação registrada aparece nas linhas do tempo de todas as competências que utilizaram aquela NE, sem duplicar valores do ato.
- [ ] CSV abre com separador `;`, BOM UTF-8, valores com vírgula decimal e células textuais sem execução de fórmulas.
- [ ] Relatório executivo não confunde `valor_alocado_competencia` com `alocado_global`; dados não carregados devem aparecer como N/D, nunca como zero arbitrário.
- [ ] Regressão D: Etapa 3 conclui antes do FMS com cobertura integral; Etapa 4 prepara, mas não conclui antes da regularização do FMS.
- [ ] Executar build, TypeScript, testes e controles arquiteturais no CI/Lovable. Classificar e solucionar falhas preexistentes que afetem PVH; não declarar aprovação só por testes estáticos.
- [ ] Conferir logs do Supabase e executar advisors de segurança e desempenho antes do go-live.

## Publicação controlada (somente com aceite)

1. Confirmar backup, plano de recuperação e janela de implantação sem operações financeiras em curso.
2. Aplicar e validar SQL C, depois SQL D, depois SQL E, **somente se ainda não estiverem aplicados e após homologação**.
3. Em cada etapa, executar verificações de integridade e documentar resultados; não reexecutar migrações cegamente.
4. Integrar os PRs na ordem C → D → E, sem sobrescrever outras mudanças de `main`; confirmar compatibilidade e testar em staging.
5. Publicar o frontend no Lovable/hosting correspondente somente após migrations e testes operacionais.
6. Conferir permissões ACP/ACO/admin, relatório, trilha e situação real da competência PVH 10/2026. Registrar decisão de aceite e responsável.
7. Em caso de falha: retirar novo frontend do ar/reverter release e isolar as RPCs novas. **Não executar rollback financeiro por DELETE/UPDATE de anulações reais.** Se houve qualquer baixa efetiva, planejar correção contábil auditada.

**Gate:** Não fazer merge, aplicar SQL E ou publicar em produção automaticamente a partir deste PR em rascunho.
