# Plano de reconstrução tela a tela · Cirurgias Eletivas (HTML 2.42.2 → Lovable)

**Situação:** plano de implementação, NÃO uma alteração de tela ou aprovação de paridade.
**Referência imutável:** HTML fornecido pelo usuário em 16/10/2026, `Auditoria - Cirurgias Eletivas - 102026(1).html`, SHA-256 `75494e80e28fc59596e43a2ba0fb7a0caf9a50bafbd3a5f4c94dd95a22fe7186` (8.884 linhas).
**Alvo:** `bruvini/pacto-joinville`, rota `src/routes/_authenticated/eletivas.$id.tsx`, infraestrutura React/TanStack/Supabase.
**Objetivo:** paridade visual, semântica e de interação com a referência, **sem** copiar o motor de dados local para cima das regras institucionais.

## 1. Diagnóstico: por que a Fase 6 ficou parecida, mas diferente

A reconstrução anterior criou uma shell CSS `.ec-sc` e reaproveitou componentes existentes do React, acrescentando novos painéis e resumos. Isso não reconstruiu sistematicamente a marcação, hierarquia, conteúdo e microinterações de `#v-arquivos`, `#v-painel`, …, `#v-manual`. Por exemplo:

- O HTML usa **imagem real da bandeira catarinense** na marca `.brand-flag img`, enquanto o React desenha uma marca ilustrativa em CSS.
- A aba Fontes usa `.files-hero`, `.intake-layout`, `.sources-board`, `.run-dock`, `.techlog`; o React usa hero e agrupamentos diferentes.
- O Painel do HTML é gerado por `renderPainel()` como KPIs e quadros específicos dos agregados; `PainelScEletivas` reorganizou e redesenhou as tabelas.
- O Auditor de faixa original é um conjunto de `.fx-kpis`, cartões `.fx-card`, ações por AIH e explicações normativas; `AuditorFaixaEletivas` virou uma tabela com modal.
- O Manual original `#v-manual` tem **28.846 caracteres de HTML**, 10 capítulos, seis cartões de passos, três tabelas e fluxograma BPMN com 21 elementos diagramáticos; `ManualProcessoEletivas` é um resumo de onze cartões. Isso não atende paridade de conteúdo.
- A exportação HTML tem **dois cartões específicos**, estatísticas, aviso de pendências, e dez abas XLSX; o React apresenta também controles de homologação e documentos dentro do mesmo espaço visual.

**Decisão arquitetural:** a referência **dita a UI**. Os serviços e as regras do Lovable ditam **origem, segurança, salvamento, permissões e auditabilidade**. Não se substitui a aparência com equivalentes “parecidos”; cria-se um componente fiel para cada padrão original, ligando-o às operações existentes por adaptadores.

## 2. Contrato de paridade que vale para TODAS as telas

### 2.1 Shell e design system — etapa zero, antes de qualquer tela

Construir um `EletivasShell` específico, com `EletivasTokens`, `EletivasNav`, `EletivasContext`, `EletivasTopbar`, `EletivasSearch`, `EletivasStamp`, `EletivasLedger`, `EletivasModal`, `EletivasEmptyState` e `EletivasLoadingState`.

A verdade visual é o CSS **efetivo após cascata**, e não o primeiro bloco do arquivo HTML: há estilos iniciais “livro-razão” e rebrands v2.8/v2.10 e componentes acrescentados até v2.42.2. Conferir com `getComputedStyle` no HTML renderizado. Tokens finais de referência: vermelho `#ef202c`, verde `#a6ce2e`, fundo `#f4f5f1`, tinta `#17332c`, borda `#e3e7e1`; sidebar 276px desktop; fontes **Fraunces**, **Public Sans** e **Spline Sans Mono** com suas famílias fallback. Usar a imagem da bandeira efetivamente embutida no HTML, servida como asset do projeto; não simular com retângulos. CSS estritamente sob o escopo do módulo, sem sobrescrever `body`, botões ou componentes de Fluxos 1/2 e demais módulos.

Recriar logo/cabeçalho/cartão de contexto/indicadores/teclado/foco/overflow responsivo/rodapé e busca contextual tal como na referência. As legendas e os estados vazios são parte da paridade, não apenas detalhes cosméticos.

