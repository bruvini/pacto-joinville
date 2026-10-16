# Fases 7 e 8 — Documentos, exportações e portão de homologação (HTML 2.42.2)

**Base obrigatória**: arquivo original `Auditoria - Cirurgias Eletivas - 102026.html`, SHA-256 `75494e80e28fc59596e43a2ba0fb7a0caf9a50bafbd3a5f4c94dd95a22fe7186`. Examinar `buildRelAnalise`, `renderAtesto`, evento `#expXlsx`, evento `#expCsv` e o exportador Golden Master. A comparação com o HTML deve ser feita **com os mesmos arquivos oficiais e decisões fiscais**, não apenas com dados sintéticos.

## Fase 7 — Entregas

### Relatório Técnico de Monitoramento e Avaliação

Preservado o gerador fiscal `gerarRtmaHtmlEC`: proponente, CNES, competência, instrumento, parcela, objeto, amparo, número de AIHs (somente quando confiável), valores automáticos por linha, correções efetivamente aprovadas, parecer proposto, portaria e fiscais declarados. Valores financeiros e quantidades são calculados a partir do motor e não possuem edição direta nas minutas. A atuação no **SEI e assinatura digital real permanece no lançamento do Fluxo 1, Etapa 6 — Liberação de Recurso**. O código não presume que uma minuta copiada seja documento assinado.

### Relatório de Análise em seis seções

O `buildRelAnalise(comp)` do HTML utiliza cinco títulos numerados e divide internamente a terceira seção em **cobranças** e **achados de faixa**. O *Manual do Processo* do próprio HTML descreve seis grupos operacionais. A nova visualização `gerarAnaliseSeisSecoesEC` os torna independentes, nesta ordem:

1. Produção conciliada — FAEC/MAC/SIA; tabela por item e AIH, origem, memória. Faixa MAC do FAEC é **controle, não soma**.
2. Correções recebidas — competências anteriores, AIHs, SEI, referências e valores **aprovados**.
3. Cobranças via ofício — decisão expressa `oficio`, diferença positiva, sem incluir valor a cobrar no atesto.
4. Incompatibilidades de faixa e composição — enquadramento por AIH, memória e destino; sem transformar programação FPO em crédito.
5. Regularizações FPO/reprocessamento — estado atual e valores *estimados*, não pagos.
6. Reconciliação do valor atestado — linhas do RTMA, correções e diferença de motor, tudo em centavos.

Na interface `DocumentacaoFase5Eletivas`, os botões de **copiar RTMA/Análise** ficam bloqueados se houver divergência da memória, pendência fiscal ou quantidade de AIHs não confiável. A prévia continua visível para investigação. Não são emitidos documentos certificados pelo sistema.

### Exportação HTML (contrato de dez abas)

O exportador utilizado pela interface foi substituído por `gerarXlsxHtmlFase7EC`, com estas abas **sempre na mesma ordem**:

1. Consolidado
2. Checkmate SES
3. Itens
4. Divergências
5. Correções
6. Auditoria de Faixa
7. Comunicações
8. Regularizações FPO
9. Alertas
10. FPO

Abas permanecem presentes quando não há ocorrências, com aviso de conjunto vazio. Células monetárias são numéricas formatadas em BRL; identificadores são texto, evitando perda de zeros. Entrada textual iniciada por caracteres usados em fórmulas é escapada para proteção. Nenhum CPF, CNS ou nome de paciente é emitido intencionalmente. Comunicações e regularizações são obtidas de tabelas institucionais da Fase 5, não de dados fictícios.

**Checkmate SES**: o Consolidado geral da SES é **evidência independente**, e não uma soma inferida. `consolidadoDoManifestoEC` lê os valores da memória congelada registrada na pré-conciliação. Se ela estiver ausente, não corresponder à competência ou tiver total derivado, o XLSX registra `NÃO COMPROVADO` e deixa os valores oficiais vazios. Mesmo com memória, conferir arquivo, aba, célula e SHA. Um checkmate positivo **não dispensa** confronto com o XLSX original da SES.

**CSV**: `gerarCsvDivergenciasFase7EC` gera `Divergencias_EC_<CNES>_<MM-AAAA>.csv`, com BOM UTF-8, separador ponto e vírgula, campos escapados e linhas divergentes; recorte sem discrepância não é repetido.

O gerador anterior de **13 abas** fica preservado temporariamente como legado de compatibilidade nos testes antigos, mas **não é mais usado pelo botão da interface**. Não confundir esse contrato antigo com a nova entrega de dez abas.

## Fase 8 — Homologação e proteção da implantação

### Perfis de avaliação

