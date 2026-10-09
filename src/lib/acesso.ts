import { supabase } from "@/integrations/supabase/client";

let ultimaRota = "";
let ultimaRotaEm = 0;

/**
 * Registra um evento na trilha de acessos (LGPD). Fire-and-forget:
 * nunca bloqueia nem quebra o fluxo do usuário se o insert falhar.
 */
let perfilCache: { id: string; nome: string | null; email: string | null } | null = null;

export async function registrarAcesso(acao: string, opts: { detalhe?: string; rota?: string } = {}) {
  try {
    // getSession lê a sessão local (sem ida ao servidor); o perfil é cacheado.
    const { data: s } = await supabase.auth.getSession();
    const user = s.session?.user;
    if (!user) return;
    const u = { user };
    if (perfilCache?.id !== user.id) {
      const { data } = await supabase.from("profiles").select("nome, email").eq("id", user.id).maybeSingle();
      perfilCache = { id: user.id, nome: data?.nome ?? null, email: data?.email ?? null };
    }
    const p = perfilCache;
    await supabase.from("logs_acesso").insert({
      user_id: u.user.id,
      usuario_nome: p?.nome ?? null,
      usuario_email: p?.email ?? u.user.email ?? null,
      acao,
      detalhe: opts.detalhe ?? null,
      rota: opts.rota ?? null,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 250) : null,
    });
  } catch {
    // trilha nunca derruba o app
  }
}

/** Registra navegação de página, deduplicando repetições rápidas da mesma rota. */
export function registrarNavegacao(rota: string) {
  const agora = Date.now();
  if (rota === ultimaRota && agora - ultimaRotaEm < 60_000) return;
  ultimaRota = rota;
  ultimaRotaEm = agora;
  void registrarAcesso("navegacao", { rota });
}