### 2.2 Adaptações INSTITUCIONAIS aprovadas, que jamais devem regredir

1. **Criação/abertura:** o usuário continua em `/eletivas` selecionando **instituição → convênio Fluxo 1 ativo → competência/parcela individual aberta**, vinculando ou reutilizando o mesmo Encontro. Não criar competência ou parcela fictícia, não aceitar convênio incompatível, não duplicar prestador+mês. A tela standalone não substitui esse processo.
2. **Contexto lateral:** CNES, prestador e competência vêm do lançamento vinculado e cadastro institucional, não são inputs livres com poder de reatribuir a identidade. Exibir com a estética dos inputs originais, porém `readOnly`; exibir parcela e link “Abrir lançamento de origem” em ação contextual discreta.
3. **Armazenamento:** sessão local/cache do HTML torna-se recuperação pelo banco da competência, arquivos privados e hash SHA-256, com snapshots/evidências congeladas. Não copiar dados pessoais para storage local.
4. **RBAC e rastreabilidade:** RLS, papéis ACP/Admin, documentos, correções versionadas, autoria, revisão, exclusão/arquivamento e eventos permanecem. Nenhuma ação silenciosa para “imitar” comportamento local do HTML.
5. **Motor financeiro:** preservar o cálculo validado, faixas/CIB, precedência de decisões, nenhuma dupla soma `faec_fxmac` e bloqueios de FPO não comprovada. A UI não recalcula financeiras por conta própria.
6. **SEI e convênio:** RTMA/Análise são minutas preparadas; campos e links de documentos oficiais permanecem no lançamento do convênio em **Etapa 6 — Liberação de Recurso**. Não inventar assinaturas, autenticação, envio ou repasse.
7. **Privacidade:** a frase original “Dados processados localmente” não deve ser copiada literalmente no Lovable — é falsa para arquivos privados Supabase. Substituir somente esta indicação por “Arquivos institucionais protegidos · acesso autenticado”, anotando a exceção visual/textual.
8. **Operações extras do React** (fechamento, homologação Fase 8, histórico técnico e recuperação administrativa) não serão removidas, mas viverão em área administrativa contextual/drawer próprio, **fora dos 11 corpos originais**. Não contaminar painéis de referência.

### 2.3 Padrão de entrega de UMA tela por vez

Para cada tela:
- congelar screenshot do **HTML** com dados/cenário de referência e dimensões **1440×900, 900×900, 390×844**;
- inventariar hierarquia DOM, textos, cards, tabelas, linhas, estados, ícones, animações, focus, diálogos e eventos JS associados;
- criar componente React dedicado, usando os **mesmos blocos, ordem, conteúdo e relações espaciais**, com adaptador fino para os dados/RPCs existentes;
- fotografar React com **mesma competência, filtros, dados, estado do modal e viewport**; comparar lado a lado e sobrepor capturas; registrar diferenças e corrigi-las antes de avançar;
- testar estado vazio, carregamento, erro, leitura, perfil de escrita, desktop/tablet/celular, acesso por teclado e resultado de cada botão;
- verificar ausência de regressões em totais, arquivos, histórico, lançamento e segurança;
- entregar commit/CI e imagens comparativas com checklist do **usuário fiscal homologador**. Uma tela não fica “concluída” só porque o CI passou.

Usar modo paralelo de visualização (UI antiga vs UI de paridade) apenas durante desenvolvimento/homologação, com as duas interfaces **lendo as mesmas fontes**; nunca duplicar tabelas/mutações financeiras. Remover a antiga apresentação somente depois da aprovação da tela nova.

## 3. Inventário de telas — o que será reproduzido

### 01 · Fontes da competência (`#v-arquivos`, CSS `.files-hero`; JS `routeFile`/`updateReady`)

**HTML:** hero original “Reúna as fontes. O sistema cuida do resto.”, selo “01 · Preparação da competência”, ajuda TabWin, painel “Análises salvas neste navegador”, grande área de soltar arquivos, coluna lateral “O que você precisa reunir”, quatro seções numeradas de slots (`Tabulações locais`, `Retorno SES · hospitalar`, `Retorno SES · ambulatorial`, `Fontes de apoio`), estado de fontes reconhecidas, barra `Analisar competência` e diagnósticos recolhíveis.

