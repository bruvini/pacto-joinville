# Módulo Piso da Enfermagem — plano de implementação

Módulo próprio (não é Fluxo 3), centrado na **competência mensal** como processo-mãe. Nada nos Fluxos 1 e 2, Prestação de Contas ou Auditoria de Anulações é alterado.

## Entrega em 4 fases (cada fase fica utilizável ao final)

**Fase 1 — Base de dados, segurança e estrutura**
- Tabelas: competências, participantes (ligados a prestadores existentes), CNES múltiplos, obrigações/NEs, documentos (catálogo de tipos), assinaturas por documento, eventos de encaminhamento, arquivos, ocorrências de auditoria, conciliações, feriados/calendário, matriz de assinaturas do Piso.
- Permissões no banco por papel (Admin, ACP, UFI) — leitura para autenticados, escrita conforme papel.
- Trilha de auditoria por gatilhos em `historico_logs` (nova coluna de vínculo com a competência), sem CPF.
- Armazenamento privado para planilhas/PDFs, com hash SHA-256, tamanho, tipo e autor.
- Marcação "requer reconferência" automática nas etapas seguintes quando um dado anterior muda (sem apagar histórico).

**Fase 2 — Telas centrais**
- Menu "Piso da Enfermagem": lista de competências (filtros, status, pendências) e criação.
- Tela da competência com esteira das 8 etapas, timeline e badges de pendência.
- Componentes: cartão de documento (nº SEI, link, data, assinaturas, "alterado por"), evidência de arquivo, conferência financeira, cartão de instituição/obrigação.
- `BlocoAssinaturas` passa a aceitar qualquer entidade (lançamento ou documento do Piso) sem mudar o comportamento atual.

**Fase 3 — As 8 etapas**
1. Preparar: envio/retorno por instituição, prazos em dias úteis (5º/10º/15º) a partir do calendário configurável, alertas de atraso, bloqueio de datas incoerentes, upload e auditoria da Planilha de Carga (CPF, CNES, CBO, jornada, salário, categoria, duplicidades), importação InvestSUS com totais por categoria/CNES/instituição.
2. Portaria GM/MS: dados, URL DOU (só `https://*.in.gov.br`), PDF, conciliação centavo a centavo, justificativa formal para exceção.
3. Portaria municipal: Minuta, Memorando e Portaria como documentos separados com assinaturas; geração/cópia de textos; total publicado = total apurado.
4. Recurso: crédito no FMS, saldo AFC, fontes, rateio por instituição com trava.
5. Empenho/liquidação: várias obrigações por instituição, Solicitação de NE e Nota de Empenho, validações de saldo e soma.
6. e-Pública: Subempenho/Liquidação e Aviso de Movimento com assinaturas; botão "Registrar encaminhamento" (usuário + data/hora, reversão auditável).
7. Pagamento: Aviso de Subempenho, Programação, Comprovante, valor pago = valor a liquidar.
8. Resumo e encerramento com relatório PDF completo.

**Fase 4 — Integrações**
- Configurações: matriz de assinaturas por tipo de documento (iniciando com as regras indicadas; demais sem cargos obrigatórios) e calendário de feriados.
- Dashboard: card resumido do Piso (competência atual, etapa, pendências).
- Logs de acesso com nomes amigáveis das novas páginas.
- Notificações nas mudanças de etapa/pendências.
- Revisão final de regressões e testes das regras de cálculo.

## Detalhes técnicos
- Migrações com GRANT + RLS em todas as tabelas; travas de valor e coerência via gatilhos/funções (não só na tela).
- Camada de dados em `src/lib/piso/` (tipos, consultas, hooks React Query, regras puras testadas com vitest); componentes em `src/components/piso/`; rotas `/_authenticated/piso` e `/_authenticated/piso/$id`.
- Leitura de planilhas no navegador (biblioteca xlsx já usada no projeto); arquivo original nunca é alterado; CPF mascarado na interface.
- Decisões estruturais registradas em `AGENTS.md`.
