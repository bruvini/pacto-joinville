# Encontro de Contas das Cirurgias Eletivas (HMSJ) — migração do motor

Referência funcional: `Auditoria_Cirurgias_Eletivas_EC_HMSJ_Ajustado(4).html`,
arquivo original compartilhado no trabalho; comparação auxiliar com o README da
versão 2.14 e a versão 2.25. **Não substituir os conceitos do HTML por estimativas
ou somas simplificadas.**

## Estado desta entrega

1. **Fundação SQL corrigida:** `20261010200000_eletivas_encontro_contas_fundacao.sql`
   recomposta, removendo dois blocos de RLS que haviam sido inseridos acidentalmente
   dentro das expressões regulares em `ec_encerrar`. O vínculo com o convênio
   foi transferido para o gatilho de competência; jamais consultar
   `NEW.lancamento_id` em tabelas filhas. O gatilho de itens permite registrar
   conferência/decisão sem editar a origem e o valor extraídos.
2. **Tipos Supabase sincronizados:** `notificacoes.piso_competencia_id` em
   Row/Insert/Update e FK, sem afrouxar `check:schema`.
3. **Motor inicial compartilhado:** `supabase/functions/_shared/eletivas-motor.ts`
   + `src/lib/eletivas/motor.ts` como reexportação única. Concilia produção
   e complemento FAEC/MAC, componente ambulatorial SIA, recortes de faixas,
   diferencia QT de procedimento e número de AIHs e preserva parte já reconhecida.
   `faec_fxmac` permanece controle, sem soma no atesto.
4. **Leitores privados de DBF/XLSX:** `_shared/eletivas-leitores.ts`.
   Validam CNES, lêem aba Físico, Financeiro, Complemento e Delib da SES,
   importam registros SIH/SIA, e não copiam dados nominativos para o log.
5. **Edge Function `eletivas-processar`:** sessão JWT verificada,
   papel admin/ACP obrigatório, download em bucket privado, verificação
   SHA-256 e bloqueio quando faltam fontes ou memória para múltiplas.
6. **Persistência SQL transacional:** `20261010210000_eletivas_motor_conciliacao.sql`
   acrescenta `eletivas_itens.detalhe`, cria RPC autorizada somente ao
   servidor `ec_importar_itens_processados`, preserva eventos, não sobrescreve
   itens já conferidos pelo auditor e registra tudo com origem `parser_validado`.
7. **Auditoria no app:** botão para processar evidências e ação explícita
   de conferência fiscal de cada item. Documentos SEI e fechamento continuam
   sujeitos às exigências do módulo existente.

## Escopo exato da primeira migração

Implementado: SIH FAEC/MAC padrão, físico/financeiro/complemento por
procedimento, Delib por código, DBF tabulação, SIA, recortes de FAEC/MAC,
tolerância de R$ 0,02, parcelas incontroversas, grupos de classificação
e divergência. O código do motor não substitui decisões fiscalizatórias.

**Ainda não está integralmente migrado do HTML:**

- Desdobramento por procedimentos-filhos de **múltiplas e sequenciais**
  (e layouts legados/novos de Mult e Seq); quando identificado, a rotina
  **impede gravar a conciliação**, em vez de fabricar valor.
- Workbook de AIH para QT de procedimentos dentro de cada AIH quando
  diferir do número de AIHs; importar a fonte adicional e validar nas
  amostras do HMSJ antes de conferir o complemento.
- FPO oficial da SES, art. 19, incluindo ajuste por Nota Informativa
  nº 05/2026 e vigência aplicável; não presumir valor federal programado.
- Tratamento de recortes especiais `ec_delib`, cache de fórmulas Excel
  zerado e exceções documentadas em cada geração de arquivo.
- Exportações analíticas dos dossiês, RTMA, Relatório de Análise e
  ofício SES/GEMAS com a riqueza do HTML original.

A ausência dessas rotinas NÃO autoriza atesto definitivo automático.
As divergências remanescentes precisam de importação específica,
cálculo documentado e conferência fiscal.

## Etapas de implantação no Lovable

1. Executar a migration **corrigida** da fundação:
   `supabase/migrations/20261010200000_eletivas_encontro_contas_fundacao.sql`.
   Se uma tentativa prévia ocorreu integralmente dentro de `BEGIN/COMMIT`
   e falhou, o PostgreSQL reverteu a transação; conferir tabelas antes.
   Se tiver sido aplicado parcialmente por outra sessão, não executar
   `CREATE TABLE` novamente sem diagnóstico.
2. Executar `20261010210000_eletivas_motor_conciliacao.sql`.
3. Implantar a função `eletivas-processar` junto aos arquivos da pasta
   `supabase/functions/_shared`. Garantir que a plataforma configurou
   `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` apenas no servidor.
4. Sincronizar a main e executar `bun run check:architecture`,
   `bun run test`, `bun run build`; confirmar que o erro de tipos do
   Piso desapareceu e não houve outro contrato quebrado.
5. Abrir uma **competência de teste**, anexar os dois DBF SIH e dois
   XLSX SES obrigatórios e executar a conciliação. Não usar dados de
   múltiplas/sequenciais como valores finais sem completar o parser.
6. Validar resultados item a item com a memória original do HTML em
   competências amostrais (incluindo abril/2026 e outros meses com
   múltiplas e componentes SIA). Registrar divergências e somente
   então liberar o fechamento fiscal.

