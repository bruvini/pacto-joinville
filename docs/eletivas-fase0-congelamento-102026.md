# Fase 0 — referência congelada e matriz de equivalência (HMSJ)

**Referência única:** `Auditoria - Cirurgias Eletivas - 102026.html`, **v2.42.2**. Hash SHA-256 exato: `75494e80e28fc59596e43a2ba0fb7a0caf9a50bafbd3a5f4c94dd95a22fe7186`; **8.883 linhas** e **313 declarações de função**. O HTML original **não deve ser publicado no GitHub**; contém lógica e pode receber dados clínicos em operação. Guardar o original na guarda institucional e anexar hash e autorização à homologação.

O inventário reproduzível está em `scripts/eletivas-fase0-inventario.mjs`. Para conferi-lo, executar localmente:

```sh
node scripts/eletivas-fase0-inventario.mjs '/caminho/seguro/Auditoria - Cirurgias Eletivas - 102026.html' > ec-referencia-inventario.json
```

**Exit 0** = hash, versão, 313 funções e ordem das 11 telas coincidem. **Exit 1** = referência diferente; **exit 2** = arquivo ausente/erro de leitura. O JSON expõe só nomes e linhas de funções, sem valores clínicos, arquivos originais ou dados nominativos. Não substituir por versões 2.14/2.25 ou HTML de 4.981 linhas.

## 11 telas — correspondência comprovada

| Ordem | HTML (`data-view`) | Funções principais (linha do HTML) | React atual | Diferença para implementação |
|---:|---|---|---|---|
| 1 | `arquivos` — Fontes da competência | `parseDBF` 3413, `parseConsolidadoSES` 3450, `parseMultSeq` 3607, `parseAihWb` 3711, `parseFpoOfficial` 3849 | `FontesEletivas`, `validarEstruturaFonte`, `eletivas-leitores` | Identificação, slots, mensagens e layouts legados no mesmo fluxo |
| 2 | `painel` — Painel | `aggregates` 5718, `renderPainel` 6148, `consolidatedCheck` 3523 | `PainelEletivas`, `financeiro.ts`, `ec_resumo_financeiro` | Consolidado externo, alertas, subtotais e diferença contra SES |
| 3 | `correcoes` — Correções recebidas | `loadCorrections` 4849, `correctionTotal` 4859, `syncRegFlowFromCorrections` 4892, `renderCorrections` 5880 | `DocumentosEletivas`, `eletivas_correcoes` | Tela independente, origem AIH, regularização vinculada à comunicação |
| 4 | `fpo` — FPO · Art. 19 | `parseFpoOfficial` 3849, `renderFpo` 6194 | `PainelEletivas`, `ProgramacaoFpoEletivas` | Contraste parâmetro/programação comprovada, vigência Nota 05/2026 |
| 5 | `faixas` — Auditor de faixa | `normativeRuleFor` 2905, `auditProfiles` 3025, `auditSummary` 3033, `renderFaixas` 6264 | `DossieFiscalEletivas` e memória de `motor.ts` | Tela operacional por AIH e procedimento-filho, status e atos CIB |
| 6 | `comunicacoes` — Comunicações | `loadCommunications` 3058, `buildConsolidatedCommunication` 3349, `renderCommunications` 6391 | `fase5Ses.ts`, `DocumentosEletivas` | Central de Regulação/GEMAS/interno, filas, enviado/reaberto e histórico |
| 7 | `pagos` — Itens conciliados | `renderPagos` 6532, `isCounted` 5328 | `AuditoriaEletivas`, `PainelInvestigacaoEletivas` | Separar itens conciliados da fila de decisões |
| 8 | `fila` — Fila de auditoria | `decisionOf` 4844, `renderFila` 6776, `auditAlerts` 5363 | `AuditoriaEletivas`, `DossieFiscalEletivas` | Mesmas decisões, filtros, motivos e trilha; sem reabrir itens OK |
| 9 | `atesto` — Atesto SEI | `renderAtesto` 6915, `reportCriticalDataIssues` 7018 | `DocumentosEletivas`, `fase5Documentos.ts`, `fase5Ses.ts` | RTMA/Relatório de Análise de seis seções; valores não editáveis |
| 10 | `exportar` — Exportar | `renderExport` 5764; handlers XLSX/CSV no fim do HTML | `fase5Xlsx.ts`, `relatorios.ts` | Confirmar planilha de 10 categorias exibidas no HTML, CSV e origens |
| 11 | `manual` — Manual do processo | conteúdo HTML, `manualToc` no fim do script | sem tela equivalente | Reproduzir íntegro e navegável dentro do módulo |

