# Emendas Parlamentares — Fase 6: indicadores, relatórios, alertas e homologação

## Correção da navegação

**Causa identificada:** a rota `emendas.$id.lancamentos.$lancamentoId.tsx` era filha da página da emenda. Como a capa não possui `<Outlet />`, o endereço podia mudar sem renderizar o detalhe. A rota agora usa o sufixo de *non-nested route* do TanStack Router, mantendo a mesma URL pública: `emendas.$id_.lancamentos.$lancamentoId.tsx`.

A coluna Parcelas não exibe intervalo quando há apenas uma parcela (`57`); se as parcelas vinculadas forem consecutivas, exibe `57 a 59`; se houver lacuna, exibe `57, 59` — sem inventar parcelas intermediárias.

## Painéis e relatórios
- O índice geral exibe KPIs **dependentes dos filtros**: quantidade, emendas ativas, limite autorizado, NE líquida e saldo gerencial disponível. Oferece exportação CSV do consolidado filtrado.
- A capa de cada emenda apresenta um painel analítico relacionado aos filtros da tabela de lançamentos: rascunhos, NE emitidas, valor liberado, pago, anulado, número de conciliações, distribuição por etapa, percentual pago sobre NE líquida e alertas. Nenhum valor presume ação executada na SEFAZ.
- Relatórios CSV: lançamentos e movimentações resumidas da emenda, alertas do conjunto filtrado. Inclui BOM UTF-8 e separador `;`, escapando possíveis fórmulas em campos textuais para uso no Excel.
- Os indicadores são calculados das tabelas existentes; **não há schema/migration novo na Fase 6**.

## Alertas
- Críticos: anulações+liberações superiores à NE; pagamento acima das liberações; pagamento sem liberação ou comprovante; liberação complementar sem original; nota conciliada com divergência de pagamentos ou competências.
- Atenção: parecer recusado; rascunho com 30 dias ou mais; NE formalizada e não emitida há 15 dias ou mais.
- Informativo: NE registrada sem liberação há 15 dias ou mais.
- A contagem de dias é apenas **parâmetro gerencial de monitoramento**, não constitui prazo normativo ou situação jurídica. Os alertas dependem dos dados registrados no PACTO; ausência de alerta não garante conformidade documental.

## Linha do tempo
- A página do lançamento reúne histórico auditável de etapas, pareceres, assinaturas, comprovantes, liberações, pagamentos, anulações e conciliação com filtro entre eventos documentais/financeiros.
- A consulta é limitada aos últimos 500 eventos da emenda; se atingir o limite, a interface sinaliza que o histórico está parcial. Eventos fora da amostra não serão exibidos.
- Autoria é mostrada de forma abreviada. Os IDs de evento nunca devem servir de identificação externa da SEFAZ.

## Testes e validação
- Testes unitários: `parcelas-rota.test.ts` (intervalos e fonte da rota), `indicadores.test.ts` (cálculo de centavos, conciliação, inconsistências, alertas temporais, exclusão lógica, exportação com proteção contra fórmulas).
- Build inclui o gerador de rotas TanStack; verificar que o caminho gera componente independente e navega tanto pelo botão `Gerenciar` quanto após `Novo lançamento`.
- Executar consultas **somente leitura** no Supabase operacional: contar lançamentos e meses, detectar pagamentos sem liberação, valores liberados acima da NE líquida e possíveis conciliações divergentes. Não criar empenhos fictícios para testes.
- Fluxos de escrita (parecer, assinatura, liberação e anulação) dependem de homologação humana com ACP/Admin em ambiente de teste ou processo real autorizado.
- Alertas podem ser filtrados por severidade, os indicadores pelos filtros existentes de situação e periodicidade. Os CSVs refletem o mesmo escopo filtrado.
