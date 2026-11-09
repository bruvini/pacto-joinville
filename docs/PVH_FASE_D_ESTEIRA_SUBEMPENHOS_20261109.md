# PVH · Fase D — Esteira 2–4, SEI da NE e subempenho

## Resultado esperado
- **Etapa 2**: Portaria Municipal publicada + cadeia documental + ingresso financeiro no FMS continuam necessários para conclusão. O status **Aguardando FMS** pode coexistir com Etapa 3 concluída.
- **Etapa 3**: encerra com Etapa 1 concluída, Portaria Municipal publicada e conferida, NE emitida, assinatura/encaminhamentos/documentos SEI completos e cobertura por instituição integral; **não depende da conclusão da Etapa 2 nem da data de crédito FMS**.
- **Etapa 4**: pode ser aberta para preparar e preencher as cadeias SEI com cobertura integral por NEs emitidas, mesmo sem crédito FMS. O SQL de `pvh_concluir_etapa4` não foi alterado; continua exigindo etapa 2 concluída, etapa 3 concluída, FMS conciliado, ausência de reconferências e cadeia documental completa.
- Identificação compacta: `NE 6604/2026 (31103833)`, com link de abertura SEI no interior da cadeia.

## Dependência e implantação
Esta branch **deriva da Fase C**, cuja SQL já foi aplicada pelo operador ao banco do Lovable. O frontend da Fase C, no entanto, ainda está no PR #48. Não publicar apenas o código desta fase sem integrar a branch C.

Migration D: `supabase/migrations/20261109190000_pvh_esteira_independente_fase_d.sql`.

- Contém somente `CREATE OR REPLACE FUNCTION` e ajuste de direitos de execução; **não altera NE, alocações, subempenhos ou dados de conclusão existentes**.
- `pvh_concluir_etapa3`: remove a dependência indevida de etapa 2, exige Etapa 1 válida, uma publicação municipal consistente no SEI e preserva todas as regras anteriores de cobertura e rastreabilidade de NE.
- `pvh_marcar_reconferencia_etapa2_financeira`: marca 2,4,5,6,7 para reconferência **apenas se essas etapas já haviam sido concluídas**, preservando a marca de 3 quando pertinente a outro evento. Correção exclusiva de publicação municipal ou FMS não desmarca a conclusão de empenhos.
- `pvh_reconferir_etapa2_por_comp` e `pvh_reconferir_recurso_fms_etapa2` passam a usar a função seletiva. A alteração do valor estadual na Etapa 1 **continua** invalidando etapas dependentes, inclusive a Etapa 3.
- As funções de anulação de NE e conclusão da etapa 4 não são alteradas nesta fase.

## Antes de aplicar
1. Confirmar backup restaurável recente e janela sem lançamentos financeiros concorrentes.
2. Confirmar Fase C no banco: `to_regprocedure('public.pvh_sincronizar_cobertura_competencia(uuid)')`.
3. Conferir baseline da competência 10/2026: etapa 1 concluída, FMS ainda pendente, NEs 6606/2026 e 6604/2026 com valores 1.240.000,00 e 1.775.502,09.
4. Homologar migration em cópia do banco. Executar também 2 sessões de teste para o workflow de subempenhos e conclusão das etapas. A migração passou em um primeiro ensaio de parsing e DDL via transação ROLLBACK; a última revisão tipou uma coluna de reconferência e requer homologação antes de produção.
5. Aplicar o SQL D **inteiro** em uma única transação, somente depois da homologação.
6. Liberar o frontend com os commits das Fases C e D e validar com perfil ACP.

## Pós-instalação (somente SELECT)
```sql
SELECT p.proname, pg_get_functiondef(p.oid) AS definicao
FROM pg_proc p
WHERE p.pronamespace='public'::regnamespace
  AND p.proname IN (
    'pvh_concluir_etapa3',
    'pvh_marcar_reconferencia_etapa2_financeira',
    'pvh_reconferir_etapa2_por_comp',
    'pvh_reconferir_recurso_fms_etapa2',
    'pvh_concluir_etapa4'
  ) ORDER BY p.proname;

SELECT c.competencia,c.etapas_concluidas,c.etapas_reconferir,
       c.recurso_fms_data,c.recurso_fms_valor
FROM public.pvh_competencias c WHERE c.competencia='10/2026';

SELECT e.numero_ne,e.nota_empenho_sei_numero,
       p.competencia_id,a.valor_alocado
FROM public.pvh_empenho_alocacoes a
JOIN public.pvh_empenhos e ON e.id=a.empenho_id
JOIN public.pvh_participantes p ON p.id=a.participante_id
JOIN public.pvh_competencias c ON c.id=p.competencia_id
WHERE c.competencia='10/2026'
ORDER BY e.numero_ne;
```

## Cenários operacionais para homologar
- Portaria Municipal 257/2026/SES e NEs emitidas com FMS vazio em 10/2026: **Concluir Etapa 3** deve funcionar sem concluir a 2.
- Etapa 2 deve permanecer **Aguardando FMS**; o simples ingresso FMS não pode marcar a 3 como reconferência.
- Etapa 4 deve abrir com cobertura integral, mas continuar impedida de finalizar sem etapa 2 concluída + FMS conciliado.
- NE (SEI) deve abrir o documento real na cadeia de subempenhos.
- Participante com duas NEs complementares deve ter duas cadeias distintas; não alterar nem transferir documentos assinados.
- Mudança de valor estadual na etapa 1 deve sinalizar reconferência da etapa 3.
- Verificar que subempenhos anteriores e logs históricos permanecem intactos.

## Situação de implantação
**Código em branch isolada, migration D ainda não aplicada**: a consulta ao banco Lovable chegou ao limite gratuito antes da aplicação. Não inferir implantação a partir do commit GitHub. O PR D será baseado no PR C e mantido em rascunho até aplicar e validar SQL, homologar o fluxo e verificar o backup.
