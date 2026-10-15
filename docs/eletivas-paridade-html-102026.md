# Cirurgias Eletivas — contrato de paridade com HTML 10/2026

**Referência recebida:** `Auditoria - Cirurgias Eletivas - 102026.html` (8.883 linhas; 313 funções clássicas declaradas, incluindo navegação, importadores, motor, auditorias, comunicação e exportação).
**SHA-256 do arquivo recebido:** `75494e80e28fc59596e43a2ba0fb7a0caf9a50bafbd3a5f4c94dd95a22fe7186`.
**Objetivo:** replicar integralmente regras, estrutura de trabalho e identidade visual dessa versão, preservando exclusivamente a criação institucional da competência e a vinculação controlada aos lançamentos de convênios.
**Estado desta revisão:** inventário e primeira correção financeira, NÃO homologação final. Não considerar essa documentação autorização para finalizar atestos.

## Invariantes que NÃO devem ser substituídos

- A lista de competências (`src/routes/_authenticated/eletivas.index.tsx`) seleciona instituição → convênio → lançamento individual; mantém RPCs de criação, edição e exclusão, controle de CNES, papéis e vínculos.
- A Etapa 6 do Fluxo 1 mantém origem manual/automática, escolha fiscal expressa, SEI, histórico e impedimento de duplicidade; o fechamento do Encontro não aplica o atesto no convênio automaticamente.
- Persistência, RLS, eventos, revisões, arquivos privados e hashes ficam no Supabase. O `localStorage` do HTML é referência comportamental, não repositório definitivo de auditoria.
- Não alterar os demais módulos: Fluxos 1/2, Piso, PVH, Prestação de Contas e auditoria de anulações.
- Não registrar nomes, CPF/CNS ou outras identificações clínicas em logs, testes golden master, snapshots de auditoria ou repositório público.

## Matriz de equivalência de navegação (ordem do HTML é mandatória)

| HTML v2.42+ | Situação do app no início | Alvo verificável |
|---|---|---|
| 1. Fontes da competência | `FontesEletivas` com upload/roteamento parcial | Mesma disposição dos slots DBF, SIH, SIA e apoio, classificações e estados do HTML; persistência privada |
| 2. Painel | `PainelEletivas` e resumo SQL | Mesmo consolidado, centro de alertas, projeções, recortes, subtotais, divergências e investigação contextual |
| 3. Correções recebidas | Formulário misturado em `DocumentosEletivas` | Tela própria com competência de origem, AIHs, documentos, vínculos de regularizações e reflexo único no atesto |
| 4. FPO · Art. 19 | Painel FPO + `ProgramacaoFpoEletivas` | Quadro próprio e controle independente de valores a programar, programados e comprovação; NI 05/2026 |
| 5. Auditor de faixa | Parte das informações em dossiês | Tela dedicada à composição das AIHs, faixa, natureza, procedimentos-filhos e propostas de encaminhamento |
| 6. Comunicações | Não equivalente ao fluxo completo do HTML | Destino Central de Regulação/GEMAS/interno, filas, agrupamento e estados; auditar envio sem alegar envio automático |
| 7. Itens conciliados | Filtro dentro da auditoria | Tela própria sem decisões desnecessárias e com dossiê contextual |
| 8. Fila de auditoria | `AuditoriaEletivas` contém filtros e decisões | Somente situações acionáveis, decisões `oficio`, `erro`, `aceito`, `analise`, notas e trilha |
| 9. Atesto (SEI) | `DocumentosEletivas` e geradores Fase 5 | Mesmo RTMA, quadro SEI, Relatório de Análise, campos editáveis somente onde permitido, verificação de integridade |
| 10. Exportar | XLSX e minutas dentro de Documentos | Área própria com múltiplos formatos, abas e metadados equivalentes, sem exposição de dados nominativos |
| 11. Manual do processo | Ausente como seção equivalente | Reproduzir princípios, fontes, três verificações, cinco destinos, deliberações CIB e fluxograma operacional |

**Acesso adicional não pertencente às 11 seções:** fechamento fiscal, integração do valor atestado com o convênio, histórico e homologação devem continuar disponíveis em área administrativa institucional claramente separada da interface de análise.

