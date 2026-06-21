# Notificações automáticas

O sistema gera notificações automaticamente quando um processo **muda de
etapa/responsável** ou é **concluído** (fanout por trigger no banco —
`fanout_notificacoes`). Há duas camadas: **in-app** (sino, tempo real) e
**e-mail** (opcional).

---

## ⚠️ Pré-requisito: aplicar as migrações no banco

O *republish* do Lovable recompila só o **frontend** — ele **não roda o SQL**.
Então as tabelas novas (`notificacoes`, `termos_aditivos`), as travas e as
políticas de segurança **precisam ser aplicadas manualmente uma vez**:

1. No Lovable Cloud, abra **SQL editor**.
2. Cole o conteúdo de **`supabase/APLICAR_MIGRACOES.sql`** (arquivo na raiz do
   projeto) e clique em **Run**.
3. Volte em **Database** e confirme que apareceram as tabelas `notificacoes` e
   `termos_aditivos`.

Sem esse passo, o sino e o e-mail não têm onde gravar e a trava de saldo não existe.

---

## 1. In-app (tempo real) — funciona após aplicar as migrações ✅

- Tabela `public.notificacoes` (uma linha por destinatário, com estado de leitura).
- Entrega instantânea via **Supabase Realtime** no **sino** do cabeçalho:
  contador de não lidas, lista, marcar como lida/todas, clique abre o lançamento,
  e um *toast* aparece quando chega algo novo.
- Segurança: RLS garante que cada usuário só vê as **suas** notificações.

Para testar: com dois usuários (um ACP e um ACO), avance a etapa de um processo
e veja o sino do outro acender na hora.

---

## 2. E-mail institucional — opcional, passo a passo detalhado ✉️

A ideia: **toda vez que uma notificação é criada** (uma linha nova entra na
tabela `notificacoes`), queremos que **um e-mail seja disparado** para o
destinatário. Quem faz esse "disparo automático" é um **Database Webhook**.

### O que é um Database Webhook (em português claro)
É um "gatilho de banco com chamada externa": você diz ao banco
*"sempre que entrar uma linha nova na tabela `notificacoes`, chame esta função
pela internet"*. Essa função (a Edge Function `enviar-email-notificacao`) recebe
os dados da notificação, descobre o e-mail do destinatário e manda o e-mail pelo
provedor (Resend).

```
processo muda de etapa
        ↓
trigger cria a notificação  →  linha nova em "notificacoes"
        ↓  (Database Webhook detecta o INSERT)
chama a Edge Function "enviar-email-notificacao"
        ↓
função busca o e-mail do destinatário e envia pelo Resend
```

> Por que webhook e não enviar direto no trigger do banco? Para **desacoplar**:
> o envio do e-mail roda "por fora", então avançar a etapa nunca fica travado
> esperando o e-mail (padrão recomendado e mais robusto).

### O que você precisa antes
- **Uma conta no Resend** (resend.com) e uma **API Key** (`RESEND_API_KEY`).
- Um **remetente verificado** no Resend (ex.: `convenios@joinville.sc.gov.br`).
  Enquanto não verificar um domínio próprio, dá para testar com o remetente de
  teste do Resend (`onboarding@resend.dev`).

### Passo 2 — ligar o disparo (duas formas, escolha UMA)

**Forma A — pela tela de Webhooks (Supabase padrão):**
1. No painel do banco, vá em **Database → Webhooks → Create a new hook**.
2. Preencha:
   - **Name**: `email-notificacao`
   - **Table**: `notificacoes`
   - **Events**: marque apenas **Insert**
   - **Type**: **Supabase Edge Functions**
   - **Edge Function**: selecione **`enviar-email-notificacao`**
3. Salve. Pronto — a partir daí cada notificação criada também vira e-mail.

**Forma B — se o seu painel do Lovable Cloud NÃO tiver a tela "Webhooks":**
O painel do Lovable é enxuto e pode não expor essa tela. Nesse caso o caminho é
o banco chamar a função via SQL (extensão `pg_net`). Rode isto **uma vez** no
**SQL editor**, trocando a URL pela da sua função (você a encontra em
**Edge functions → enviar-email-notificacao**):

```sql
create extension if not exists pg_net;

create or replace function public.disparar_email_notificacao()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform net.http_post(
    url     := 'https://SEU-PROJETO.functions.supabase.co/enviar-email-notificacao',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body    := jsonb_build_object('record', to_jsonb(NEW))
  );
  return NEW;
end; $$;

drop trigger if exists trg_email_notificacao on public.notificacoes;
create trigger trg_email_notificacao
  after insert on public.notificacoes
  for each row execute function public.disparar_email_notificacao();
```

### Definir os segredos (vale para as duas formas)
No Lovable Cloud → **Secrets** (ou Edge functions → Secrets), adicione:
- `RESEND_API_KEY` = sua chave do Resend
- `NOTIFICACOES_FROM` (opcional) = remetente, ex.: `Convênios SMS <convenios@joinville.sc.gov.br>`

`SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` já existem no ambiente da função.

### Importante sobre o Lovable Cloud
- A **Edge Function** precisa estar **publicada**. No Lovable, funções costumam
  ser implantadas pelo próprio fluxo dele — se em **Edge functions** não aparecer
  `enviar-email-notificacao`, peça ao Lovable para criar/publicar a função
  (o arquivo já está pronto em `supabase/functions/enviar-email-notificacao/`).
- O Lovable também tem um recurso próprio de **Emails (Pro)** — se você tiver o
  plano Pro, dá para usar ele como alternativa ao Resend.

> A função é tolerante: se `RESEND_API_KEY` não estiver configurada, ela apenas
> ignora o envio e **não quebra** o fluxo. Ou seja, a camada in-app continua
> funcionando normalmente mesmo sem o e-mail.
