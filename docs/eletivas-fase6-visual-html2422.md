# Fase 6 · Reconstrução visual do Encontro de Contas — HTML 2.42.2

## Referência

Arquivo do usuário: `Auditoria - Cirurgias Eletivas - 102026.html`, SHA-256 `75494e80e28fc59596e43a2ba0fb7a0caf9a50bafbd3a5f4c94dd95a22fe7186`.
Menu original: `nav.side[data-view]`, com 11 entradas: `arquivos,painel,correcoes,fpo,faixas,comunicacoes,pagos,fila,atesto,exportar,manual`.
Identidade final extraída do trecho **REBRAND v2.10 — Santa Catarina editorial / civic-tech** do HTML, e não do CSS inicial livro-razão: vermelho `#ef202c`, verde `#a6ce2e`, texto `#17332c`, fundo `#f4f5f1`, superfícies `#fff`, bordas `#e3e7e1`. Títulos editoriais Fraunces/Georgia, texto Public Sans/system-ui, valores Spline Sans Mono/ui-monospace. Barra lateral de 276 px na referência, contextos CNES/competência/norma, barra superior com título e busca contextual, carimbos, tabelas tipo ledger, botões e cartões.

O conteúdo antigo do HTML é amplo e o módulo React já continha evidências institucionais adicionais. **A Fase 6 não altera a regra do motor, não altera dados persistidos nem duplica operações financeiras.** Todos os estilos estão confinados ao ancestral `.ec-sc` no arquivo `src/styles/eletivas-sc.css`.

## Mapeamento das 11 entradas

| Ordem | HTML | Componente atual | Observação |
| --- | --- | --- | --- |
| 01 | Fontes da competência | `FontesEletivas` | Primeira aba ao abrir a competência; preserva upload privado e origem |
| 02 | Painel | `PainelScEletivas` | Quadros FAEC, MAC, SIA, Correções, Consolidado financeiro |
| 03 | Correções recebidas | `DocumentosEletivas(modo=correcoes)` | Mesmos RPCs de competência de origem, aprovação e deduplicação |
| 04 | FPO · Art. 19 | `PainelEletivas(modo=fpo)` | Mesmas evidências de FPO/SEI, sem geração de crédito |
| 05 | Auditor de faixa | `AuditorFaixaEletivas` + `ConferenciaNormativaEletivas` | Tabela de AIHs com filtros + modal do dossiê |
| 06 | Comunicações | `ComunicacoesEletivas` | Destinos, FPO operacional, envio e reaberturas |
| 07 | Itens conciliados | `AuditoriaEletivas(modoTela=conciliados)` | Somente conciliados; conserva decisão e histórico |
| 08 | Fila de auditoria | `AuditoriaEletivas(modoTela=fila)` | Somente itens da fila, com filtros, dossiê e decisão |
| 09 | Atesto (SEI) | `DocumentosEletivas(modo=atesto)` | Relatórios e referências; fechamento administrativo em área expansível |
| 10 | Exportar | `DocumentosEletivas(modo=exportar)` | Relatórios/XLSX; homologação em área expansível ACP/Admin |
| 11 | Manual do processo | `ManualProcessoEletivas` | Roteiro; histórico institucional expansível sem apagar JSON |

**Por que fechamento, homologação e histórico não estão no menu:** são funções institucionais reais que surgiram no React. Foram preservadas dentro das seções 09–11; o menu mantém EXATAMENTE as 11 entradas e a ordem original.

## Comparação por capturas

- Referência original: renderizar o HTML em 1440 × 900 após o fim da animação inicial.
- Aplicativo: após sincronizar a `main` e aplicar as migrations das fases anteriores, abrir `/eletivas/<id>` autenticado com a **mesma competência de teste** e usar 1440 × 900.
- Conferir lado a lado: sidebar branca, marca superior com vermelho/verde, cartão de contexto, rótulos em ordem exata, topo, busca, cards, tabela financeiro, carimbos, dossiês abertos e modal do Auditor.
- Repetir em 900 × 900 e 390 × 844. Na versão móvel o menu horizontal tem rolagem, sem esconder as últimas seções nem causar rolagem horizontal do conteúdo.
- Para cada tela numerada, capturar cabeçalho e pelo menos um estado útil: Fontes (preenchido), Painel (FAEC/MAC/SIA/Correções/Consolidado), Correções, FPO, Auditor (modal), Comunicações (fila), Conciliados, Fila (dossiê e decisão), Atesto (SEI), Exportar e Manual.
- Verificar estados vazios, carregando e erro, foco por teclado, botão voltar à lista e permissões ACP/Admin.

**Limitação explícita da validação deste commit:** o CI automatizado testa a existência, escopo e navegação dos componentes, mas NÃO consegue acessar a sessão autenticada do Lovable do usuário; portanto, a aprovação de **paridade visual pixel a pixel** permanece pendente até as capturas reais do aplicativo após implantação. Não declarar "100% igual" com base apenas nos testes estáticos.

## Critérios de aceite de regressão operacional

1. Julho/2026 permanece ligado à parcela do Fluxo 1; não criar segunda competência.
2. As quatro fontes obrigatórias, SHA-256 e processamento de arquivos mantêm o comportamento da Fase 2.
3. Os totais FAEC/MAC/SIA, correções, controle FAEC faixa MAC (não somado) e total preliminar permanecem idênticos em centavos ao SQL.
4. A Norma 727 de julho e a 399 de agosto aparecem na lateral e no Auditor; código `030907001` continua consultável fora da produção.
5. Decisões fiscais e correções permanecem versionadas e editáveis só com perfil correto.
6. Comunicações registradas não são reenviadas automaticamente e o botão "Copiar" não confirma o envio.
7. Somente correções aprovadas entram no atesto; encerramento e homologação continuam visíveis na seção apropriada.
8. Regressão visual não pode afetar Fluxo 1/2, Prestação de Contas, Piso da Enfermagem ou outros módulos.

## Implantação

**Não há migration SQL nova na Fase 6**: somente CSS, componentes React, navegação e testes. Basta sincronizar a versão publicada na `main`; em projetos com deploy separado, publicar/atualizar o preview.

Se a nova seção Comunicações der erro de tabela, isso remete à migration da **Fase 5**, não à Fase 6. Não execute migrations antigas novamente sem necessidade.

## Testes de código

`src/lib/eletivas/fase6Visual.test.ts` confere a ordem do menu, classes isoladas, mapeamento de telas e preservação dos RPCs de correções, decisões e históricos. Os testes anteriores asseguram valores e regras com amostras; a equivalência de conteúdo real com o HTML requer o Golden Master da competência.
