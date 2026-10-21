# Proposta de implementação — cadastro de assinaturas em lote

Status: **proposta para aprovação**. Nenhuma rotina de assinaturas foi modificada nesta entrega.

## Objetivo e princípios

Acelerar o **registro de assinaturas já efetivamente coletadas no SEI**,
sem realizar assinatura digital pelo usuário, sem preencher assinaturas
fictícias e sem avançar etapas automaticamente.

A operação só exibe documentos e slots de assinatura atualmente elegíveis
e pendentes, respeitando autorizações, vinculação ao documento, ordem dos
slots obrigatórios e trilha de auditoria.

## Matriz de origem por módulo

| Módulo | Documentos | Tabela de eventos | Particularidades |
| --- | --- | --- | --- |
| Convênios | Blocos por etapa, lançamento/parcelas | `assinaturas_etapa` | `bloco`, `slot`, ordem e cargos de `BlocoAssinaturas`; itens pais não assináveis |
| Piso | Documentos vinculados à competência/obrigação | `piso_documento_assinaturas` | `piso_assinatura_matriz` define obrigatórios e opcionais; somente documentos persistidos |
| PVH / Solicitação de NE | Empenho existente, Etapa 3 | `pvh_empenho_solicitacao_assinaturas` | Três obrigatórias e slots opcionais; não registrar antes de criar Solicitação |
| PVH / Outros documentos | Documento municipal persistido | `pvh_documento_assinaturas` | Matriz própria, `revogado_em`; revisão de documento e papel |
| PVH / Subempenho | Subempenho existente, Etapa 4 | `pvh_subempenho_assinaturas` | Comissão obrigatória, fiscal opcional, revogação com motivo |

## Experiência recomendada

1. Reaproveitar o **modal de operação em lote** de cada módulo, com
   abas **Dotação/Fonte** e **Assinaturas pendentes**. No fluxo de Convênios,
   acrescentar a aba ao modal existente; em Piso/PVH, expandir o modal
   implementado nesta entrega. O acesso às assinaturas não depende
   de existir dotação/fonte pendente.
2. A aba de assinaturas terá filtros por competência, prestador, tipo de
   documento, bloco, slot e servidor; apenas documentos efetivamente
   existentes e que necessitem da assinatura.
3. Seleção explícita de linhas. Nome e cargo podem ser aplicados a mais
   de uma linha somente quando o servidor é elegível para **cada slot**.
4. Prévia (dry-run) por documento com checklist: pronto, já registrado,
   documento faltante, slot bloqueado, cargo incompatível, etapa encerrada.
5. Confirmação dupla: *Estou registrando assinaturas comprovadas no SEI*;
   nunca assinar eletronicamente, nem atestar por conta de terceiros.
6. Gravação por item, com status individual, código identificador da
   evidência, horário do servidor, usuário que registrou e evento auditável.
7. Resumo e exportação dos resultados; falhas não desfazem registros
   bem-sucedidos e podem ser reprocessadas de forma idempotente.

## Regras não negociáveis

- **Não criar documentos, empenhos ou subempenhos** apenas para ter onde
  gravar assinatura.
- Somente slots previstos nas respectivas matrizes, respeitando o mínimo,
  a exclusividade por documento e as precedências por etapa/bloco.
- Distinguir **signatário do documento** de **usuário que lançou o registro**.
  O lançamento por terceiro requer evidência documental verificável.
- Nunca utilizar um registro antigo para presumir que a pessoa assinou
  outro documento; reaproveitar só nome/cargo no formulário.
- Não modificar `assinado_em`, `revogado_em`, estado de encaminhamento
  ou conclusão de outras assinaturas na mesma operação.
- Se uma assinatura foi revogada, seguir a rotina de substituição do módulo;
  não reativar implicitamente o registro anterior.
- Verificar permissões no servidor e/ou RPC; interface sem permissão não
  constitui proteção suficiente.
- Logs imutáveis, limite de lote, transações idempotentes e prevenção
  de gravação concorrente por `documento + bloco + slot`.

## Arquitetura proposta

- Serviço compartilhado para listar candidatos, padronizar resultados e
  validar autorizações sem substituir os motores de assinaturas por módulo.
- Adaptadores explícitos: convênios, documentos Piso, solicitações PVH,
  documentos PVH e subempenhos PVH.
- Idealmente uma **RPC por item** com autenticação, checagem do estado
  atual e restrição de duplicidade, persistindo também uma evidência
  ou referência documental (SEI).
- Testes para documentos incompletos, papéis não elegíveis, assinaturas
  já registradas, revogadas, precedência, concorrência, 13ª do Piso e
  reprocessamento seguro.

## Aprovações ainda necessárias

1. Obrigatoriedade de link/ID de documento SEI como prova para cada assinatura.
2. Perfis autorizados a registrar assinaturas **de terceiros** em cada módulo.
3. Se as evidências poderão ser compartilhadas entre linhas com assinaturas
   comprovadamente realizadas no mesmo documento (não entre documentos distintos).
4. Limite máximo de lançamentos por confirmação e necessidade de auditoria
   adicional em lotes maiores.

A implementação desta proposta não foi executada nesta entrega.
