# Emendas · revisão das etapas e matriz de assinaturas

## Decisões e reorganização
- **Etapa 1 — Dotação, fonte e autorização financeira.** O parecer é uma subseção do mesmo bloco. Se aprovado, não aparece novo formulário de decisão; o evento aprovado mais recente traz **Reverter aprovação**, com confirmação modal. A reversão é proibida depois de formalizar ou enviar à SEFAZ, registrada em histórico como `reaberto` e invalida solicitação e assinaturas em preparação.
- **Etapa 2 — Solicitação de empenho, assinaturas e envio.** Número SEI, link SEI e valor são informados juntos. O botão de abrir documento surge no mesmo campo do link válido. Sem botão de validação: autosave após 900 ms de dados completos e valor dentro do saldo disponível. O Supabase volta a validar limites na RPC.
- A matriz é parte da Etapa 2, assim como a confirmação de envio à SEFAZ.UCG.AEO. A etapa 3 permanece dedicada à NE emitida.
- A assinatura é selecionada diretamente em lista suspensa, com persistência imediata, sem botão Conferir ou SEI separado; nome/cargo vêm de `assinaturas_config`, o pool usado pelos convênios. Mostra data e hora de registro.
- Cinco slots: Coordenador de Orçamentos; Fiscal; Gerente **ou** Coordenador ACP; Diretor de Serviços Complementares; Diretoria Financeira **ou** Secretária de Saúde. Em cada slot OU, **um** signatário basta. Cada slot é único.
- Registros anteriores permanecem consultáveis; nomes antigos sem vínculo com o pool podem ser substituídos por configuração atual. A fonte de documento SEI é a solicitação, não cada assinatura.

## Migration
`supabase/migrations/20261029015000_emendas_revisao_matriz_e_parecer.sql`.

Pré-requisito: migrations até `20261029012000_emendas_autorizacao_dotacao_validacao.sql`. Essa migration nova **não é opcional**: o frontend depende das RPCs `emenda_reabrir_aprovacao` e `emenda_selecionar_signatario` e da flexibilização dos campos de assinatura. Não repetí-la após sucesso. Não cria lançamentos de exemplo nem realiza atos externos na SEFAZ.

Os controles do banco garantem: papel ACP/Admin autenticado, lançamento em rascunho, aprovação vigente para reversão, solicitação registrada para assinatura, signatário ativo e cargo compatível, exclusividade por slot, preservação da autoria e carimbo temporal pela auditoria. A antiga RPC de assinatura por texto livre perde EXECUTE para clientes, evitando contornar o cadastro configurado.

## Homologação
1. Aprovar e constatar que o formulário de decisão desaparece.
2. Clicar em Reverter aprovação e confirmar: evento `reaberto` no histórico; solicitação e assinaturas removidas do estado operacional; exigir nova aprovação.
3. Digitar número/link SEI e valor permitido: confirmar autosave sem botão.
4. Informar valor acima do disponível: mostrar aviso e bloquear progressão.
5. Conferir dropdown com nomes e cargos já cadastrados, gravar imediatamente, atualizar horário e nome.
6. Testar cada cargo alternativo (Gerente/Coordenador, Financeira/Secretária); um cadastro preenche o respectivo slot.
7. Testar assinatura incompatível ou inativa via RPC direta: deve ser recusada.
8. Verificar que envio só é confirmado após cinco slots, e que reversal não é permitido após formalização.

Até homologação autenticada no banco, não considerar apto ao uso financeiro operacional.
