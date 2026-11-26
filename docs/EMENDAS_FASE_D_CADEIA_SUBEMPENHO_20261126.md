# PACTO Joinville · Emendas Parlamentares · Fase D
## Cadeia individual de Subempenho/Liquidação e Avisos de Movimento

**Elaborado em:** 26/11/2026.  
**Dependência:** Fases A → B → C instaladas.  
**Implantação:** proposta versionada em PR; o assistente **não aplicou D1, D2 ou D3 no banco operacional**.

## 1. Evidência de origem e regra institucional

O pós-flight da Fase C fornecido pelo usuário em 26/11/2026 registrou 1 NE emitida, 1 competência, 0 distribuições, 0 subempenhos e 0 pagamentos, com verificações de integridade zeradas. Uma consulta complementar de leitura confirmou 19 signatários ativos em `assinaturas_config`, nos cargos: Fiscal, Gerente, Coordenador ACP, Coordenador de Orçamentos, Diretor de Serviços Complementares, Diretoria Financeira e Secretária de Saúde.

**Isso não comprova a matriz exigível nos atos de subempenho da Emenda.** Os grupos de assinatura de Emendas não foram inferidos a partir do PVH, nem das opções de cargo cadastradas. A administração deverá homologar, com referência SEI, quais grupos são obrigatórios para cada uma das três subetapas, inclusive quando o procedimento indicar ausência expressa de assinatura em uma delas.

**Os registros no PACTO são conferências manuais.** Não há envio automático, assinatura digital no SEI, emissão de Aviso de Movimento no e-Pública nem verificação externa do documento pela API nesta fase.

## 2. Cardinalidade e preservação

```
Emenda
  └─ Lançamento/NE emitida
       └─ Competência com distribuição ativa da NE (Fase C)
            ├─ Solicitação parcial #1
            │    ├─ Solicitação Subempenho/Liquidação (doc 1)
            │    ├─ Aviso Movimento — Empenho em Liquidação (doc 2)
            │    └─ Aviso Movimento — Subempenho (doc 3)
            ├─ Solicitação parcial #2
            │    └─ documentos próprios e valores independentes
            └─ Solicitação parcial #N
```

A criação reutiliza `emenda_subempenho_criar` da Fase B, com chave de idempotência e numeração incremental na NE/competência. Não há limite arbitrário de uma solicitação por competência. O guard transacional da Fase C impede que a soma das reservas e dos subempenhos ultrapasse o valor explicitamente distribuído.

### Estados financeiros

- `rascunho`: solicitações internas reservam o valor solicitado.
- `solicitado`: documento 1 registrado, assinaturas exigíveis conferidas e encaminhamento confirmado, se a matriz exigir.
- `em_liquidacao`: documento 2 assinado, com **encaminhamento à SEFAZ.UAF.ADE obrigatoriamente confirmado**.
- `subempenhado`: documento 3 e assinaturas/encaminhamento exigíveis concluídos; só então `valor_subempenhado` recebe o valor efetivo do Aviso.
- `cancelado`: apenas rascunho ainda sem qualquer documento, com motivo e histórico.

**Valor solicitado não é sobrescrito pelo valor do Aviso.** A divergência fica auditável e as regras financeiras da Fase B/C continuam protegendo a disponibilidade. Nesta fase, pagamentos continuam fora do fluxo novo (Fase E; `emenda_blocos_pagamento.liberacao_id` ainda obrigatório).

### Estado independente de cada documento

Cada documento tem número, link e data no SEI; a matriz aplicável é fixada por `politica_id`. O status documental é derivado por visão `security_invoker`: `aguardando_assinaturas`, `aguardando_encaminhamento`, `pronto_concluir`, `concluido`. A conclusão cria evento próprio em `emenda_subempenho_conclusoes` e só então altera o status financeiro do subempenho.

## 3. Matrizes de assinaturas e encaminhamento

A tabela `emenda_subempenho_matrizes` é versionada **por emenda e tipo de documento**. Para cada uma das três subetapas, o Admin informa:

- grupos obrigatórios, em lista explícita, um por linha;
- se há encaminhamento exigível (na subetapa 2, obrigatório à SEFAZ.UAF.ADE);
- destino, número/link do documento SEI que fundamenta a exigência;
- justificativa da homologação (mínimo de 10 caracteres).

Apenas usuário com perfil Admin pode homologar. Nenhuma matriz é pré-populada a partir do PVH. É permitido que a matriz estabeleça zero grupos obrigatórios **somente mediante homologação formal com referência SEI**, não por omissão do cadastro.

A nova versão desativa a versão anterior, mantendo-a preservada. Cada documento aponta à versão vigente no instante do seu registro. A mudança posterior de matriz **não altera a exigência histórica do documento**. Não há sobrescrita de documento, assinatura, encaminhamento ou conclusão; correções posteriores a esses marcos exigirão rotina de retificação formal em evolução futura.

## 4. Operação do módulo

