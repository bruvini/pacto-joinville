# Encontro de Contas HMSJ — Fase 6 · Fechamento seguro e Etapa 6 do convênio

## Escopo e diferenças em relação às fases anteriores

Antes da Fase 6, `ec_encerrar(uuid)` verificava fontes, hashes,
execução, decisões, conferência, documentos e correções, mas podia ser
chamado sem uma confirmação documental expressa no momento do
fechamento e não preservava uma foto fiscal completa da decisão.
Além disso, `eletivas_competencias.lancamento_id` ainda usava a
presença da palavra "eletiv" no campo `convenios.objeto` como
um dos critérios de vínculo. **Texto do objeto não comprova identidade.**

A Fase 6 substitui essas lacunas com:

1. Checklist calculado **no PostgreSQL**, incluindo versão/execução
   do motor, evento registrado, evidências congeladas no manifesto
   (categoria, arquivo, hash SHA-256), quatro fontes obrigatórias e
   `s_mac_ms` desde 07/2026, todas as conferências, ausência de
   decisões abertas, correções revisadas, impedimentos de FPO/múltiplas,
   atos especiais e documentação SEI.
2. Fechamento exclusivamente via `ec_encerrar_seguro`:
   exige fiscal ACP/Admin, confirmação expressa, número/documento SEI,
   justificativa, execução esperada e checklist aprovado. Chama a
   função histórica `ec_encerrar` para **preservar as regras 0–4**.
   A execução direta daquela RPC é revogada para autenticados.
3. Um registro imutável em `eletivas_fechamentos` para cada revisão:
   valor, itens/decisões, correções, proveniência, evidências, documentos,
   motor/execução, autor, data e checksum. RLS restringe a visualização;
   usuários autenticados não têm permissão de escrita.
4. Vínculo **explícito** `ec_vincular_lancamento` somente para fiscal
   ACP/Admin, validando UUID do lançamento, UUID do convênio,
   `prestador_id` nas três tabelas, competência exata `MM/AAAA`,
   `modelo_fluxo='fluxo_1'` e lançamento individual (`parent_id IS NULL`).
   O usuário registra justificativa. **Não há inferência apenas por objeto.**
5. Integração em duas ações intencionais:
   - **Propor**, via `ec_propor_integracao`: registra fechamento,
     lançamento, valor anterior, novo, diferença, SEI e motivo;
     **não altera o convênio**;
   - **Aplicar**, via `ec_aplicar_integracao`: só após outra confirmação
     expressa, verificando snapshot original, IDs de destino,
     valor anterior ainda atual, competência fechada e ausência de
     concorrência/duplo atesto. Atualiza **somente**
     `lancamentos_pagamento.valor_atestado`. Não conclui Etapa 6,
     nem cria solicitação, SEI, assinatura, empenho, liquidação ou
     pagamento.
   - **Cancelar** uma proposta não aplicada deixa histórico intacto.
6. Índices únicos impedem mais de uma proposta/aplicação ativa por
   competência ou lançamento. Trigger impede sobrescrever posteriormente
   `valor_atestado` integrado sem procedimento revisional separado.
7. Reabertura apenas por **Admin**, por SEI e fundamentação, e somente
   sem proposta ativa/aplicação. Preserva os snapshots anteriores e
   invalida a validação da pré-conciliação local, exigindo reconferência
   para novo encerramento. A integração já aplicada **não é desfeita**.

## Decisão deliberada: valor previamente atestado

A aplicação do Encontro de Contas exige que o campo
`lancamentos_pagamento.valor_atestado` esteja **NULL ou zero**.
Se já houver valor, a tela mostra valor anterior, novo e diferença,
mas a RPC **não sobrescreve** esse atesto. Primeiro deve existir
revisão fiscal formal da Etapa 6, fora da integração automática.
Essa proteção evita somar/substituir duas vezes o mesmo pagamento.

Da mesma forma, a ação é bloqueada para lançamento concluído ou com
data/comprovante de pagamento. Valores fechados iguais a zero não são
enviados para a Etapa 6 por esta integração.

## Homologação e implantação

1. Fazer backup e confirmar aplicação das migrations Fases 0–4 e da
   interface Fase 5. **A Fase 6 usa uma única migration incremental.**
2. Na `main`, copiar o SQL:
   [20261015195500_eletivas_fase6_fechamento_integracao_segura.sql](../supabase/migrations/20261015195500_eletivas_fase6_fechamento_integracao_segura.sql)
   para o SQL Editor do banco Lovable. Roda em transação e não faz
   lançamentos nem fecha competências de modo automático.
3. Executar a verificação **somente leitura**:
   [eletivas_fase6_verificacoes.sql](../supabase/tests/eletivas_fase6_verificacoes.sql).
4. Abrir competência 07/2026; **Fechamento e convênio**. Confirmar
   checklist/impedimentos. Atestar externamente autenticidade e
   assinaturas digitais no SEI.
5. Selecionar convênio e lançamento **pelos registros exatos**, motivar,
   e confirmar vínculo **antes do fechamento**.
6. Encerrar explicitamente com documento SEI, justificativa e confirmação
   de duas conferências. Conferir registro da revisão, valor e hash.
7. **Opcional:** propor o valor da Etapa 6. Verificar campos Anterior,
   Novo, Diferença, convênio, lançamento, documento SEI e motivo.
   A proposta não altera o convênio.
8. Somente com concordância fiscal, marcar confirmação, digitar
   `APLICAR` e confirmar a janela. Após aplicação,
   conferir o `valor_atestado` diretamente no lançamento.
9. A assinatura e os demais atos da Etapa 6 do convênio continuam
   sendo feitos **no processo e no SEI**, pelos agentes competentes.
10. Testar separadamente: concorrência (mudança no valor anterior),
    solicitação duplicada, proposta cancelada, reabertura sem integração
    e tentativa de reabertura após integração aplicada.

## Limites e riscos conhecidos

- O banco comprova referências e manifestos cadastrados, **não**
  autentica documentos/assinaturas no SEI. O usuário deve conferir
  externamente e declarar a conferência na tela.
- A verificação SQL cobre contratos, RLS, funções e unicidade, mas
  **não executa alterações financeiras**, propositalmente. A prova
  transacional completa precisa ser feita em homologação controlada.
- Um checksum MD5 aqui identifica a integridade do **conteúdo arquivado**;
  os arquivos de origem seguem identificados por SHA-256. MD5 não
  representa uma assinatura digital de servidor ou de pessoa.
- Fechamentos **anteriores à instalação** não recebem um snapshot
  inventado retroativamente. A integração por este fluxo exige snapshot
  emitido depois da Fase 6.
- Não se automatiza a mudança do status da Etapa 6 ou o pagamento.
  Depois da integração, conferir as travas e registros fiscais do
  fluxo geral do convênio.

**Resultado esperado:** valor congelado e reproduzível no módulo de
Eletivas; lançamento só alterado quando o fiscal pedir **e confirmar**
uma integração ainda válida; nenhuma competência/lancamento aplica
a mesma proposta duas vezes.