**Hoje:** `FontesEletivas` possui leitura/classificação, mas dispõe hero/slots/cartões e alertas de forma diferente.

**Adapter:** dados de `eletivas_arquivos`, manifesto hash e execução; recuperar análises pelo Supabase no lugar de LocalStorage. Reproduzir estados `não enviado` / `reconhecido` / `não classificado` / `erro` sem alterar o parser.

**Aceite:** print de tela vazia + um lote válido/um inválido; as quatro seções e barra preservam a ordem/medidas/estados; erro não grava conciliação parcial.

### 02 · Painel (`#v-painel`, JS `renderPainel`)

**HTML:** sequência de KPIs, `h3.sec` numerados, ledgers próprios dos componentes, total e alertas, incluindo dados não publicados e controle não somado.

**Hoje:** `PainelScEletivas` reorganiza valores em outras tabelas e cartões.

**Adapter:** leitura do resumo reconciliado/SQL e itens existentes, *sem* novo cálculo independente no JSX.

**Aceite:** ordem dos KPIs, títulos, quadros e linhas idêntica; totais por componente e consolidado coincidem **centavo a centavo**; `faec_fxmac` é controle.

### 03 · Correções recebidas (`#v-correcoes`, JS `renderCorrections`)

**HTML:** hero explicativo `.corr-hero`, KPIs de valor/AIHs/competências, formulário `.corr-form`, busca de vínculos com competência anterior, lista `.corr-entry` com AIHs, valor e ações editar/excluir.

**Hoje:** seção interna de `DocumentosEletivas` com formulário e lista diferentes.

**Adapter:** `eletivas_correcoes`, vínculo anterior, justificativas, aprovações e anti-duplicidade. A ação “excluir” do HTML **não pode remover silenciosamente evidências auditadas**: apresentar anulação/revisão correspondente, com rótulo explícito de diferença institucional.

**Aceite:** mesmos cartões/formulário/lista/estado; apenas correções aprovadas entram em valor calculado.

### 04 · FPO · Art. 19 (`#v-fpo`, JS `renderFpo`)

**HTML:** `.fpo-hero`, três cartões de regra, fórmula `federal programado + residual SES`, aviso de Nota Informativa 05/2026, KPIs/quadros “Produção da competência × FPO oficial” e “Situação da programação local”, tabelas/estados diferentes antes/depois de 08/2026.

**Hoje:** `PainelEletivas(modo=fpo)` e outras áreas auxiliares.

**Adapter:** mesmo resultado normativo e vigência, consultando evidências reais, sem criar crédito se faltar prova de FPO efetiva.

**Aceite:** 07/2026 mostra regime anterior, 08/2026 posterior; disposição/tabelas/avisos na mesma sequência da referência.

### 05 · Auditor de faixa (`#v-faixas`, JS `renderFaixas`/`openAihActionModal`)

**HTML:** `.fx-hero`, contadores clicáveis por enquadramento, filtros, cartões por AIH `.fx-card` com componentes/filhos, estados, botão “Ver diagnóstico e ação”, “Como concluiu?” e “Regularizar FPO”; modais de inspeção e contextualização normativa.

**Hoje:** `AuditorFaixaEletivas` apresenta uma tabela de AIHs, que não corresponde aos cartões originais.

**Adapter:** manter classificação por AIH, filhos e norma vigente; ações chamam decisões/fluxos protegidos do backend.

**Aceite:** cartão e modal reproduzidos com mesma AIH, decomposição, motivo e enquadramento; nada de rateio financeiro artificial.

### 06 · Comunicações (`#v-comunicacoes`, JS `renderCommunications`)

**HTML:** hero “Uma comunicação por assunto, não um e-mail por AIH.”; quadro com Central de Regulação, GEMAS, tratamento interno/FPO, histórico de envios; grupo de candidatos, minuta com assunto/corpo, copiar, marcar envio.

**Hoje:** `ComunicacoesEletivas` mostra fluxos e comunicação em painéis de composição diferentes.

**Adapter:** `eletivas_comunicacoes`, eventos, rotas, versão, protocolos; preservar filas e reaberturas. “Marcar enviado” exige evidência real de envio.

**Aceite:** telas vazias/com fila/com enviado/retomado, composição em grupo, ausência de duplicações por AIH.