**Área institucional fora dessas 11 telas:** `eletivas.index.tsx` (criar/editar/excluir/vincular competência), `FechamentoEletivas`, `HomologacaoEletivas`, histórico SEI e Etapa 6 do lançamento. Permanecem funcionais e segregadas.

## Inventário de motores e lacunas

- **Leitura/roteamento:** HTML `parseDBF`, `parseMultSeq`, `parseMacMultSeq`, `parseAihWb`, `parseConsolidadoSES`, `parseFpoOfficial`, matriz SES e dados SIA; comparáveis a `_shared/eletivas-leitores.ts`, `fontes.ts`, `autoRoteamento.ts`, `validarEstruturaFonte.ts`. **Lacuna:** comprovar paridade dos layouts reais antigos/novos, CNES, fórmulas sem cache, AIH x procedimento e consolidação externa por competência.
- **Motor financeiro:** HTML `reconcile`, `payValue`, `expectedPayValue`, `countedPayValue`, `isCounted`, `aggregates`, `correctionTotal`, `oficioValue`; React `_shared/eletivas-motor.ts`, `financeiro.ts`, SQL `ec_valor_item`/`ec_resumo_financeiro`. **Lacuna confirmada:** divergências em `analise`, `pendente`, prioridade de `ok` frente a decisão `erro`, e pagamento de até R$ 0,02. Não corrigir diretamente, pois cenários de FPO e relatórios falharam em tentativa anterior.
- **Faixa/CIB:** HTML `normativeRuleFor`, `normativeProcedure`, `normativeMatchesAih`, `auditProfiles`; React tem peças no motor/dossiê, sem fluxo visual integral. Conferir competência de processamento na mudança 727→399 e as bases normativas oficiais antes da Fase 4.
- **Correções/comunicações:** HTML `loadCorrections`, `loadCommunications`, `buildConsolidatedCommunication`, `loadRegFlows`, `saveRegFlows`; React tem correções e minutas, mas não máquina completa de estados e reabertura. Registrar destino, assunto, envio humano, evidência e vínculo entre competências.
- **Documentos/exportação:** HTML `renderAtesto`, `reportCriticalDataIssues`, planilha consolidada e CSV; React `fase5Documentos.ts`, `fase5Xlsx.ts`, `relatorios.ts`. Conferir integralmente conteúdo, referência de fontes, integridade, quantidade de cirurgias e decisão fiscal.

**Achado adicional no comparador legado:** `public/homologacao/ec-golden-html.js` (pré-2.42) fixa `correcoesCent=0` e soma o controle `faec_fxmac` nos subtotais, podendo rejeitar/contaminar um golden master legítimo. O novo **`public/homologacao/ec-golden-html-102026.js`** captura o total efetivo com correções e zera apenas o admitido de controle. O exportador anterior foi mantido para comparações históricas; **para esta referência usar somente o novo**.

## Estratégia de comparação e casos de teste

Os testes automatizados `src/lib/eletivas/fase0Referencia.test.ts` exercitam o exportador novo em um contexto JavaScript isolado com dados sintéticos, confrontam o JSON com `validarGolden()` e registram **divergências esperadas**, não uma aprovação imaginária. O comparador preexistente `compararGolden()` aponta diferenças de fontes/hash, identidade da competência, AIH, procedimento, QT interno, situação, decisão, publicado, esperado, admitido, subtotal, correções e total.

