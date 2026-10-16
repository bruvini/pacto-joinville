# Paridade v2.42.2 · Correções Fontes e Tela 02 Painel

## Referência
Fonte congelada: `Auditoria - Cirurgias Eletivas - 102026(1).html` — SHA-256 `75494e80e28fc59596e43a2ba0fb7a0caf9a50bafbd3a5f4c94dd95a22fe7186`.
`#v-painel` recebe `renderPainel()` (aprox. linhas 6148–6203 do arquivo standalone), que usa `aggregates()`, `normativeContextBanner()`, `operationalPendingBandHtml()`, `alertCenterHtml()` e `checkmateHtml()`.

## Correção de importação / navegação (Fontes)

- `FontesEletivas` continua chamando `executarPreConciliacaoLocal`, que só retorna sucesso depois de validar SHA, conteúdo, regras de CNES, impeditivos financeiros e concluir a gravação única por `ec_importar_itens_local`.
- Na confirmação de sucesso, o componente aguarda `onRefresh()`, que agora invalida e aguarda a recuperação das queries institucionais, e somente então chama `onAnalisado()` para selecionar **Painel**. Em erro ou impedimento, permanece em Fontes e apresenta o diagnóstico; **nenhum resultado parcial deve ser registrado**.
- As ausências de publicação das abas Físico/Financeiro/Complemento de outros hospitais continuam como **aviso informativo** fora da seção técnica. O placeholder antigo `// aguardando arquivos…` foi substituído por “Nenhum erro de importação registrado.”; falhas reais continuam aparecendo.
- Removidos **Registro individual de fonte · opção institucional**, seu seletor específico e a nota adicional posterior. A importação em lote e os slots individuais com revisão/validação **permanecem**. O rodapé "HMSJ · CNES ..." não é exibido nas páginas Fontes e Painel.

## Reconstrução Tela 02 · Painel

O React anterior distribuía FAEC, MAC, SIA, Correções e Consolidado em quadros próprios e inseria seis KPIs. Isso era **diferente do HTML**. A apresentação foi substituída por:

1. **Cinco KPIs**, na sequência original: valor considerado no atesto, não pago/divergente, pendentes de decisão, conciliados, a receber via ofício.
2. **Banner da base normativa**, obtida da matriz CIB congelada segundo a competência (julho: 727; agosto: 399).
3. **Pendências que exigem ação** — cinco cartões clicáveis de regularização FPO, faixa/composição, correções reconhecidas, cobranças via ofício e decisões pendentes. A navegação usa a mesma instância de competência e módulos já presentes.
4. **Centro de Alertas da Auditoria**, expansível, com memória de divergências verificadas, pendências fiscais e acesso à fila ou ao auditor de faixa. Nenhuma mudança na classificação financeira.
5. **Checkmate final SES**, comprovando ou recusando a comparação com o Consolidado SES da própria competência e CNES. Se não houver memória verificável, exibe indisponibilidade, não extrapola resultados de outros prestadores.
6. **Consolidado único de 24 linhas**, mantendo título, ordem e distinção de linhas físicas, subtotais, recorte FAEC faixa MAC (controle), correções, valor do atesto e ofício. As rubricas financeiras vêm de `resumoEncontro` (centavos) e a equivalência total é conferida por `ec_resumo_financeiro`. Nenhuma segunda soma do recorte de controle.
7. **Faixa de pendências de decisão**, apontando a fila em aberto. A igualdade centavo a centavo no banco **não equivale** à certificação documental ou aprovação fiscal.

### Diferenças conscientes de infraestrutura

O standalone calcula quantidades físicas `qtMine`/`qtState` em memória da sessão, enquanto o React utiliza `eletivas_itens.detalhe.qt_procedimentos` ou `qt_ses` **somente quando disponível e verificável**. Quando ausentes, apresenta `—`, e não uma contagem fabricada. Auditoria por AIH e o número de elementos na fila devem ser confrontados com os arquivos oficiais antes da homologação de paridade financeira.

O Centro de Alertas original deriva um conjunto de alertas muito amplo dos objetos locais `R`. A interface React mantém a **estrutura**, os destinos e os indicadores sustentados pelo banco; não afirma equivalência completa para casos que exijam evidência ainda não persistida. O Checkmate requer a memória congelada do Consolidado oficial. Não se deve liberar fechamento com essas lacunas.

## Segurança e implantação

Nenhum SQL novo, tabela ou regra do motor foi alterado. Criação da competência, vinculação ao lançamento ativo do Fluxo 1, arquivos em bucket privado, RLS e SHA-256 seguem inalterados.

## Verificação no Lovable

1. Recarregue preview da `main` e abra o Encontro de Contas 07/2026 do HMSJ.
2. Em Fontes, confirme que sumiram o registro individual, a nota institucional e o rodapé. Se a competência já tem arquivos válidos, clique **Analisar competência**. Após sucesso e atualização, o módulo **deve abrir Painel automaticamente**.
3. Se o importador apontar erro estrutural, lote incompleto, impedimento de conciliação ou falha de escrita, deve ficar em Fontes com erro legível e **não** navegar.
4. No Painel, compare com o HTML original: cinco KPIs; banner CIB 727/2025; cinco cartões operacionais; Centro de Alertas; Checkmate SES; tabela de **24 linhas** incluindo físico MAC/FAEC/SIA, linha de controle `FAEC faixa MAC`, total EC, correções e ofício.
5. Confira que o mesmo recorte de controle não entrou novamente no valor do atesto; compare valores SQL, React e HTML centavo a centavo com os arquivos oficiais.
6. Volte a Fontes, confira os diagnósticos informativos das planilhas sem publicação HMSJ sem tratá-los como falhas.
7. Repita em 390 px. Clique em Fila/Correções/Auditor nos cartões de pendências. Certifique-se de não criar segunda competência ou lançamento.
8. Faça um caso negativo em competência de testes, com um arquivo inválido; confirme nenhuma conciliação parcial.

**Homologação visual/fiscal** requer os prints do Lovable e a comparação efetiva com o HTML da mesma competência. CI aprovado e screenshot de referência não equivalem a aceite fiscal.