### 07 · Itens conciliados (`#v-pagos`, JS `renderPagos`)

**HTML:** blocos **FAEC — SIH**, **MAC — SIH** e **SIA — ambulatorial**, cada qual com suas tabelas analíticas/estados e abertura de investigação.

**Hoje:** `AuditoriaEletivas(modoTela=conciliados)` reaproveita componentes da fila.

**Adapter:** mesmo classificador/decisão fiscal e dossiê disponível, porém layout `ledger` original, não a apresentação da fila.

**Aceite:** três blocos, grupos/subtotais, ações e dossiê iguais; rótulo “conciliado” não equivale a pagamento efetivo sem comprovante.

### 08 · Fila de auditoria (`#v-fila`, JS `renderFila`, `renderPend`)

**HTML:** barra de cinco estados de decisão, cartões detalhados de pendência/divergência, decisão por opção com justificativa, guia de decisão, decididos e botão desfazer/revisar, vínculo a regularização e dossiê.

**Hoje:** mesma `AuditoriaEletivas` em modo fila, com organização diferente da referência.

**Adapter:** mutações fiscais existentes, trilha de revisão `eletivas_decisoes_revisoes`, rastreio de decisões e estados.

**Aceite:** cinco indicadores e fluxos de decisão reproduzidos; alteração exige justificativa, registra evento e não apaga decisão antiga.

### 09 · Atesto (SEI) (`#v-atesto`, JS `renderAtesto`/`buildRelAnalise`)

**HTML:** strip de indicadores, aviso de pendências, documento `.docwrap` do **Relatório Técnico**, quadro SEI, campos institucionais e carimbos, documento de **Relatório de Análise**, ações de copiar e organização completa dos quadros/6 blocos.

**Hoje:** `DocumentosEletivas` + `DocumentacaoFase5Eletivas` colocam formulário genérico e prévias em cartões de outra estética.

**Adapter:** resultados monetários e quantidades **read-only**, textos institucionais editáveis só com papel e em campos autorizados; cópia de minuta sem assinatura; vínculos oficiais RTMA/Análise no lançamento Fluxo 1, etapa 6.

**Aceite:** mesma hierarquia visual dos documentos e quadros, campos e orientação SEI; copiar preserva tabelas; nenhum valor pode ser alterado manualmente.

### 10 · Exportar (`#v-exportar`, JS `renderExport` e handlers `#expXlsx`/`#expCsv`)

**HTML:** três estatísticas no topo, aviso de decisões pendentes, **dois cartões separados** XLSX/CSV com ícones, mini-tags de abas/colunas, filenames e botões; nota de privacidade.

**Hoje:** exportação foi inserida em `DocumentacaoFase5Eletivas` com botões diferentes e homologação Fase 8 no mesmo corpo.

**Adapter:** usar `gerarXlsxHtmlFase7EC` com 10 abas e `gerarCsvDivergenciasFase7EC`, mas reconstruir os dois cartões. Fase 8 deve sair do corpo para a ferramenta administrativa de homologação.

**Aceite:** mesma distribuição de conteúdo e comportamento dos dois downloads; nomes das 10 abas, CSV, decisão e valores correspondem ao HTML.

### 11 · Manual do processo (`#v-manual`, seção HTML real com 28.846 caracteres)

**HTML:** título **“Do arquivo do Estado ao atesto no SEI”**, hero com **6 passos / 3 checagens / 5 destinos**, índice navegável `.man-toc` alimentado por JavaScript, dez capítulos identificados por `m-inicio,m-passos,m-cib,m-fluxo,m-principio,m-fontes,m-checagens,m-destinos,m-base,m-biblio`, seis `.stepcard`, três tabelas, explicações, fontes/links, biblioteca, diagrama BPMN com gateways, lanes, minitasks e casos.

**Hoje:** `ManualProcessoEletivas` substituiu tudo por onze cartões de resumo — não é paridade de texto, diagrama nem estrutura.

**Adapter:** transportar **integralmente** o conteúdo original para componentes React sem reinterpretar, abreviar, reescrever nem alterar termos; preservar âncoras, índice, tabelas, BPMN e ligações. Acrescentar apenas notas institucionais claramente rotuladas sobre fluxo de criação, persistência e SEI, sem modificar o texto histórico de referência. Não renderizar HTML/JS não sanitizado de arquivos importados.