## Motores e contratos a transportar sem aproximações

1. Leitores/roteador: `parseDBF`, `parseMultSeq`, `parseMacMultSeq`, `parseAihWb`, `parseFpoOfficial`, `parseConsolidadoSES`, detecção estrutural, cache-zero vs ausência de fórmula, CNES, layout SIA e Delib.
2. Conciliação: `reconcile` é a fonte para classificação e memória item a item. `faec_fxmac` é controle; não duplicar FAEC/MAC. AIHs, QT interno e procedimentos filhos são grandezas independentes.
3. Financeiro: `payValue`, `expectedPayValue`, `countedPayValue`, `isCounted`, `aggregates` e `oficioValue` definem publicado, esperado, parte incontroversa, cobrança e total. Decisão `analise` NÃO zera a parte já reconhecida. `erro` a zera; `aceito` preserva o publicado.
4. Auditoria: índices AIH/procedimento, dossiê explicativo com origens, filtros, auditor de faixa, alertas, regularizações e decisões por competência; não misturar status com decisão.
5. FPO: art. 19/NI 05/2026 como acompanhamento paralelo. O valor federal a programar não prova a execução da programação.
6. Documentos e comunicação: RTMA/Relatório de Análise/ofício/comunicações consolidadas baseados no mesmo fechamento; sem overrides manuais de produção e sem envio fictício.

## Diferenças reais constatadas

- **Corrigido nesta revisão:** `src/lib/eletivas/financeiro.ts` descartava toda parcela de `analise` e de `situacao='pendente'`; o HTML `countedPayValue` preserva `min(publicado,esperado)` ou o publicado quando não há esperado. A mesma lógica já estava presente na RPC SQL `ec_valor_item`, gerando divergência entre interface e servidor.
- **Ainda distinto:** o HTML usa um limiar `TOL` de R$ 0,02 para considerar `countedPayValue`, enquanto o SQL compara com zero. Exige teste dedicado com centavos mínimos antes de modificar o banco; não ajustar servidor sem migração segura.
- O HTML trata o `ec_consolidado` e confronta total do estabelecimento, produção corrente e ajustes; conferir se o leitor e a interface React usam essa prova externa de fechamento.
- O HTML possui fluxo de regularização com histórico e comunicação por destinatário, ausente na estrutura completa do React; não pode ser substituído por simples campo de justificativa.
- Documentação anterior refere HTML de aproximadamente 4.981 linhas e versões antigas. Este arquivo de 8.883 linhas é uma nova linha de base: não declarar equivalência pelas fases 0–7 anteriores.

## Sequência de migração com gates

**G0 — congelar referência.** Manter hash e inventário da versão recebida; construir golden master da execução HTML com arquivos reais sem publicar dados pessoais.
**G1 — motor.** Transpor/compartilhar algoritmos exatos e adicionar fixtures versionadas e testes por família de arquivos; confrontar item a item AIH, procedimento, QT, publicado, esperado, admitido, decisão e totais.
**G2 — persistência.** Criar apenas tabelas/alterações estritamente necessárias para comunicações, regularizações, alerta e dossiês; usar migrations idempotentes, RLS, trilha append-only, chaves de competência, não editar registros financeiros de lançamentos.
**G3 — interface.** Reconstruir shell e as 11 seções na mesma ordem e identidade visual (verde, vermelho, fontes, espaçamento, carimbos, cards, tabelas e modais). Não misturar controles do convênio com o painel do HTML.
**G4 — documentos.** Confrontar texto, estrutura SEI, RTMA, ofício, relatórios, exportações e cálculos centavo a centavo.
**G5 — homologação.** Mesmos arquivos/hashes e decisões em HTML e React; testar 04/2026, 07/2026 e 08/2026+ (FPO/NI 05). Zero divergências não justificadas e aprovação fiscal nominal antes de alegar paridade. Regressões negativas e de segurança obrigatórias.

### Critério de conclusão

Não declarar `exatamente como o HTML` apenas porque há abas homônimas ou layout parecido. É indispensável comprovar paridade funcional e monetária por amostras reais, visual por capturas comparáveis, comportamento da fila/comunicações, integridade dos documentos e preservação da vinculação do convênio.
