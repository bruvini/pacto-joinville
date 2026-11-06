# PACTO · Piso da Enfermagem — implantação controlada da conciliação AFC

## Escopo e segurança

Implementação incremental vinculada ao plano de modernização de novembro de 2026. Esta implantação **não** renumera as etapas, preserva a anulação 7A (chave 10), o fluxo de 13ª parcela e a independência preparatória das etapas 5–8.

A migration aditiva está em `supabase/migrations/20261106112000_piso_afc_conciliacao_fms.sql`. **Não executar contra produção sem autorização de mudança, backup verificável e validação em homologação**.

O crédito FMS é entrada efetiva; o saldo de extrato já contempla créditos lançados até sua data de referência, portanto não somar o mesmo crédito novamente. Compensação federal de saldo não equivale a anulação de empenho. O abatimento federal não prova saldo disponível e nenhuma decisão de revisão altera automaticamente os valores oficiais.

## Frente 1 — Conciliação financeira no FMS

- Interface de conciliação na Etapa 4 (`ConciliacaoFinanceiraAfcPiso`).
- Evidências: conta/fonte FMS, data de referência, saldo de extrato, compromissos anteriores, SEI, crédito efetivo e reservas vinculadas.
- Status: não informado, aguardando, disponibilidade comprovada/insuficiente, divergência e exceção formal.
- Reserva de uma competência em reconferência **continua comprometendo disponibilidade** até liberação formal.
- Pedido de revisão do desconto: justificativa, ofício, protocolo, data, situação e decisão. Sem recalcular homologação.

**Atenção à evolução futura:** a implantação atual usa saldo/documentos no cadastro da conta FMS. Antes de reutilizar a mesma conta para competências futuras com novos extratos, revisar a modelagem de *snapshots de saldo por competência/data de referência*: não sobrescrever uma evidência utilizada por conciliação confirmada.

## Frente 2 — Semântica financeira e relatório

- O InvestSUS registra apuração, não uma portaria publicada.
- Relatório distingue apuração e publicação comprovada por documento SEI e confere `total_publicado_municipal` apenas com marco documental.
- Homologado, desconto, transferência prevista, crédito efetivo, disponibilidade comprovada e empenho/anulação são valores semanticamente separados.
- Reservas em reconferência permanecem consideradas no cálculo exibido no PDF.
- O PDF destaca acontecimentos relevantes sem excluir a trilha integral de `historico_logs`.

## Frente 3 — Banco, governança e encerramento

- Estruturas novas `piso_afc_contas_fms` e `piso_afc_conciliacoes`; RLS para ACP/administrador em escrita e leitura institucional autorizada.
- Trigger de validação com reserva cruzada, trava de conta e documentação; auditoria e reconferência.
- Encerramento mensal condicionado a comprovação financeira ou decisão excepcional formal. Fluxos preparatórios independentes não dependem do crédito efetivo.
- Nenhum registro histórico deve ser preenchido com saldo presumido; 13ª parcela conserva regra própria.

## Procedimento de implantação

1. Confirmar ausência/presença das tabelas e objetos, conferir histórico de migrations e registrar aprovação institucional.
2. Executar backup verificável com estratégia de restauração, preferencialmente testar cópia em homologação.
3. Validar e aplicar a migration numa transação e revisar os `GRANT`, RLS, políticas e funções SECURITY DEFINER.
4. Executar consultas de verificação **somente leitura**:

```sql
SELECT to_regclass('public.piso_afc_contas_fms') AS contas,
       to_regclass('public.piso_afc_conciliacoes') AS conciliacoes;
SELECT tgname, tgenabled, pg_get_triggerdef(oid)
FROM pg_trigger WHERE tgrelid IN (
  'public.piso_competencias'::regclass,
  'public.piso_afc_conciliacoes'::regclass,
  'public.piso_afc_contas_fms'::regclass
) AND NOT tgisinternal;
SELECT tablename, policyname, cmd FROM pg_policies
WHERE schemaname='public' AND tablename IN ('piso_afc_contas_fms','piso_afc_conciliacoes');
```

5. Recarregar prévia, validar perfis ACP, admin e somente leitura; simular os cenários A–H do plano em homologação.
6. Confirmar que outubro/2026 permanece com R$ 9.876,68 homologados, R$ 8.114,28 de desconto e R$ 1.762,40 previstos, **sem inventar crédito ou saldo**. Conferir que as anulações previstas de R$ 5.475,32 e R$ 648,00 não são registradas como executadas automaticamente.
7. Verificar que competência encerrada não permite alteração financeira indevida e que etapas 5–8 permanecem paralelas.
8. Só então considerar publicação.

## Rollback

- **Aplicação:** retornar o commit anterior se o front-end apresentar regressão.
- **Banco:** migration aditiva; não realizar `DROP TABLE` ou eliminar evidências se dados tiverem sido incluídos. Se for necessário desativar o novo fluxo, coordenar reversão formal com backup, comparação de registros e aprovação da ACP/gestão de TI.
- Não apagar registros de `historico_logs`, não modificar competências encerradas e não remover reservas confirmadas para recuperar saldo fictício.

## Status conhecido em 06/11/2026

Código e testes no GitHub; build e TypeScript executam com sucesso no CI. O workflow geral possui falhas de testes anteriores não relacionados, que devem ser tratados separadamente. **A efetiva aplicação da migration no banco Lovable não foi comprovada:** a consulta da ferramenta de banco atingiu o limite temporário de ações. Portanto, não afirmar conclusão de implantação produtiva até validação SQL real.
