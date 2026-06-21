# Notificações automáticas

O sistema tem duas camadas de notificação, geradas automaticamente quando um
processo **muda de etapa/responsável** ou é **concluído** (fanout por trigger no
banco — `fanout_notificacoes`).

## 1. In-app (em tempo real) — já ativo ✅
- Tabela `public.notificacoes` (uma linha por destinatário, com estado de leitura).
- Entrega instantânea via **Supabase Realtime** no **sino** do cabeçalho
  (`NotificationBell`): contador de não lidas, lista, marcar como lida / todas,
  e clique abre o lançamento. Toast aparece quando chega algo novo.
- Segurança: RLS garante que cada usuário só vê as **suas** notificações.

## 2. E-mail institucional — opcional (precisa de 2 passos) ✉️
A Edge Function `supabase/functions/enviar-email-notificacao` já está pronta
(usa o provedor **Resend**). Para ativar:

1. **Defina os segredos** no projeto Supabase (Edge Functions → Secrets):
   - `RESEND_API_KEY` — chave do Resend (ou outro provedor compatível).
   - `NOTIFICACOES_FROM` (opcional) — remetente verificado, ex.: `Convênios SMS <convenios@joinville.sc.gov.br>`.
   - `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` já existem no ambiente da função.
2. **Crie um Database Webhook**: Supabase → Database → Webhooks → novo webhook na
   tabela `public.notificacoes`, evento **INSERT**, apontando para a função
   `enviar-email-notificacao`.

Pronto: cada notificação gerada também dispara um e-mail ao destinatário. A
função é tolerante — se a chave não estiver configurada, ela apenas ignora o
envio (não quebra o fluxo).

> Observação: o disparo de e-mail é **desacoplado** (via webhook), então não
> impacta o tempo da transação que avança o processo — padrão recomendado.
