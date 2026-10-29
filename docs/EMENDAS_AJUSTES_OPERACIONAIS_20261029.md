# PACTO · Emendas — Ajustes operacionais de 29/10/2026

## Gestão de lançamentos e hierarquia visual
- A lista de lançamentos fica no topo da Visão Geral, após o resumo financeiro compacto. Os dados cadastrais e portarias estão recolhidos em **Consultar vinculação, portarias e regras de referência**.
- O painel de indicadores (Fase 6) fica **recolhido por padrão**, com botão explícito para exibir gráficos, indicadores e relatórios sem impedir o acesso à lista.
- Clicar em qualquer região de uma linha (ou usar Enter/Espaço com a linha em foco) abre a página individual do lançamento.
- **Gerenciar** abre o modal do cadastro do lançamento (competência inicial, periodicidade, parcela). Ações no modal não propagam clique para a linha.
- A exclusão do lançamento é solicitada dentro do modal administrativo, com um segundo modal de confirmação; não usa window.alert.
- Rascunhos sem pareceres, assinaturas, solicitação formalizada ou documentos posteriores podem ter os dados de criação editados/excluídos. Se há somente dotação, editar o período **invalida a confirmação** e exige nova conferência; a operação é auditável.
- Após formalização ou parecer financeiro, a gestão cadastral permanece somente leitura para não modificar competências já vinculadas a atos documentais.

## Dotação/fonte
- O checkbox de confirmação da inclusão no bloco da Coordenação de Orçamentos fica sempre visível, habilitado apenas quando ambos os campos estão preenchidos.
- A confirmação efetiva aparece marcada e identifica nome, data e horário do usuário responsável por meio de consulta ao perfil vinculado ao registro. Se o perfil não estiver disponível, a interface não inventa o nome.
- Campos vazios ou modificados bloqueiam as etapas posteriores **imediatamente na interface**, mesmo quando existia confirmação anterior.
- Se um valor confirmado for apagado, ao sair do campo a confirmação é invalidada pela RPC `emenda_invalidar_dotacao`. Rascunhos permanecem em preparação. A invalidação limpa documentos posteriores e assinaturas, mas não apaga pareceres históricos.
- O usuário pode desmarcar o checkbox para retirar a confirmação e retornar ao fluxo anterior.
- A mudança de dados já confirmados (não vazios) requer nova marcação; uma confirmação antiga não desbloqueia o formulário com valores divergentes.

## Autorização financeira
- Decisões **Aprovado** e **Recusado** aparecem como opções compactas com histórico cronológico de eventos.
- **Aprovado**: nenhuma justificativa exigida; o comentário é gravado como texto vazio.
- **Recusado**: justificativa obrigatória com pelo menos 5 caracteres.
- A regra é aplicada em **UI + PostgreSQL**, não apenas no botão.

## Banco e homologação
Arquivo único: `supabase/migrations/20261029012000_emendas_autorizacao_dotacao_validacao.sql`. Depende das migrations anteriores até Fase 5; executar **uma vez**, de forma integral, no SQL Editor ou por migration oficial. Inclui substituição da RPC de parecer, RPC de invalidação e revisão restrita de edição/exclusão de rascunho. Somente papéis ACP/Admin autenticados podem executar. Não realiza atos financeiros externos.

Teste mínimo antes do uso operacional:
1. Confirmar dotação, conferir nome, data, hora e checkbox marcado.
2. Apagar a fonte e sair do campo; verificar etapas seguintes bloqueadas e persistência após recarregar.
3. Reconferir dotação e confirmar que o antigo parecer não é reaproveitado.
4. Aprovar sem comentário; verificar gravação e liberação da etapa de solicitação.
5. Recusar sem justificativa (deve bloquear) e com justificativa (deve registrar no histórico).
6. Usar Gerenciar para editar rascunho com apenas dotação, conferir invalidação. Tentar com parecer ou NE (deve impedir).
7. Confirmar clique na linha, acesso via teclado e botão Gerenciar sem navegar.
8. Confirmar Visão Geral abre diretamente nos lançamentos, com indicadores fechados por padrão.

**Nota:** não apagar/alterar dados de produção para testar; utilizar processo de homologação ou caso autorizado. O build e testes unitários não substituem validação transacional autenticada.
