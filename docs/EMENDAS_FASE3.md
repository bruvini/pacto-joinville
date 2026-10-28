# Emendas Parlamentares — Reorganização e Fase 3 documental

## Visão do usuário
1. A lista de emendas agora é uma tabela com pesquisa por número, autoria, objeto, processo e portaria SEI e filtros combináveis por situação, instituição, exercício, modalidade e origem.
2. O detalhe possui **Visão geral** (capa e mini-dashboard), **Lançamentos** (histórico de execuções e linha do tempo de cada lançamento) e **Cadastro** (edição com triggers de auditoria).
3. Documentos e normas não têm aba própria. Dotação e fonte fazem parte do lançamento; os registros antigos de `emenda_documentos` e `emenda_fontes` NÃO são excluídos nem migrados silenciosamente. A tabela de ajustes formais e o histórico permanecem preservados no banco, mas suas antigas abas deixam de aparecer.
4. Cada lançamento começa com tipo mensal (1), trimestral (3) ou anual (12), competência inicial **MM/AAAA** com máscara e parcela inicial vinculada ao convênio. Exemplo: 10/2026, parcela 15, trimestre → outubro/15, novembro/16, dezembro/17.
5. Cada filho registra exigência mínima de uma futura liberação, sem valores antecipados. A Fase 4 implementará as liberações reais.

## Estados e documentos
- `emenda_iniciar_lancamento` cria uma estrutura `rascunho` idempotente, serializada por emenda: **sem reserva** e sem emissão de NE.
- `emenda_salvar_etapa`: 1) dotação e fonte + SEI, 2) autorização financeira + SEI, 3) solicitação de empenho + SEI e valor.
- `emenda_conferir_assinatura`: fiscal, gerência e diretoria, com nome e prova de documento SEI. Esta é **conferência documental**, NÃO assinatura digital executada pelo PACTO.
- Alterar dotação invalida autorização e solicitação; alterar autorização invalida solicitação; qualquer reconferência documental invalida as assinaturas anteriores. Tudo tem trilha em `emenda_historico`.
- `emenda_formalizar_lancamento`: exige as três etapas e três assinaturas. Somente então chama a função transacional existente para reservar o valor e criar 1/3/12 competências filhas vinculadas à solicitação.
- `emenda_registrar_ne_documental`: exige solicitação formalizada; chama a função financeira da Fase 2 para converter a reserva em valor efetivo da NE. Não emite nota na SEFAZ.
- A inserção direta de solicitações/NEs pelas antigas RPCs é revogada para `authenticated` a fim de evitar contornar as etapas documentais. As novas RPCs conferem autenticação e papéis ACP/Admin.
- Abertura usa `chave_idempotencia`, evitando duplicação por duplo clique ou reenvio. Competências globais são únicas por emenda/mês; vários lançamentos podem coexistir em um mês. Os valores não são rateados.

## Migração
`supabase/migrations/20261028233000_emendas_lancamentos_fase3_documental.sql`

Cria `emenda_lancamentos`, `emenda_lancamento_meses`, `emenda_etapas_documentais`, `emenda_assinaturas_conferidas`, e `parcela_convenio` nas competências filhas existentes. Todos os recursos são aditivos e preservam histórico, RLS e funções financeiras da Fase 2. A migration deve ser aplicada **uma vez** no banco vinculado ao Lovable. Testar com contas ACP/Admin e consulta ACO antes de uso operativo.

## Homologação
- Abrir 10/2026, parcela 15, trimestral, verificar meses 10/2026, 11/2026, 12/2026 e parcelas 15-17.
- Conferir 12 meses ao atravessar dezembro/janeiro; verificação numérica no DB.
- Verificar que abertura não diminui saldo.
- Testar tentativa de antecipar autorização ou solicitação; deve ser negada.
- Registrar dotação, autorização, solicitação e três documentos de assinaturas. Só então formalizar reserva.
- Alterar dotação ou autorização e verificar invalidação das evidências posteriores.
- Registrar NE menor/igual/maior e conferir as regras já existentes de saldo, sem duplicidade de reserva.
- Abrir dois lançamentos no mesmo mês e conferir único cadastro global da competência.
- Testar visualização read-only e tentativa de RPC por conta sem ACP/Admin.
- Confirmar histórico de inserções/atualizações/exclusões e ausência de execução na Fazenda.

Não inserir lançamentos ou notas fictícias no banco operacional. A auditoria por usuário está no banco; se houver uma página global de logs, ela não deve ser confundida com prova de execução financeira.