**Aceite:** correspondência literal dos dez capítulos e títulos, seis passos, conteúdo de referência e links, três tabelas, BPMN completo e navegação por âncoras, em três resoluções.

## 4. Ordem proposta de execução (uma homologação por entrega)

A **ordem do menu permanece 01 a 11**, idêntica ao HTML. Para reduzir risco de continuar o patchwork, a **ordem de construção** é:

- **Lote 0 — Base:** shell, tipografia, imagem da bandeira, tokens CSS finais, busca, carimbos, tabelas, modais, capturas baseline e roteamento sem afetar Fluxos 1/2.
- **Lote-piloto — Manual (#11):** primeira tela a atingir *paridade estrita* de conteúdo, estrutura e diagrama, porque não depende de motor financeiro e expõe a falha atual. O usuário confirma o padrão antes de replicá-lo.
- **Lotes 01 e 02 — Fontes e Painel:** entrada/validação e leitura financeira, sem qualquer alteração no cálculo.
- **Lotes 03 a 06 — Correções, FPO, Auditor de faixa, Comunicações:** ações institucionais e seus contextos.
- **Lotes 07 e 08 — Conciliados e Fila:** mesma interpretação dos estados; UI específica de cada tela.
- **Lotes 09 e 10 — Atesto e Exportar:** maior sensibilidade documental e financeiros somente leitura.

**Sem “big bang”:** nunca mudar as onze telas no mesmo commit; cada lote/tela só fecha com teste, screenshots e aprovação do usuário. Devolver link de commit SHA, links SQL **somente quando necessários**, motivo de eventual desvio inevitável e passos curtos de teste.

## 5. Matriz fixa de aceite e validação

Para cada tela, registrar:
- `UI`: hierarquia de blocos, posição, cores, fontes, pesos, espaçamento, tamanho, ícones, tabelas, modal, mensagens e responsividade comparados em prints pareados.
- `Interação`: estado vazio, loading, erro, clique, teclado, foco, busca, filtros, expansão, validação e cópia/download.
- `Dado`: identidade do registro, hashes das fontes, valores por item/AIH, decisão, justificativa, vínculo da parcela, documentos e histórico.
- `Segurança`: leitura vs escrita ACP/Admin, RLS, logs/arquivos privados, negação de exclusão indevida, sem reenvios involuntários.
- `Regressão`: sem alteração de Fluxos 1/2, convênio, Piso, Prestação, PVH, fechamentos já homologados e total fiscal.

**Homologações obrigatórias do projeto:** a UI visual deve ter casos com 04/2026 (layout antigo), 07/2026 (novo MAC múltiplas/seq., CIB 727) e 08/2026+ (FPO e CIB 399). Para os testes visuais comparar **a mesma competência, arquivos, decisão, estado, zoom e dimensões**. Também testar casos sem arquivos/pendentes/encerrados/arquivados.

**Limite da evidência:** o CI e os testes visuais automatizados podem verificar regressão, mas a aprovação fiscal do layout e dos relatórios exige os prints e a decisão humana do responsável. Não declarar equivalência comprovada sem confronto de tela real.

## 6. O que NÃO faremos nesta reconstrução

- Reimplementar o motor HTML num `iframe` com localStorage, permitindo que ele decida valores fora da base institucional.
- Converter a interface original em “cards genéricos” somente com os mesmos títulos.
- Misturar novas funcionalidades administrativas à ordenação das 11 páginas e depois chamar isso de fidelidade.
- Editar somas/quantidades para fazê-las coincidir com prints.
- Alterar criação de competência, convênio, parcela, identidade CNES ou origem de atesto.
- Fazer migrações SQL por razões puramente estéticas.
- Substituir a operação anterior antes da homologação das telas, da comparação financeira e da autorização fiscal.

## 7. Primeiro passo executável

**Próxima entrega planejada:** Lote 0 (shell fiel + biblioteca de componentes + capturas base) e, depois, **tela 11 — Manual do processo** como piloto da metodologia de paridade. Só após validação do usuário avançar para **tela 01 — Fontes da competência**. A lista/abertura institucional de competência existente permanece ativa durante todo o processo.
