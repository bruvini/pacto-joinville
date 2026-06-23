# Plano de ação — ajustes (2026-06-23)

Ordem por dependência/risco. Cada item será uma entrega revisável.

## Já feito
- ✅ Status ACO automático (dotação+fonte → Orçamento Disponível) — destrava etapa 3 (commit f9f5231).
- ✅ Links SEI sem https:// agora válidos (commit anterior).

## Fase A — Correções de exibição (rápidas, baixo risco)
1. **Rótulo de etapa real** na lista de Lançamentos e no "Últimos lançamentos" do
   dashboard (deriva dos dados via `etapaCorrenteLabel`); corrigir o filtro de etapa.
2. **SLA / Atraso**: dashboard "Processos em atraso" + indicador na lista usam o
   prazo do convênio (dia início/limite) — não mais `data_limite`.
3. **Linha do tempo legível**: renderizar o diff (`detalhes`) com nomes de campo
   amigáveis e valores formatados (R$, datas, Sim/Não), em vez de "Campos atualizados".

## Fase B — Assinaturas/Configurações
4. **Configurações › signatários**: remover a divisão por etapa (cadastro só
   nome + cargo, serve para qualquer etapa). Cargos: adicionar **"Coordenador de
   Orçamentos"**; renomear **"Coordenador" → "Coordenador ACP"**.
5. **Etapa 1 — 5 slots de assinatura** (após revisão): Fiscal · Coordenador de
   Orçamentos · Gerente/Coordenador ACP · Diretor de Serviços Complementares ·
   Diretoria Financeira/Secretária de Saúde.

## Fase C — Etapa 4 (Liberação de Recurso) reorganizada
6. Separar **Certidões Negativas** (link próprio) e **Valor Atestado** em blocos
   distintos. Blocos seguintes (Solicitação de Liberação → Assinaturas → SEFAZ →
   Acompanhamento) só aparecem quando os anteriores estão completos
   (links + assinaturas + valor atestado).

## Fase D — Finalização + PDF
7. Quando o processo fica 100%, **finaliza**: vira **modo leitura** (sem edição)
   e ganha botão **"Exportar histórico do lançamento (PDF)"** bem formatado.

## Fase E — Extras
8. **Mais conquistas** no dashboard (ampliar o rol de selos).
9. **Auditoria de Anulações**: filtros por **competência, prestador e convênio**.
10. **Tooltips** nos campos novos (relatórios, certidões, links de
    acompanhamento, teto mensal, prazos, etc.).

## Decisões/assunções a confirmar — ver perguntas
- Conteúdo do PDF do lançamento; quem pode editar após finalizar; regra de
  atraso; ruído da linha do tempo.
