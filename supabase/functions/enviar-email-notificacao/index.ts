// Edge Function: envia e-mail exclusivamente a partir de uma notificação
// já persistida no banco. A função deve ser chamada pelo Database Webhook com
// o JWT de service_role; usuários comuns nunca podem invocá-la.
//
// Segurança:
// - verify_jwt=true na configuração da função;
// - valida também que o token recebido é exatamente o service_role do projeto;
// - usa do payload apenas o ID da notificação e relê título/mensagem/destinatário
//   do banco, evitando user_id/conteúdo arbitrários;
// - escapa HTML e neutraliza CR/LF no assunto.

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const FROM =
  Deno.env.get("NOTIFICACOES_FROM") ??
  "Convênios SMS Joinville <onboarding@resend.dev>";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });

const escapeHtml = (value: unknown) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const subjectSafe = (value: unknown) =>
  String(value ?? "Notificação")
    .replace(/[\r\n]+/g, " ")
    .trim()
    .slice(0, 150) || "Notificação";

const uuidValido = (value: unknown) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value ?? ""),
  );

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  try {
    if (!RESEND_API_KEY || !SUPABASE_URL || !SERVICE_ROLE) {
      console.error("Configuração obrigatória de e-mail ausente.");
      return json({ error: "Serviço de e-mail indisponível" }, 503);
    }

    // Defesa em profundidade além do verify_jwt da plataforma.
    const auth = req.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${SERVICE_ROLE}`) {
      return json({ error: "Não autorizado" }, 401);
    }

    const body = await req.json().catch(() => null);
    const webhookRecord = body?.record ?? body;
    const notificacaoId = webhookRecord?.id;

    if (!uuidValido(notificacaoId)) {
      return json({ error: "Payload de webhook inválido" }, 400);
    }

    // Não confiamos em user_id/titulo/mensagem recebidos pela internet.
    // Relê a notificação persistida, que é a fonte de verdade.
    const nr = await fetch(
      `${SUPABASE_URL}/rest/v1/notificacoes?id=eq.${encodeURIComponent(
        notificacaoId,
      )}&select=id,user_id,titulo,mensagem`,
      {
        headers: {
          apikey: SERVICE_ROLE,
          Authorization: `Bearer ${SERVICE_ROLE}`,
          Accept: "application/json",
        },
      },
    );

    if (!nr.ok) {
      console.error("Falha ao consultar notificação:", nr.status);
      return json({ error: "Falha ao consultar notificação" }, 502);
    }

    const [notificacao] = await nr.json();
    if (!notificacao?.user_id) {
      return json({ error: "Notificação não encontrada" }, 404);
    }

    const pr = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(
        notificacao.user_id,
      )}&select=email,nome`,
      {
        headers: {
          apikey: SERVICE_ROLE,
          Authorization: `Bearer ${SERVICE_ROLE}`,
          Accept: "application/json",
        },
      },
    );

    if (!pr.ok) {
      console.error("Falha ao consultar destinatário:", pr.status);
      return json({ error: "Falha ao consultar destinatário" }, 502);
    }

    const [perfil] = await pr.json();
    if (!perfil?.email) return json({ skipped: "Destinatário sem e-mail" }, 200);

    const titulo = subjectSafe(notificacao.titulo);
    const mensagem = escapeHtml(notificacao.mensagem).replaceAll("\n", "<br>");

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto">
        <div style="background:#003866;color:#fff;padding:16px 20px;border-radius:8px 8px 0 0">
          <strong>SMS Joinville · Convênios e Parcerias</strong>
        </div>
        <div style="border:1px solid #e6eaf0;border-top:none;padding:20px;border-radius:0 0 8px 8px">
          <h2 style="color:#003866;margin:0 0 8px">${escapeHtml(titulo)}</h2>
          <p style="color:#333">${mensagem}</p>
          <p style="color:#5b6472;font-size:12px;margin-top:24px">
            Você recebeu este aviso porque participa da gestão de empenhos de convênios e parcerias.
          </p>
        </div>
      </div>`;

    const send = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM,
        to: perfil.email,
        subject: `[Convênios SMS] ${titulo}`,
        html,
      }),
    });

    const out = await send.json().catch(() => ({}));
    if (!send.ok) {
      console.error("Resend recusou o envio:", send.status, out);
      return json({ error: "Falha no provedor de e-mail" }, 502);
    }

    return json({ ok: true, id: out?.id ?? null });
  } catch (e) {
    console.error("Erro ao enviar notificação por e-mail:", e);
    return json({ error: "Erro interno" }, 500);
  }
});
