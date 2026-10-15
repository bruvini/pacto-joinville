# Encontro de Contas HMSJ — Fase 4: investigação fiscal e correções

## Entrega
A conciliação continua no navegador, com manifesto e SHA-256 das fontes
da Fase 3. A Fase 4 acrescenta:
- Painel com valores em centavos por FAEC/MAC/SIA, publicado, esperado,
  admitido provisoriamente, incontroverso **conferido**, em discussão e
  pendente, além de correções aprovadas.
- Recortes integrados: **Itens conciliados**, **Fila de auditoria**,
  **Pendências** e **Todos os itens**. Busca por AIH, código e descrição;
  filtros cruzados de componente, situação, decisão e conferência.
- Dossiê por AIH/procedimento com principal, filhos, QT, CIB,
  valores, proveniência de planilha/célula, explicação do resultado e
  recomendações de conferência. A memória JSON passa a ser técnica e
  é sanitizada na exibição.
- Conferência independente de decisão. Registro e revisão das decisões
  `aceito`, `oficio`, `erro` e `analise` exclusivamente pela RPC
  `ec_decidir_item`. Revisões exigem motivo específico, versão esperada,
  usuário/data e log; decisões atuais podem ser revistas formalmente.
- Correções antigas migradas do JSON `eletivas_competencias.correcoes`
  para `eletivas_correcoes`, mantendo o JSON histórico imutável e
  fora do cálculo. Ajustes novos exigem competência de origem,
  AIHs (quando disponíveis), valor, fonte, referência de origem,
  SEI e motivo. A aprovação é separada do cadastro.
- Duplicidade: fingerprint de origem/prestador e índice único de
  prestador + competência de origem + SEI + valor para correções
  **aprovadas**. Histórico duplicado é identificado, não somado, e
  aguarda decisão fiscal. O mesmo ajuste não entra duas vezes por
  ter sido recebido em competências diferentes.
- Verificação do fechamento continua usando as checagens das
  Fases 0–3: arquivos, fontes do manifesto, pré-conciliação, papéis,
  conferências, documentos SEI, signatários, FPO e atos especiais.
  Correções `em_analise` ou `duplicada` e decisões `analise`
  bloqueiam a validação/encerramento.

## Regras de valores
- **Publicado:** montante informado pela SES, sem faixa de controle.
- **Esperado:** cálculo baseado nas quantidades/fontes e norma aplicável;
  não é valor comprovadamente recebido.
- **Admitido provisoriamente:** usa `ec_valor_item`, a mesma função SQL
  aplicada ao fechamento, com precedência **erro/analise/pendente**
  antes de `ok` ou `aceito`.
- **Incontroverso conferido:** montante de itens classificados como
  compatíveis/aceitos **e conferidos**; não confundir com a previsão.
- **Em discussão:** diferença positiva entre esperado e publicado
  na fila de divergências ou em ofício; não cria crédito automático.
- **Correções:** apenas registros `aprovada` entram no total fiscal;
  rejeitados, duplicados ou em análise não entram.
- **Faixa FAEC/MAC de controle:** não soma novamente.

## Segurança e dados de pacientes
O módulo não importa pacientes nominativos para logs, KPIs,
decisões ou arquivos comuns. Utiliza números de AIH e procedimentos
SIGTAP; campos pessoais inesperados no objeto técnico são ocultados
pela exibição. Não há fluxo de acesso nominativo excepcional nesta fase,
pois não se demonstrou necessário.

## Implantação institucional
1. Confirmar que a Fase 3 está aplicada no banco do Lovable.
2. Abrir a migration:
   [20261015194500_eletivas_fase4_auditoria_correcoes.sql](../supabase/migrations/20261015194500_eletivas_fase4_auditoria_correcoes.sql).
3. Copiar o conteúdo **Raw** no SQL Editor. Ela executa em uma transação;
   um erro interrompe a migração inteira. Não rodar novamente as
   Fases 0–3.
4. Executar o script read-only:
   [eletivas_fase4_verificacoes.sql](../supabase/tests/eletivas_fase4_verificacoes.sql).
5. Abrir a competência 07/2026. A pré-conciliação não é refeita;
   documentos e conferências existentes permanecem.
6. No Painel, conferir totais publicados/esperados e perspectivas da
   auditoria. Na aba Conciliação/decisões, conferir item,
   justificar decisão e, se necessário, revisar explicitamente.
7. Na aba de documentos, verificar correções legadas transferidas
   (e duplicadas identificadas), registrar novas correções, aprovar
   ou rejeitar com justificativa. Somente aprovadas compõem o total.

## Limitações e homologação
- O algoritmo de detecção de duplicidade verifica referências, origem,
  SEI, valor e prestador; não substitui conferência de dois ajustes
  materialmente iguais com documentos de origem diferentes.
- Registros históricos com campos legados incompletos bloqueiam a
  migração com competência/posição, sem sobrescrever valores.
- Valores de 07/2026 devem ser confrontados com as evidências do HMSJ,
  já que os testes CI não executam SQL no banco institucional.
- O fechamento não altera automaticamente o convênio; tramitação,
  assinatura e responsabilidade fiscal permanecem com os usuários.