1. Registrar a distribuição da NE na competência (Fase C), sem rateio automático.
2. Homologar, na interface administrativa, as **três** matrizes exigíveis. O backend bloqueia novas solicitações enquanto faltar qualquer uma.
3. Escolher competência e valor solicitado e clicar em **Nova solicitação**. O sistema cria um rascunho individual; novos pedidos da mesma competência geram novos IDs/sequências.
4. Registrar o documento SEI da subetapa 1. Conferir os signatários dos grupos homologados, incluindo nome, cargo, número/link SEI e data. Confirmar eventual encaminhamento conforme a matriz; então **Concluir subetapa**.
5. Registrar o documento do e-Pública/SEI referente ao Aviso de Movimento — Empenho em Liquidação; conferir os grupos e **confirmar o encaminhamento efetivamente realizado à SEFAZ.UAF.ADE**, com data e prova SEI. Só então concluir a subetapa 2.
6. Registrar o Aviso de Movimento — Subempenho, inclusive valor efetivo, data, SEI e conferências exigíveis pela matriz. Concluir a subetapa 3; o compromisso passa a refletir o valor do Aviso, preservando o solicitado.
7. A programação, o comprovante de pagamento e parcelas parciais ficam reservados à Fase E.

O fluxo documental legado de liberações continua legível apenas em lançamentos onde já existam registros anteriores. Não poderá ser iniciado em novos lançamentos; o formulário novo substitui esse caminho operacional, evitando dupla contagem.

## 5. Migrations e alterações de código

Executar somente após validação de **backup restaurável** e homologação em ambiente de teste:

1. `supabase/migrations/20261126120000_emendas_fase_d1_evidencias_subempenho.sql` cria matrizes, assinaturas, encaminhamentos, conclusões e relacionamento `politica_id` no documento.
2. `supabase/migrations/20261126121500_emendas_fase_d2_fluxo_documental_rpc.sql` homologa matriz e substitui `emenda_subempenho_documentar` da Fase B por uma versão que **não avança status no simples registro**. Cria RPCs próprias de conferência de assinatura, encaminhamento e conclusão, além de proteger criação sem matriz e evidências contra alterações físicas.
3. `supabase/migrations/20261126123000_emendas_fase_d3_painel_documentos.sql` oferece status documental individual em leitura segura.

Todos os objetos novos são aditivos e possuem RLS, com escrita somente por RPCs autorizadas. As triggers de auditoria preservam snapshots em `emenda_historico`. A matriz só pode ser homologada por Admin; operações documentais, por ACP/Admin.

**Não reaplicar A, B ou C.** Após homologação, regenerar os tipos Supabase a partir do banco real para comparar o contrato versionado e reexecutar build e testes. A integração de PRs no GitHub continua ordenada A → B → C → D, pois o código ainda está em branches encadeadas.

## 6. Matriz de cenários de homologação

| Cenário | Resultado esperado |
| --- | --- |
| Duas solicitações de R$ 20 mil e R$ 15 mil na mesma NE/competência | Dois registros independentes; reserva de R$ 35 mil |
| Pedido R$ 30 mil, Aviso efetivo R$ 28 mil | Ambos preservados; compromisso final R$ 28 mil |
| Pedido sem distribuição ativa na NE/competência | Bloqueado pelo guard da Fase C |
| Pedido sem três matrizes ativas | Bloqueado pelo guard da Fase D |
| Usuário ACP tenta homologar matriz | Bloqueio por ausência de papel Admin |
| Matriz com 1 assinatura exigida; documento sem assinatura | Documento registrado, mas conclusão bloqueada |
| Documento 2 sem encaminhamento SEFAZ.UAF.ADE | Conclusão bloqueada |
| Documento 2 encaminhado sem assinatura obrigatória | Encaminhamento bloqueado |
| Documento 3 sem valor efetivo | Registro bloqueado |
| Documentos fora de sequência | Bloqueio sem escrita parcial |
| Dois usuários tentam concluir a mesma etapa | Serialização, um registro de conclusão sem duplicação |
| Reenvio idêntico de documento/assinatura/encaminhamento | Retorno do ID original sem duplicar |
| Reenvio com valores ou evidências divergentes | Bloqueio; retificação futura |
| Matriz nova após documento registrado | Documento antigo usa versão antiga; nova versão para novos documentos |
| Rascunho sem documento cancelado | Cancelamento preservado no histórico; reserva liberada |
| Rascunho com documento tenta cancelar | Bloqueio |
| Conta sem papel ACP/Admin tenta documentar ou concluir | Bloqueio por RPC |
| Tentativa de UPDATE/DELETE direto das evidências | Bloqueio em gatilho ou RLS |
| Tentativa de iniciar liberação legada após nova distribuição | Bloqueio |
| Pagamento direto vinculado ao novo subempenho | **Ainda não habilitado**: Fase E |

**Concorrência:** testar em duas sessões simultâneas de homologação, com uma NE e múltiplos pedidos concorrentes que, somados, excedam a alocação. Nenhum saldo poderá ficar negativo ou apresentar conflito de modelos.

## 7. Pós-implantação

Executar `scripts/emendas-fase-d-postflight-readonly.sql` e guardar a saída JSON; verificar:
- quatro tabelas e view instaladas, quatro RPCs presentes, cinco triggers de proteção, RLS em todas as tabelas novas e view `security_invoker`;
- nenhuma relação documento/matriz incompatível, assinatura fora da matriz, encaminhamento incompatível ou conclusão com requisitos pendentes;
- nenhum saldo negativo em competências ou conflito entre os livros financeiros;
- nenhuma alteração inesperada no histórico existente, NEs e pagamentos.

**Limitação:** um pós-flight de contagens não substitui testes transacionais de assinatura/encaminhamento, permissões por role, restauração de backup nem conferência institucional da matriz. A versão não deve ser publicada sem essas validações.

**Reversão:** se houver erro visual, reverter o frontend, preservando as tabelas e registros já criados. Não retornar à função antiga de `emenda_subempenho_documentar`, porque ela avançava o status sem verificar assinaturas/encaminhamento. Não executar `DROP` de evidências de auditoria.
