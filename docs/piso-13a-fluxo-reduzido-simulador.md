# Plano de implantação — 13ª parcela da AFC/Piso da Enfermagem

## Evidências verificadas

1. **Ministério da Saúde, FAQ de 08/12/2025**, "Qual o parâmetro para o repasse da 13 parcela por CNES/estabelecimentos no nível local?" A 13ª de **2025** usa a **média aritmética simples dos valores atualizados e homologados por CNES de janeiro a novembro, dividida por 11**.
   https://www.gov.br/saude/pt-br/composicao/sgtes/piso-da-enfermagem/afc/faq/faq/qual-o-parametro-para-o
2. **Fundo Nacional de Saúde**, orientação sobre a **Portaria GM/MS nº 8.964/2025**, publicada em 04/12/2025: a 13ª tem ato próprio; os pagamentos individuais seguem proporcionalidade e tempo efetivamente trabalhado. A regra de soma por CNES **não** equivale ao cálculo da folha de cada empregado.
   https://portalfns.saude.gov.br/ministerio-da-saude-dispoe-valores-da-decima-terceira-parcela-referentes-ao-piso-da-enfermagem/
3. **SES/SC**, índice oficial das portarias da enfermagem: **GM/MS nº 8.935/2025** é novembro mensal e **GM/MS nº 8.964/2025** é a 13ª do exercício.
   https://www.saude.sc.gov.br/index.php/pt/component/edocman/legislacao/legislacao-por-assunto/piso-nacional-da-enfermagem/portarias-piso-nacional-da-enfermagem?start=20
4. **Título IX-A da Portaria de Consolidação GM/MS nº 6/2017**, Lei nº 4.320/1964 (empenho, liquidação, pagamento), Lei Complementar nº 101/2000 e MCASP/STN: distinguir homologação federal, transferência ao FMS, nota de empenho, liquidação e efetivo pagamento.
5. **Cartilha do Piso da Enfermagem, 4ª edição, preliminar 2026**, pergunta 18: 13 parcelas previstas em 2026, duas em novembro. Como é preliminar, não determina automaticamente a metodologia da 13ª de 2026.

## Novo fluxo operacional

A parcela mensal continua com as **nove etapas** originais. A 13ª exibe **sete etapas**, preservando os IDs internos 3–9 para não quebrar documentos, assinaturas, auditorias ou pagamentos já vinculados:

1. **Portarias federal e municipal** (ID 3): anexa PDF e URL da Portaria GM/MS específica, extrai valores e datas, registra a distribuição **oficial** por CNES que fundamenta o anexo municipal, gera Minuta, Memorando e Portaria.
2. **Confirmar o recurso** (ID 4).
3. **Empenho e liquidação** (ID 5).
4. **e-Pública** (ID 6).
5. **Pagamento** (ID 7).
6. **Notificação às instituições** (ID 8).
7. **Encerramento** (ID 9).

IDs 1 e 2 (cargas e auditoria mensal) são **não aplicáveis** à 13ª; não se marcam como concluídos artificialmente. A validação server-side da 13ª exige somente as etapas aplicáveis. A origem da distribuição anual, se houver, é o documento oficial por CNES, e **não** nova remessa de carga mensal ao InvestSUS.

## Simulador de conferência histórica (esboço operacional)

O protótipo foi incluído na primeira etapa da 13ª. Consulta exclusivamente competências mensais já processadas no PACTO e `investsus_resumo.por_cnes` cuja origem é `edge_function` com `arquivo_id`.

**Pré-condições bloqueantes**
- Existir uma competência mensal diferente para cada um dos 11 meses de janeiro a novembro do exercício.
- Cada mês ter arquivo processado, resumo válido e valor por **cada CNES cadastrado** em cada instituição participante da 13ª.
- Ausência de duplicidade de competência mensal ou vinculação ambígua de CNES a dois prestadores.
- Se o valor do CNES não consta num mês, **não tratar como zero**; é uma lacuna até retificação ou apresentação de memória oficial com zero.
- A **metodologia anual precisa estar aprovada**. Nesta versão o método de 2025 é o único habilitado. 2026 permanece **bloqueado** até confirmação da regra federal daquele exercício.

Cálculo CNES 2025: `arredondar_centavos((soma de jan. a nov.) / 11)`. Instituição com dois CNES: calcula a média de cada CNES e soma os resultados arredondados por CNES. Os 11 valores mensais e os impedimentos de cada CNES permanecem separados.

**Limites expressos**
- Resultado = **estimativa/conferência**, não direito individual e não ordem de pagamento.
- Não gravar os valores calculados na competência, `piso_participantes`, notas de empenho ou Minuta Municipal; não inferir valores ausentes.
- A 13ª federal não depende da completude da simulação. Se as fontes anuais forem oficialmente documentadas, a Portaria e o restante do processo seguem normalmente sem o simulador.
- A conferência de profissionais/CPF, proporcionalidade e tempo trabalhado exige memória específica e validação da instituição/RH; não está implementada como valor oficial.

## Migração e validação

Executar **após** a migração anterior da 13ª:
`supabase/migrations/20261009203000_piso13_memoria_oficial_por_cnes.sql`.
Ela apenas atualiza a RPC protegida de distribuição oficial da 13ª para também guardar `por_cnes`, necessário ao Anexo Municipal. Registros de 13ª processados **antes** dessa migração não são corrigidos retroativamente; preservar as evidências e solicitar reprocessamento controlado conforme o estágio financeiro. Não reprocessar após obrigações financeiras criadas.

Teste de regressão:
- 13ª de 11/2026 começa no estágio visual **1 Portarias**, apesar de possuir ID interno 3; mensal de novembro segue começando na Etapa 1 de cargas.
- A 13ª não pede carga institucional nem data de envio ao InvestSUS.
- São necessários ato GM/MS específico, distribuição oficial da 13ª por CNES e atos municipais para concluir a primeira etapa.
- 2025: faltando qualquer mês ou CNES, bloqueia a simulação; com 11 meses válidos, calcula CNES separados e total por instituição.
- 2026: cálculo não é disponibilizado por aproximação nem por transferência bancária, aguardando norma anual.
- Etapas financeiras, RLS, assinaturas, SEI, prestações de contas e dados legados não sofrem reclassificação automática.