- **04/2026** — modelo anterior ao novo layout hospitalar de múltiplas/seq.;
- **07/2026** — processamento com MAC múltiplas/seq. e Deliberação 727;
- **08/2026 ou posterior** — Deliberação 399, Nota Informativa 05/2026 e FPO oficial.

Em cada perfil: importar **exatamente as mesmas fontes oficiais**, hashes e decisões nos dois motores; exportar Golden Master do HTML; gerar React; comparar AIHs, QT interna, financeiro em centavos, estados, decisões, subtotais, correções, quantidade global, quadro RTMA, XLSX/CSV e comportamento de telas. Zero diferenças financeiras/funcionais injustificadas; tolerância de R$ 0,02 SOMENTE nos campos explicitamente documentados pelos dois motores. Uma comparação do JSON sem diferenças **não comprova** testes de SEI, RLS ou envio institucional.

### Migration (aplicar uma única vez depois das anteriores)

1. `supabase/migrations/20261016230000_eletivas_fase8_gate_homologacao.sql` — três tabelas RLS: `eletivas_fase8_validacoes`, `eletivas_fase8_eventos` e `eletivas_fase8_autorizacoes`. As RPCs `ec_fase8_registrar`, `ec_fase8_prontidao`, `ec_fase8_autorizar`, `ec_fase8_revogar` fazem alterações com papel ACP/Admin ou somente Admin na autorização/revogação.
2. `supabase/tests/20261016231000_eletivas_fase8_verificacao.sql` — **somente leitura**: RLS, funções, permissões, execuções atuais, perfis em falta, autorizações.

O banco exige dez verificações declaradas, SHA-256 do Golden HTML, do React e do manifesto, zero diferenças, referência SEI e confirmação fiscal. A validação fica ligada ao `ec_execucao_id`; novo processamento torna o registro **inapto** até revalidação. O sistema NÃO publica nem altera automaticamente o valor do lançamento ou qualquer módulo operacional.

**Autorização administrativa final** é evento **posterior** e exclusivo Admin, permitido apenas com os três perfis válidos e SEI informado. A autorização não muda flag de tráfego nem faz deploy; o corte operacional deve ser uma ação expressa e separada, depois da validação da chefia e fiscalização.

### Homologação que falta fazer com dados reais

Este commit contém motores documentais, exportadores, testes sintéticos e controle de prontidão. **Não houve cotejo efetivo dos arquivos oficiais 04/2026, 07/2026 e 08/2026 (ou posterior)** na base Lovable: os conjuntos completos não estavam anexados a esta execução. Portanto, `Fase 8 = implantação bloqueada/pendente` até:
- executar SQL1+SQL2;
- carregar arquivos oficiais idênticos nos dois sistemas;
- comparar 100% dos registros e valores; registrar evidências;
- testar perfis de permissão, importação inválida (nenhuma conciliação parcial), reprocessamento, decisões, fechamento, propostas de integração;
- documentar validação fiscal no SEI sem pressupor assinatura;
- obter a autorização administrativa explícita.

## Testes automatizados

`src/lib/eletivas/fase78DocumentosGate.test.ts`: seis seções, dez abas, total em centavos, recorte excluído, CSV (BOM/injeção), checkmate ausente, perfis, guardas do banco, sem auto-deploy. Testes anteriores do motor, Fase 7 Golden, SQL/RLS, compilação e segurança precisam continuar verdes. **CI não equivale a homologação fiscal.**

## Roteiro no Lovable

1. Abrir `Encontro de Contas → 07/2026 → Atesto (SEI)`: RTMA com valores read-only; Relatório de Análise com seis seções. Se faltar AIH ou decisão, o botão **Copiar** deve estar bloqueado.
2. Em `Exportar`: gerar XLSX, conferir dez abas; gerar CSV, conferir colunas, moeda e caracteres. Verificar que Correções, Faixa, Comunicações e FPO refletem somente evidências existentes.
3. Em `Exportar → Homologação técnica`: importar golden JSON do HTML da mesma competência, comparar, baixar diagnóstico; conferir **Portão Fase 8**, inicialmente pendente. Marcar os testes **apenas depois de realmente realizados**, inserir SEI e declaração fiscal. A versão de julho não homologa automaticamente abril e agosto.
4. Repetir com 04/2026 e 08/2026 ou posterior. Conferir registro e execução atual em SQL2. Não executar autorização administrativa antes dos três perfis.
5. Capturar comparativos HTML/React dos relatórios e dez abas com os mesmos arquivos, incluindo textos institucionais, títulos, grupos, subtotais e amostras de AIH. A equivalência visual completa não pode ser declarada apenas pelo CI.
