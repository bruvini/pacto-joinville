# Proposta de implementação — cadastro de assinaturas em lote

Status: **implementado em código, pendente de aplicação da migration e homologação funcional**.
A nova aba exige a migration `20261021170000_assinaturas_lote_auditaveis.sql`.
A operação de registro é feita por RPC validada no banco; nenhuma assinatura
digital é criada no SEI.

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

1. **Definido:** link SEI válido e idêntico ao documento existente; data/hora efetiva da assinatura preenchida manualmente.
2. **Definido:** ACP e Admin nos blocos de Convênios; ACO e Admin em liberação orçamentária; ACP/ACO/Admin no Piso e PVH, sujeitos a validação no banco.
3. **Definido:** evidência individual por assinatura, ainda que compartilhe URL de um documento já vinculado.
4. **Definido:** máximo de 25 posições por confirmação; cada uma é validada e gravada em sua própria transação. Não há operações de lote maiores que isso.

## Homologação
1. Aplicar a migration no SQL Editor do Lovable.
2. Abrir a aba "Assinaturas pendentes" em cada um dos três módulos.
3. Conferir os documentos e o mesmo link que consta no SEI.
4. Selecionar um signatário compatível; nas assinaturas manuais digitar nome.
5. Informar data/hora **real** da assinatura obtida no documento SEI.
6. Conferir o preview, confirmar declaração e gravar (máximo 25).
7. Verificar na tela individual que o registro foi persistido uma única vez,
   sem alterar estado do encaminhamento nem da conclusão da etapa.
8. Testar bloqueio em competência encerrada, sem URL, com cargo incompatível,
   e dois usuários tentando a mesma assinatura.
9. Conferir CSV de resultado e a tabela de evidências.
O SQL de instalação é **aditivo**: não substitui as assinaturas existentes.

## Observação sobre SLA
O horário do cadastro é gravado na tabela de evidências; a data/hora informada
do documento SEI fica em `assinado_em` na tabela do respectivo módulo.
Isso impede que um registro tardio seja apresentado como assinatura tardia.
