# Piso da Enfermagem — 13ª AFC: calculadora, Portaria Federal e atos municipais

## Fundamentação e limites

- **Ministério da Saúde/FNS, 04/12/2025:** Portaria GM/MS nº 8.964/2025 instituiu a 13ª parcela adicional do exercício de 2025; pagamento individual observa proporcionalidade e tempo efetivo.
  https://portalfns.saude.gov.br/ministerio-da-saude-dispoe-valores-da-decima-terceira-parcela-referentes-ao-piso-da-enfermagem/
- **Diário Oficial de Mato Grosso, 2025:** exemplo de portaria estadual que apresenta valor por CNES calculado pela média aritmética simples da soma dos valores homologados de janeiro a novembro dividida por 11, relativo à 13ª de 2025.
  https://iomat.mt.gov.br/legislacao/diario_oficial/detalhes/945771
- **Lei nº 4.320/1964, LRF, MCASP e Portaria de Consolidação GM/MS nº 6/2017, Título IX-A:** empenho, liquidação, pagamento, controle de repasses e rastreabilidade.

**A regra de 11 meses está autorizada neste sistema somente para o exercício 2025.** Para **2026**, enquanto não houver metodologia oficial validada para o exercício, a calculadora e a confirmação no banco permanecem bloqueadas. Não se pode transferir a fórmula de 2025 automaticamente nem confundir simulação com direito individual.

## Organização das etapas

- **Mensal:** mantém as nove etapas existentes.
- **13ª:** exibe oito etapas, preservando os IDs internos **2 a 9**, os históricos, documentos e assinaturas já vinculados:
  1. **Calculadora da 13ª e Portaria Federal** (ID 2).
  2. **Minuta, Memorando e Portaria Municipal** (ID 3).
  3. Confirmar crédito FMS (ID 4).
  4. Empenho e liquidação (ID 5).
  5. e-Pública (ID 6).
  6. Pagamento (ID 7).
  7. Notificação (ID 8).
  8. Encerramento (ID 9).

A antiga Etapa 1, de Planilhas de Carga mensais, fica **não aplicável**, e não é marcada como concluída para a 13ª. A antiga Etapa 2, que no mensal corresponde à auditoria InvestSUS, é reutilizada **exclusivamente na 13ª** para o cálculo por CNES/Portaria Federal; os controles mensais continuam intactos.

## Calculadora

O PACTO consulta as onze competências mensais do exercício, exige o registro **explícito por cada CNES** de cada instituição e exige fontes processadas no servidor (`investsus_resumo.origem_calculo = edge_function` e referência do arquivo). Recusa competência ausente, CNES inválido, vínculo duplicado, origem sem auditoria e valor mensal omitido (zero não é inferido).

Para **2025**:
`valor_13_cnes = arredondar_centavos((jan + fev + ... + nov) / 11)`.

Cada CNES é arredondado isoladamente; o total da instituição soma seus CNES. A interface mostra os valores sugeridos sem gravar nada. O operador importa a **Portaria GM/MS da 13ª**, confere data/URL/valor homologado, compara o total do cálculo à Portaria e confirma.

**A confirmação é feita por uma função SQL autorizada**, não por simples `UPDATE` do navegador. A RPC recalcula os 11 meses e os CNES, valida novamente os arquivos e o valor homologado federal e, se compatíveis, registra:
- `investsus_resumo.origem_calculo = simulacao13_conferida`;
- `investsus_resumo.por_cnes`, divisor, exercício e referências dos 11 arquivos;
- `valor_apurado_investsus` (campo legado reutilizado como **total anual calculado**, não apuração mensal InvestSUS);
- `total_publicado_municipal`;
- valor devido por instituição, somando seus CNES;
- log com autoria, total, exercício, CNES e fontes mensais.

A confirmação é bloqueada após conclusão das etapas 1/2 anuais (IDs internos 2/3), existência de obrigações financeiras ou encerramento. Triggers protegem a memória e os valores já confirmados, exigindo correção formal em caso de divergência.

## Atos municipais

Na Etapa 2 visual, dados dos atos, minuta, memorando e portaria municipal utilizam **exclusivamente a memória `simulacao13_conferida`** para o Anexo I por CNES. Sem confirmação, a cópia dos documentos permanece bloqueada, e a etapa não conclui.

**Não existe mais upload obrigatório de distribuição oficial por CNES para a 13ª.** A fonte da distribuição é a memória interna registrada e reconciliada com a Portaria Federal; a documentação deve descrever corretamente essa procedência, e o responsável deve juntar a memória e os comprovantes ao processo SEI.

## Implantação

1. Atualizar o frontend, junto da migração `supabase/migrations/20261009233000_piso13_confirmacao_calculo_interno.sql`.
2. Recarregar a 13ª já criada: passará a abrir na Etapa 1 visual (ID interno 2), mantendo o registro de `11/2026`.
3. Testar os oito indicadores, a conclusão manual da primeira etapa e a abertura dos atos municipais.
4. Exercício de 2026: confirmar antecipadamente que a simulação/confirmacão permanece bloqueada até a validação da norma anual.
5. Exercício de 2025: testar com todas as onze competências homologadas, CNES múltiplos, lacunas mensais e divergência com o homologado no PDF.
6. Executar `bun run check:architecture`, `bun run build` e `bun run test` no ambiente antes da publicação de produção.

**Sem alteração automática de valores financeiros das competências existentes.** A migração cria rotinas de confirmação e proteção, não preenche valores de 13ª retroativamente.
