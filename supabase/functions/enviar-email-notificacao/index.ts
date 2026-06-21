// Edge Function: envia e-mail quando uma notificação é criada.
// Acionada por um Database Webhook (INSERT em public.notificacoes).
// Requer os segredos: RESEND_API_KEY (provedor de e-mail) e, automaticamente
// disponíveis no ambiente, SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.
//
// Ative em: Supabase → Database → Webhooks → criar webhook na tabela
// public.notificacoes (evento INSERT) apontando para esta função.

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const FROM = Deno.env.get("NOTIFICACOES_FROM") ?? "Convênios SMS Joinville <onboarding@resend.dev>";

Deno.serve(async (req) => {
  try {
    if (!RESEND_API_KEY || !SUPABASE_URL || !SERVICE_ROLE) {
      return new Response(JSON.stringify({ skipped: "Configuração de e-mail ausente" }), { status: 200 });
    }
    const body = await req.json();
    const record = body.record ?? body; // payload do Database Webhook
    const { user_id, titulo, mensagem } = record ?? {};
    if (!user_id) return new Response("sem destinatário", { status: 200 });

    // Busca o e-mail do destinatário (service role ignora RLS).
    const r = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${user_id}&select=email,nome`, {
      headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}` },
    });
    const [perfil] = await r.json();
    if (!perfil?.email) return new Response("sem e-mail", { status: 200 });

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto">
        <div style="background:#003866;color:#fff;padding:16px 20px;border-radius:8px 8px 0 0">
          <strong>SMS Joinville · Convênios e Parcerias</strong>
        </div>
        <div style="border:1px solid #e6eaf0;border-top:none;padding:20px;border-radius:0 0 8px 8px">
          <h2 style="color:#003866;margin:0 0 8px">${titulo ?? "Notificação"}</h2>
          <p style="color:#333">${mensagem ?? ""}</p>
          <p style="color:#5b6472;font-size:12px;margin-top:24px">
            Você recebeu este aviso porque participa da gestão de empenhos de convênios e parcerias.
          </p>
        </div>
      </div>`;

    const send = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to: perfil.email, subject: `[Convênios SMS] ${titulo ?? "Notificação"}`, html }),
    });
    const out = await send.json();
    return new Response(JSON.stringify({ ok: send.ok, out }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 200 });
  }
});
