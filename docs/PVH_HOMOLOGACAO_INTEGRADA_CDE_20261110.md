# Homologação integrada PVH C + D + E — 10/11/2026

## Escopo e método
Verificação diretamente no banco PostgreSQL associado ao projeto Lovable **Gestão de Empenhos** (produção) via consultas **SELECT**, sem alterações de dados, mais inspeção das funções implantadas, da branch de integração C/D/E e dos logs GitHub Actions dos PRs #48 e #49. **Não confundir esta conferência de integridade com homologação operacional completa.**

## Diagnóstico encontrado no banco
- Funções C, D, E presentes: `pvh_sincronizar_cobertura_competencia`, `pvh_concluir_etapa3`, `pvh_registrar_anulacao_residual`; triggers de alocação, imutabilidade e auditoria habilitadas.
- 10 NEs ativas, 10 alocações, 10 cadeias de subempenho e zero anulações registradas.
- Sem saldos negativos, sobrecoberturas por competência, alocações entre instituições/exercícios errados, vínculos em competência inelegível ou cadeias duplicadas por alocação.
- 07, 08 e 09/2026: todas as sete etapas concluídas, competência encerrada e nenhuma reconferência pendente.
- 10/2026: etapa 1 concluída, etapa 2 pendente por FMS, etapa 3 ainda não concluída, sem reconferências. Portaria municipal 257/2026/SES (05/11/2026), com documento SEI conferido. HMSJ: NE 6604/2026, SEI 31103833, emitido/alocado R$ 1.775.502,09; Bethesda: NE 6606/2026, SEI 31104096, emitido/alocado R$ 1.240.000,00. Solicitações, assinatura obrigatórias, ACO, SEFAZ e documentos SEI presentes e coerentes para ambas. **Critérios de conclusão da etapa 3 parecem atendidos pela leitura, mas a RPC não foi acionada.**
- Etapa 4: banco contém duas cadeias em 10/2026, porém ainda não concluída; `pvh_concluir_etapa4` exige FMS conciliado e etapas 2 e 3 concluídas.
- NEs 7197, 7198, 7199 e 7200/2026 têm saldo emitido ainda não alocado; 11 e 12/2026 estão em preparação sem valores oficiais. Conferir abrangência e documentação antes de executar alocações futuras.
- Segurança: papel anon sem execução da RPC E; authenticated pode executar a função, mas a função exige papel ACP/admin; tabelas de anulações/abrangência têm RLS de leitura e não concedem INSERT/UPDATE/DELETE direto ao papel authenticated. Uma anulação por NE é protegida por UNIQUE e trigger de imutabilidade.

## Falha real identificada e mitigação preparada
O SQL implantado da Fase C `pvh_preparar_etapa4(uuid)` inseria cadeias de subempenho para todas as alocações encontradas, sem validar se a soma cobrira integralmente a instituição. O frontend da Fase D bloqueia a Etapa 4 na cobertura parcial, mas chamadas diretas à RPC contornariam esse bloqueio. Trata-se de descompasso de **integridade server-side**.

Migration corretiva: `supabase/migrations/20261110100000_pvh_homologacao_integrada_cde_preparacao_etapa4.sql` — bloqueia preparação parcial e instituições sem NE emitida, revalida documento municipal publicado, preserva independência do ingresso FMS. Não reescreve dados financeiros. **Ainda não foi executada.**

## CI existente — diagnóstico, não aprovação
GitHub Actions PR #48 (última execução 09/11) e #49 (09/11): build, contratos de ambiente/esquema e diagnóstico de TypeScript terminaram com sucesso; suítes gerais falharam em **12 testes anteriores** de outros módulos, com 623 testes aprovados na Fase C e 633 aprovados na D. No PR #49, 10 testes novos da fase D fazem parte dos aprovados. A execução CI exclusiva da branch integrada E ainda precisa ser verificada.

## Gates ainda obrigatórios
- [ ] Backup efetivamente restaurado em staging/homologação. Não foi verificado pelo acesso disponível.
- [ ] Homologar SQL corretivo no banco de testes, incluindo resultado da guarda em cobertura parcial, e só então aplicá-lo à produção com controle de mudança.
- [ ] Executar casos destrutivos em base de testes: anulação R$ 1.000,00 / R$ 500,00 alocado / R$ 500,00 anulado; tentativa duplicada; concorrência entre alocação e anulação; exclusões proibidas; reconferência após alteração estadual; usuário ACO sem direito de anular.
- [ ] Teste autenticado real de 10/2026: Etapa 3 concluir sem FMS, Etapa 4 continuar aberta para edição e bloqueada para conclusão.
- [ ] Executar CI/TypeScript/Vitest sobre a branch que reúne C + D + E + patch, corrigir eventuais falhas **novas** de PVH e isolar as 12 legadas.
- [ ] Validar relatórios CSV/PDF, SEI, registros de auditoria em competências múltiplas e segurança RLS.
- [ ] Após aprovação, integrar branch e publicar Lovable coordenadamente com a migration, sem excluir documentos/alocações anteriores.

**Situação:** Integridade do banco atual conferida por SELECT, 1 falha de regra server-side identificada e corrigida no código; homologação transacional/concorrente e publicação pendentes. O Lovable interrompeu consultas adicionais após esgotar o limite da conexão.
