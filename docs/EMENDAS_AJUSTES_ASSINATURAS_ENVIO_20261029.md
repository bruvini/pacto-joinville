# Emendas — Correção de envio, matriz alternativa e linha do tempo

Correções realizadas:

- O erro PostgreSQL `column reference "etapa" is ambiguous` vinha da variável homônima à coluna em `emenda_formalizar_lancamento`. A migration renomeia a variável para `documento_solicitacao` e qualifica a coluna usando o alias `d`.
- Matriz com cinco **grupos obrigatórios** e até sete opções de assinatura: Orçamentos; Fiscal; Gerente; Coordenador ACP; Diretor de Serviços Complementares; Diretoria Financeira; Secretária de Saúde. Basta um do par Gerente/Coordenador e um do par Diretoria/Secretária, mas os dois de cada par podem ser registrados.
- Cada seleção persiste imediatamente via RPC com validação de cargo ativo no pool `assinaturas_config`. Não há botão de salvar.
- O ícone de retirada abre confirmação; a RPC apaga apenas o registro operacional quando não houve envio/formalização, mantendo evento DELETE na auditoria. **Não revoga assinaturas digitais no SEI**.
- A seção Envio à SEFAZ é revelada somente quando os cinco grupos estão completos.
- Linha do tempo em botão no cabeçalho do lançamento, modal cronológico com autor, horário, entidade, operação e campos relevantes. O modal inclui exclusões usando `anterior` e `novo`, limitado aos últimos 500 eventos da emenda, limite explicitado.
- A seção de liberações, comprovantes e pagamentos permanece visível e bloqueada antes de registrar NE. A conciliação é exibida após emissão da NE; a opção de anulação surge apenas quando existe saldo residual não liberado.

Migration: `supabase/migrations/20261029022000_emendas_assinaturas_fluxo_envio.sql`. Executar uma vez após `20261029015000_emendas_revisao_matriz_e_parecer.sql`. Antes de homologação autenticada, não considerar o envio e a reserva validados operacionalmente. A migration não envia documentos ou efetua pagamentos na SEFAZ.

Roteiro de conferência: retirar e recolocar assinatura em rascunho; preencher ambos cargos alternativos e apenas um deles; remover o único nome de um grupo e conferir bloqueio do envio; completar grupos e confirmar envio; verificar transição para a NE sem erro; verificar log de retirada no modal; confirmar liberação visível e bloqueada antes da NE; confirmar anulação oculta quando residual zero.
