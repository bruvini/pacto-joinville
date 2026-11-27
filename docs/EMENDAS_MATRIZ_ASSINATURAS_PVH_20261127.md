# PACTO Joinville · Emendas: assinaturas de subempenho na estrutura do PVH

**Demanda de 27/11/2026:** a seção de Emendas estava pedindo ao servidor para criar manualmente grupos e versões da matriz antes de preencher um subempenho, embora a estrutura funcional de assinaturas já exista no PVH.

## Estrutura operacional implementada

Na tela de Emendas, a solicitação de subempenho continua individualizada por NE e competência. Em cada solicitação, as três etapas seguem o mesmo **padrão visual e operacional** do PVH.

1. **Solicitação de Subempenho / Liquidação:** registro do documento SEI; fiscal **opcional** e membro da **Comissão de Gestão e Controle de Despesa obrigatório**.
2. **Aviso de Movimento — Empenho em Liquidação:** documento emitido no e-Pública, número/link SEI, mesma matriz de funções e encaminhamento obrigatório à **SEFAZ.UAF.ADE**.
3. **Aviso de Movimento — Subempenho:** documento do valor efetivamente subempenhado, sem assinatura adicional nesta subetapa, seguido por programação e comprovante de pagamento.

O Fiscal é escolhido de `assinaturas_config` (cadastro já usado no PVH). A Comissão usa `useHistoricoAssinaturasManuais` (catálogo deduplicado a partir dos documentos efetivamente assinados). **O PACTO não inventa nem confirma assinatura automaticamente:** só registra após ação explícita, com evidência SEI e data.

## Governança específica de Emendas

O banco da Fase D exige matriz formal homologada por administrador para registrar os documentos. Por isso a interface propõe as mesmas **funções** usadas no PVH, mas não pressupõe que uma homologação do PVH aprove automaticamente atos de Emendas.

A configuração agora consiste em **uma única confirmação**: informar número e link da referência SEI que sustenta essa matriz para Emendas, marcar a declaração de conformidade e clicar em **Aprovar regras das três subetapas**. O sistema registra versão, justificativa padronizada, autor e horário. Não há textarea para nomes de grupos, não há três formulários de aprovação e não é necessário repetir a matriz por solicitação.

É possível preparar rascunhos de solicitações antes da homologação. A migration remove exclusivamente o gatilho que bloqueava a criação do rascunho. Os gatilhos de limite financeiro permanecem; a RPC de **documentar** continua exigindo matriz ativa. Não se pode assinar, encaminhar ou concluir etapas sem documentos reais.

As matrizes antigas permanecem no banco com versões, e os documentos já registrados preservam seu `politica_id`. Para casos de matriz antiga excepcional, o frontend conserva o formulário genérico de conferência de assinatura apenas para documentos legados com grupos diferentes.

## Segurança e aplicação

1. [Migration de matriz estruturada](../supabase/migrations/20261127140500_emendas_matriz_assinaturas_estruturada.sql): adiciona `grupos_opcionais`, cria RPC transacional de homologação única e ajusta RPC de assinatura. NÃO homologa nada automaticamente e NÃO cria documentos.
2. [Pós-implantação (somente leitura)](../scripts/emendas-matriz-pvh-pos-implantacao-20261127.sql): verifica coluna, RPC, regra de opção, permissionamento `anon`, manutenção dos guardrails documentais, saldos e registro financeiro.
3. Aplicar no frontend a nova matriz e o painel de assinaturas, somente após a migration; revisar funcionalmente no Lovable antes de publicar.
4. Homologar matriz **apenas com referência SEI efetivamente aplicável às Emendas**, não copiar por semelhança de tela.
5. Testar com perfis ACP e Admin, fiscal opcional, comissão obrigatória, envio à SEFAZ, ausência de pagamento até Aviso de Subempenho concluído e nomes históricos.

**Restrição:** assinatura opcional não pode bloquear a conclusão, assinatura obrigatória não pode ser dispensada informalmente e a seleção de um nome não prova que uma assinatura ocorreu no SEI.
