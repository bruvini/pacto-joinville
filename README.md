# Gestão de Empenhos

Crie um sistema web completo, responsivo e de nível corporativo para a Gestão, Auditoria e Pagamentos de Convênios e Parcerias da Secretaria Municipal de Saúde de Joinville. O sistema será utilizado pelo Enfermeiro Auditor da Área de Convênios e Parcerias (ACP) e pela Área de Contratos (ACO) para gerenciar fluxos do SEI, empenhos, atestos e anulações de repasses da saúde pública, utilizando o Supabase como infraestrutura de banco de dados.

### 1. DIRETRIZES DE DESIGN & IDENTIDADE VISUAL (Prefeitura de Joinville 2026)

O sistema deve seguir estritamente o Manual de Identidade Visual da Prefeitura de Joinville (Atualizado em 23/04/2026):

- Paleta de Cores Corporativa:

  * Azul Principal (Fundo escuro/Headers/Ações primárias): #003366 (tom exato das assinaturas da Prefeitura de Joinville).

  * Azul Claro / Ciano (Detalhes e Sub-assinaturas da ACP): #3399CC ou #40E0D0.

  * Verde Claro (Sucesso/Aprovado/Assinado): Tom institucional conforme a faixa lateral do manual.

  * Cinza (Bordas, Linhas de Divisão e Elementos Secundários): #808080.

- Tipografia: Moderna, limpa e altamente legível para a exibição de tabelas com dados financeiros densos.

- Comportamento de Telas: Exibir visualmente cartões e tabelas claras com fundo limpo (Branco) e cabeçalhos estruturados em Azul Institucional.

### 2. ARQUITETURA DO BANCO DE DADOS (Estrutura Supabase Vazia)

O banco de dados não deve conter dados pré-cadastrados, permitindo que o usuário alimente tudo manualmente via interface. Deve possuir as seguintes tabelas relacionadas:

- prestadores: id, nome_instituição, cnpj, status (ativo/inativo), data_cadastro.

- convenios: id, prestador_id, numero_processo_sei_mae, objeto, status_convenio.

- lancamentos_pagamento (Tabela Central unificando as duas planilhas de controle):

  * Dados ACP: prestador_id, convenio_id, descricao, termo_aditivo, parcela, competencia (Mês/Ano), mes_pagamento_previsto, valor_solicitado, link_solicitacao_sei, numero_empenho, link_empenho_sei, valor_atestado, valor_anulado (calculado: valor_solicitado - valor_atestado), link_solicitacao_anulacao, link_anulacao_sei.

  * Dados ACO: dotacao_orcamentaria, fonte_pagamento, status_aco (Enum: "Aguardando Indicação", "Aguardando Descontingenciamento", "Orçamento Disponível", "Empenhado"), valor_empenho_liquido.

- configuracao_assinaturas: id, etapa_processo (Enum: Solicitação de Empenho, Nota Técnica, Solicitação de Anulação, Anulação Executada), nome_servidor, cargo, codigo_sei, ativo (boolean).

- configuracao_sla: id, parametro_nome, dias_uteis_prazo, data_limite_mensal.

- historico_logs: id, lancamento_id, usuario, acao, data_hora, dados_anteriores, dados_novos.

- notas_comentarios: id, lancamento_id, usuario, mensagem, data_hora.

### 3. SEGREGAÇÃO DE FUNÇÕES E DIVISÃO VISUAL (ACP vs. ACO)

Baseado nas melhores práticas de auditoria financeira do SUS:

- Painel ACP (Área de Convênios e Parcerias): Identificado por bordas e elementos em tom Azul Claro/Ciano. Interface focada no Enfermeiro Auditor para iniciar solicitações de empenho, colar links do SEI, lançar valores atestados e solicitar anulações.

- Painel ACO (Área de Contratos): Identificado por bordas e elementos em tom Azul Escuro. Interface focada na equipe financeira para preenchimento de dotação, fonte, alteração de status orçamentário e valor líquido do empenho.

- Indicador de Responsabilidade (Visual Anchor): Cada card ou linha de processo deve exibir um Badge dinâmico no topo destacando o setor responsável pela próxima ação (ex: "🟡 AGUARDANDO AÇÃO DA ACO" ou "🔵 AGUARDANDO ATESTO DA ACP").

### 4. TELA DE CONFIGURAÇÃO MATRICIAL DE ASSINATURAS DO SEI

- Criar uma página de configurações dedicada onde o usuário pode cadastrar, por etapa do fluxo (Solicitação de Empenho, Nota Técnica, Solicitação de Anulação, Anulação), quem são as pessoas obrigatórias que devem assinar.

- Campos de Cadastro: Nome do Servidor, Cargo e Base de Identificação do SEI.

- Comportamento: Quando configurado, o sistema gera dinamicamente um Checklist de Assinaturas dentro de cada empenho baseado nessas regras vigentes. Alterações nesta página são retroativas apenas para os novos lançamentos ou lançamentos em aberto dali para frente, sem quebrar o histórico dos passados.

- Trava de Segurança: O lançamento só pode mudar de status ou avançar no fluxo após 100% das assinaturas da respectiva etapa estarem marcadas como "Assinado" (exibindo data, hora e o nome do validador).

### 5. PARAMETRIZAÇÃO DE SLA E ALERTAS DE QUALIDADE (Padrão SUS)

- Na tela de configurações, permitir que o Enfermeiro Auditor defina os Prazos Máximos em dias úteis para cada etapa e a Data Limite Mensal de lançamento (seguindo a lógica de encerramento mensal de faturamento e faturamento de tetos MAC/PAB do SUS).

- Dashboard com Alertas Visuais: Destacar em tons de vermelho ou laranja vibrante os processos com prazos de SLA estourados ou próximos do vencimento em relação ao fechamento da competência.

- Módulo de Notificações de E-mail (Mock/Simulado com logs em tela): Disparar avisos automatizados e estruturados sempre que um processo entrar em atraso orçamentário ou mudar de setor responsável (ACP ↔ ACO).

### 6. RASTREABILIDADE TOTAL E COMUNICAÇÃO INTERNA

- Timeline (Audit Trail): Exibir na parte inferior de cada processo uma linha do tempo vertical registrando cronologicamente tudo o que ocorreu (ex: "01/06/2026 14:00 - Link do Empenho adicionado por ACO").

- Seção de Notas e Adendos: Um mini-feed de comentários textuais interno para cada pagamento, permitindo que a ACP e a ACO conversem de forma contextualizada sobre divergências de valores, empenhos estimados ou dotações bloqueadas.

### 7. MÉTRICAS E EXPORTAÇÃO COMPATÍVEL

- Exibir cards de resumo financeiro no topo: Total Solicitado, Total Empenhado Líquido e Valor Total Anulado na Competência Atual.

- Prover um filtro avançado robusto (por Prestador, Competência, Status e Número SEI) e um botão de exportação unificada para CSV/Excel estruturado exatamente com a união das colunas das duas planilhas originais.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://gestao-empenhos.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/3cabfbe8-8a4d-46f6-a76a-4e62ba00e641).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