| Caso | Par HTML v2.42.2 → React atual | Resultado exigido na Fase 0 |
|---|---|---|
| Divergência com `analise`, publicado 150, esperado 120 | 120 → 0 | Diagnóstico obrigatório; não corrigir por suposição |
| `pendente`, publicado 80, esperado 120 | 80 → 0 | Diagnóstico obrigatório |
| `ok` e decisão `erro`, publicado 25 | 25 → 0 | Diagnóstico de precedência; avaliar regra fiscal antes de alterar |
| Divergência com publicado R$ 0,01 | 0 → 0,01 | Diferença de tolerância; não arredondar para esconder |
| `aceito`, publicado 150, esperado 120 | 150 → 150 | Caso de equivalência sintética positiva |
| `faec_fxmac` R$ 50, demais itens R$ 100 e correções R$ 20,35 | total R$ 120,35 sem duplicidade | Golden inclui fonte SHA, 11 categorias, valor final R$ 120,35 |
| Duas linhas com mesma chave | exportação bloqueada | Nada de golden parcial |
| Fonte/competência sem integridade | exportação bloqueada | Não atribuir autenticidade a arquivo diferente |
| Nome/CPF em dados de teste | não exportados | Inspeção de JSON sem campos nominativos |

### Perfis oficiais a coletar na homologação (ainda não disponíveis nesta entrega)

1. **04/2026:** DBF FAEC/MAC e SIA, SES físico/financeiro/complemento, AIH/CIB, FAEC múltiplas antigas, verificação de publicação parcial.
2. **07/2026:** SIH MAC MS, workbook AIH, recortes FAEC/MAC e correções com vínculo a competência anterior.
3. **08/2026 ou posterior:** nova CIB aplicável, FPO oficial, art. 19/Nota 05, comprovantes independentes de publicação/programação.
4. **Casos negativos:** layout DBF corrompido, CNES ausente, SHA diferente, cache de fórmula vazio x zero, mesmo AIH/procedimento repetido, múltiplas sem comprovante, ato especial sem evidência, proibição de duplicar atesto na Etapa 6.

**Procedimento para gerar golden oficial:** (a) validar SHA do HTML com o script de inventário; (b) copiar `public/homologacao/ec-golden-html-102026.js` para um ambiente isolado; (c) anexar `<script src="ec-golden-html-102026.js"></script>` após o script inline do HTML, antes de `</body>`; (d) importar arquivos originais e aplicar mesmas decisões; (e) exportar `EC_golden_HTML_2422_MM-AAAA.json`; (f) importar na aba Homologação da mesma competência React, com manifestos SHA idênticos, emitir relatório de diferenças. Não incluir arquivos-fonte em repositório nem exportar identificações clínicas.

## Gate da Fase 0

- [x] Referência identificada por versão, nome e SHA e validada sobre o anexo recebido.
- [x] Inventário automatizado de todas as 313 funções e das 11 seções, com mapa de 43 funções prioritárias por domínio.
- [x] Correspondências com componentes React/Supabase e lacunas críticas documentadas.
- [x] Casos sintéticos de referência e diferenciais explícitos, sem ajuste nos motores de produção.
- [x] Exportador 2.42.2 específico preparado, incluindo correções e sem duplicação de controle.
- [ ] Golden master **real** de cada competência, com fontes oficiais e as mesmas decisões, não fornecidas nesta fase.
- [ ] Aprovação fiscal assinada, homologa-se ao término da fase final, não na fase de inventário.

**Fase 0 concluída como preparação técnica, NÃO como paridade financeira homologada.** A Fase 1 pode avançar; ajustes em motores ficam sujeitos ao diagnóstico com arquivos reais e testes da Fase 3/4.