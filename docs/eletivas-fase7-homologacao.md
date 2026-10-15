# Encontro de Contas HMSJ — Fase 7 · Homologação e implantação

**Estado:** infraestrutura/testes automatizados implementados. Homologação real
dos três perfis **PENDENTE** até obter golden masters do HTML com os mesmos
arquivos oficiais, resultado React/Supabase do mesmo conjunto de evidências,
testes do banco Lovable e aprovação nominada de fiscal designado.

Não há homologação simulada e não se fabrica JSON esperado de 04, 07 ou 08.

## 1. Perfis obrigatórios

| Perfil | Layout/regra que precisa ser confrontado | Referência de partida | Situação |
|---|---|---|---|
| 04/2026 | Modelo anterior; SIH FAEC/MAC, SIA e múltiplas | Comentário original HTML: FAEC físico 84/84; financeiro FAEC R$ 188.760,54; complemento simples R$ 44.161,29; MAC R$ 196.800,11; 15 múltiplas; SIA 3 × R$ 438,24 | Pendente: executar planilhas originais e validar categoria, AIH, centavos |
| 07/2026 | Layout próprio SIH MAC Mult/Seq; memória individual; conferência das correções | Arquivos oficiais 07/2026 e primeira conciliação real | Pendente: golden real e auditoria do histórico |
| 08/2026 ou posterior | Vigência FPO/Art. 19, Nota Informativa nº 05/2026 e programação efetiva documentada separadamente | Planilhas oficiais, workbook AIH, parâmetro FPO, ato/documento SEI de efetividade | Pendente: pacote de evidências do mês escolhido |

Os números do comentário de abril **não são um golden master** e não
demonstram paridade por si sós. Tampouco transferir julho corretamente para
o Fluxo 1 significa que a concordância financeira esteja homologada.

## 2. Golden master do motor original (HTML)

A versão histórica `Auditoria_Cirurgias_Eletivas_EC_HMSJ_Ajustado (1).html`
contém `reconcile()`, `aggregates()`, `countedPayValue()` e
`decisionOf()`. Para cada competência:

1. Prepare uma cópia do HTML original **num ambiente isolado**, preferencialmente
   offline e na mesma pasta dos arquivos de origem. Não publique os arquivos
   em serviço externo, GitHub ou site público.
2. Copie `public/homologacao/ec-golden-html.js` para a mesma pasta.
   Antes do fechamento `</body>` do HTML copiado, acrescente o script
   clássico `<script src="ec-golden-html.js"></script>`.
   Não modifique as fórmulas do HTML original, nem seus arquivos.
3. Abra no navegador, importe **as mesmas fontes por papel** usadas no React
   e concilie. Certifique-se de estar na competência e CNES corretos;
   aplique a mesma decisão fiscal a cada item em ambos os aplicativos.
4. Depois de `R.items` preenchido e `aggregates()` calculado, clique
   **Exportar golden master (sem dados nominativos)**. O exportador lê
   as variáveis do motor original e gera `ec-golden-v1` em JSON,
   com hash SHA-256 de cada arquivo de entrada; não lê nomes,
   CPF, CNS ou prontuário.
5. No React, abra **Homologação (Fase 7)** na mesma competência.
   Gere `EC_React_MM-AAAA.json` e importe o JSON do HTML.
6. Verifique se o comparador de itens retorna **0 divergências**.
   Baixe o diagnóstico e guarde nos autos da homologação, com
   lista de arquivos/hash, versão do motor, competência, responsável
   e aprovação formal.

A versão de HTML a comparar deve ser registrada; não substitua
automaticamente uma versão antiga por nova e assuma resultados iguais.
Decisões locais em `localStorage` do HTML também exigem equivalência
com as decisões gravadas no banco.

**Atenção a arquivos de fórmula:** não abra e salve as planilhas apenas
para gerar valores em cache. Fórmulas sem resultado salvo precisam
ser tratadas como impeditivo de leitura, e cache zero genuíno não
pode ser interpretado como célula ausente.

## 3. Comparador e regras de aceite

O contrato `ec-golden-v1` traz **somente informação técnica**:

- Identidade (competência, CNES, motor, fonte/sha256).
- Chave, categoria, AIH, código SIGTAP base de 9 dígitos, número de AIHs
  e QT de procedimentos internos, situação e decisão fiscal por item.
- Publicado, esperado e fiscalmente admitido em **centavos inteiros**.
- Subtotal fiscal de cada uma das 11 categorias, total do atesto,
  correções aprovadas e recorte `faec_fxmac` somente de controle.
- Nenhum nome de paciente, CPF/CNS, prontuário ou narrativa clínica.

**Bloqueadores absolutos:** fontes com hash diferente, faltas/duplicatas
de linhas, classificação ou categoria diferente, QT/AIH diferente,
decisões/status divergentes, glosa diferente, subtotal diferente,
total do atesto ou correção diferente.