## Critérios críticos de aceite

- Arquivo com SHA incorreto, CNES inexistente ou fontes obrigatórias
  ausentes: processamento bloqueado, sem gravação.
- Papéis sem autorização: Edge Function retorna 403; RPC aceita
  apenas service_role.
- Lote é atômico no banco; não misturar itens de competências distintas.
- Cálculo conserva valor publicado parcialmente aceito; não dobra
  a faixa MAC meramente de controle e não presume complementos filhos.
- Reprocessamento depois de decisão/conferência humana é bloqueado.
- Usuário fiscal pode registrar conferência e justificativa em item
  processado, mas não editar base, valor, categoria ou origem.
- Encerramento exige fontes, conferência, pendências tratadas, documentos
  e signatários, sem lançar automaticamente os valores no convênio.
- Dados pessoais de paciente/CPF não aparecem nos eventos de auditoria
  nem nas respostas de processamento.

## Incremento de migração após 876d033

- Parser server-side habilita layouts históricos de FAEC múltiplas/sequenciais
  (N_AIH/Estab, Hospitais/AIH, Hospital/Procedimentos), MAC Múltiplas
  (Físico Principal/Complemento), workbook de AIH/CIB, FPO oficial e detecção
  de EC Deliberações com CNES.
- Quantidades internas QT são buscadas por AIH/procedimento no workbook; não
  confundir número de AIHs com quantidade de procedimentos.
- A elegibilidade de múltiplas MAC só é aplicada quando todas as AIHs
  puderem ser classificadas pela natureza dos procedimentos CIB e faixa.
- A FPO contém valores a programar, não demonstra programação executada.
- Divergências e dossiês do motor passam a exibir os dados estruturados
  usados no cálculo. Identificações de pacientes não são gravadas no log.
- Layouts ou evidências insuficientes continuam bloqueando a conciliação.
  **Não interpretar esta etapa como paridade integral ou atesto autorizado.**
- Ainda pendentes: relatórios analíticos completos e validação por amostras reais.

## Complemento da migração — relatórios e exportação
- Nova biblioteca `src/lib/eletivas/relatorios.ts`: RTMA, Relatório de Análise,
  minuta de ofício à SES/GEMAS e workbook XLSX (Resumo, Conciliação, Memória Técnica,
  Correções), a partir das linhas persistidas e decisões do fiscal.
- Relatórios sinalizam itens não conferidos e pendências; jamais assumem
  assinatura válida no SEI. A minuta de ofício somente cobra diferenças
  positivas explicitamente marcadas pelo fiscal e exclui envelopes de múltiplas
  da cobrança automática.
- Minutas não substituem modelos oficiais nem validam automaticamente
  deliberação aplicável, FPO ou autenticidade dos signatários.

## Ampliação funcional do módulo (09/10/2026)

Depois da fundação em `876d033`, foram incorporados ao módulo:

- Leitores privados de múltiplas/sequenciais FAEC (três gerações), arquivo
  complementar MAC, workbook AIH/CIB com quantidades internas, FPO oficial,
  sinalização de EC Deliberações e fórmulas XLSX de Complemento sem cache.
- Roteamento de arquivos por estrutura, prévia da classificação e importação
  em lote com SHA-256; filtros da fila por AIH/procedimento, categoria, decisão
  e conferência.
- Painel financeiro por componente, aba FPO/Art. 19 com vigência da Nota
  Informativa 05/2026 desde agosto/2026, distinção entre federal a programar
  e eventual residual SES, e memórias por item.
- Minutas RTMA, Relatório de Análise e ofício SES/GEMAS com avisos de
  pendência, além de XLSX (Resumo, Conciliação, Memória Técnica e Correções).
  Os documentos são minutas para revisão e assinatura real no SEI.
- A partir de 07/2026, o arquivo `s_mac_ms` é obrigatório para iniciar a
  conciliação, conforme bloqueio presente no HTML de referência.

### Limites de equivalência — não declarar migração final sem validação

1. As fórmulas e layouts adicionais são uma primeira transposição técnica,
   não substituem amostras brutas SES/TabWin de competências reais. Confirmar
   paridade linha a linha, incluindo FAEC/MAC, múltiplas por AIH, valores
   publicados/esperados, QT interno, recortes, SIA e divergências.
2. Algumas famílias especiais de `ec_delib` continuam sem fórmula normativa
   parametrizada e bloqueiam conciliação automática quando o CNES aparece.
3. A FPO oficial indica o montante a programar; falta evidência separada de
   que o prestador de fato cadastrou esses valores, especialmente em 08/2026+.
   Não cobrar automaticamente o residual ou alterar valor do convênio.
4. Os relatórios/minutas exigem revisão contra modelos oficiais e assinaturas
   SEI verificáveis; não constituem documentação fiscal definitiva.
5. O módulo precisa validar ausência/presença de AIHs e recortes em dados de
   produção reais antes de liberar encerramento fiscal automatizado. O teste
   sintético isolado não comprova equivalência.
6. Testes e build de todo o repositório devem ser executados em ambiente
   integrado (`bun run check:architecture`, `bun run test`, `bun run build`).
   A publicação GitHub, por si, não comprova aprovação dos testes.

**Sem migration SQL adicional nesta ampliação:** permanecem as migrations
`20261010200000_eletivas_encontro_contas_fundacao.sql` e
`20261010210000_eletivas_motor_conciliacao.sql`, já presentes no plano.