A tolerância de **R$ 0,02** só pode ser considerada na comparação
de valor financeiro de um item **quando ambos os arquivos declaram
a mesma regra específica de conferência**. Não vale para glosas,
QT, decisões, admitido, subtotais ou total. No exportador padrão
não se atribui essa regra automaticamente, portanto o cotejo
é **exato até haver exceção formal documentada**.

Cada divergência recebe chave, campo, valor HTML, valor React,
responsável fiscal e indicação de fonte. Uma decisão de aceitar
exceção deve ser anotada no processo SEI, jamais suprimida do JSON.

## 4. Testes negativos obrigatórios

| Cenário | Resultado esperado |
|---|---|
| DBF truncado/XLSX corrupto | Rejeitar sem gravar conciliação parcial |
| CNES ausente na fonte obrigatória | Bloquear; fonte opcional fora do CNES não gera valor |
| AIH ausente, AIH+procedimento duplicado | Bloquear; a mesma AIH pode conter códigos diferentes |
| QT do workbook maior que 1 | Valor usa QT real; não multiplica contagem física de AIHs |
| Fórmula com cache zero vs sem cache | Aceitar zero válido, bloquear cache ausente com célula |
| SHA duplicado em papéis diferentes | Bloquear seleção de fontes |
| Sem workbook AIH para múltipla exigente | Não marcar `ok` sem comprovar filhos/faixa |
| Categoria `faec_fxmac` | Nunca somar ao total de atesto |
| Reprocessar após revisão fiscal | Exigir reconferência; não reutilizar decisões silenciosamente |
| Item fora da competência / prestador | Impedir pelo vínculo SQL/RLS |
| Usuário sem papel ACP/Admin | Não autorizar ações de importação, decisão, fechamento ou integração |
| Mesmo lançamento/proposta duas vezes | Impedir duplo atesto sem sobrescrever valor |
| Fechamento com fonte/documento/decisão ausente | Checklist Fase 6 deve bloquear |
| Falha/download excedendo 45s | Informar timeout antes de tentar importar no banco |
| Arquivo >50MB, lote >240MB, mais de 18 fontes | Rejeitar antes de ocupar memória para conciliação |

Os testes sintéticos automatizados estão em
`src/lib/eletivas/fase7Homologacao.test.ts`. **Não substituem**
testar o navegador com DBF/XLSX reais nos três perfis.

## 5. Comandos de validação, banco e implantação

GitHub Actions `eletivas-validacao.yml` executa:
`npm run check:architecture`, `npm run test` (projeto completo),
`npm run build`, parsing de todas as migrations/tests SQL de Eletivas,
e uma verificação de que o motor do navegador não depende de Edge.

**SQL com transações reais e políticas RLS:** a validação sintática
do PostgreSQL não conecta no Supabase Lovable. Execute no SQL Editor,
sem modificar registros:
`supabase/tests/eletivas_fase7_homologacao_verificacoes.sql`.
O script reporta somatórios SQL das competências e confirma
RLS, funções, anti-duplo-atesto, ausência de conferência e
inconsistências de fechamento. A execução de RPCs como
`ec_encerrar_seguro` e `ec_importar_itens_local` com contas de
papéis diferentes deve ocorrer **num banco/instância de homologação**,
com usuários de teste. Não efetue fechamento/integração financeira
na base institucional apenas para obter um `PASS`.

**Edge Functions:** a pré-conciliação principal é por navegador,
sem dependência da Edge Function. A etapa automatizada confirma esse
contrato do código, mas **não comprova deploy real de Edge**. Se o
projeto tiver alguma Edge Function secundária em uso, teste sua
autorização/tempo de resposta separadamente no ambiente de homologação.

**Deploy real:** após o GitHub Action verde, confira SHA sincronizado
no projeto Lovable. Status `ready` do editor não prova publicação
nem funcionalidade em produção. Para smoke HTTP do site publicado,
configure a variável `LOVABLE_PUBLIC_URL` no repositório; sem essa
variável o job é intencionalmente ignorado. O fiscal ainda deve
abrir a URL publicada, autenticar com perfis autorizados e negar
acesso a papéis ausentes, registrar data/hora, versão e resultado.

### Matriz final de aprovação

| Perfil | Golden exportado | Comparação por item (0 diferenças) | SQL/RLS | UI/Deploy real | Parecer do fiscal |
|---|---|---|---|---|---|
| 04/2026 | Pendente | Pendente | Pendente | Pendente | Pendente |
| 07/2026 | Pendente | Pendente | Pendente | Pendente | Pendente |
| 08/2026+ | Pendente | Pendente | Pendente | Pendente | Pendente |

**Só marcar HOMOLOGADO se as cinco colunas estiverem comprovadas**
com evidência arquivada (sem dado nominativo em logs/exports).
Caso alguma linha difira, manter como **não homologado** e registrar
a exceção, responsável e fonte. Atesto fiscal e assinatura no SEI
não são simulados por este módulo.
