import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { KeyRound, LockKeyhole } from "lucide-react";
import { toast } from "sonner";
import { LoginBackground } from "@/components/auth/LoginBackground";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import logoAsset from "@/assets/joinville-logo.png.asset.json";

export const Route = createFileRoute("/redefinir-senha")({
  head: () => ({ meta: [{ title: "Redefinir senha | Gestão SMS Joinville" }] }),
  component: RedefinirSenhaPage,
});

/**
 * Fluxo de recuperação do Supabase:
 * resetPasswordForEmail -> link no e-mail -> PASSWORD_RECOVERY
 * -> updateUser({password}) -> encerra sessão e retorna ao login.
 * Não pede nem armazena a senha antiga.
 */
function RedefinirSenhaPage() {
  const navigate = useNavigate();
  const [validando, setValidando] = useState(true);
  const [autorizado, setAutorizado] = useState(false);
  const [erroLink, setErroLink] = useState<string | null>(null);
  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    let ativo = true;
    // Links OTP tradicionais carregam type=recovery no fragmento.
    // Em PKCE, o código pode estar na query; a SDK valida a sessão.
    const url = new URL(window.location.href);
    const fragmento = new URLSearchParams(url.hash.replace(/^#/, ""));
    const parametros = url.searchParams;
    const callbackRecuperacao =
      fragmento.get("type") === "recovery" ||
      parametros.get("type") === "recovery" ||
      parametros.has("code");

    const { data: { subscription } } = supabase.auth.onAuthStateChange((evento, sessao) => {
      if (!ativo) return;
      if (evento === "PASSWORD_RECOVERY" && sessao) {
        setAutorizado(true);
        setErroLink(null);
        setValidando(false);
      }
      if (evento === "INITIAL_SESSION" && callbackRecuperacao && sessao) {
        setAutorizado(true);
        setErroLink(null);
        setValidando(false);
      }
    });

    const tokenHash = parametros.get("token_hash");
    if (parametros.get("type") === "recovery" && tokenHash) {
      void supabase.auth.verifyOtp({ type: "recovery", token_hash: tokenHash }).then(({ error }) => {
        if (!ativo) return;
        if (error) {
          setErroLink("Link inválido ou expirado. Solicite uma nova recuperação.");
          setValidando(false);
        } else {
          setAutorizado(true);
          setValidando(false);
        }
      });
    } else {
      void supabase.auth.getSession().then(({ data, error }) => {
        if (!ativo) return;
        if (error) setErroLink("Não foi possível validar o link de recuperação.");
        else if (callbackRecuperacao && data.session) setAutorizado(true);
        else setErroLink("Link inválido ou expirado. Solicite uma nova recuperação.");
        setValidando(false);
      });
    }

    return () => {
      ativo = false;
      subscription.unsubscribe();
    };
  }, []);

  const redefinir = async (evento: React.FormEvent) => {
    evento.preventDefault();
    if (!autorizado || salvando) return;
    if (senha.length < 8) {
      toast.error("A nova senha deve conter pelo menos 8 caracteres.");
      return;
    }
    if (senha !== confirmacao) {
      toast.error("A confirmação não corresponde à nova senha.");
      return;
    }

    setSalvando(true);
    const { error } = await supabase.auth.updateUser({ password: senha });
    if (error) {
      setSalvando(false);
      toast.error(error.message);
      return;
    }
    await supabase.auth.signOut();
    setSalvando(false);
    setSenha("");
    setConfirmacao("");
    toast.success("Senha atualizada. Entre novamente com suas credenciais.");
    void navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="relative isolate flex min-h-screen items-center justify-center overflow-hidden p-4">
      <LoginBackground />
      <Card className="relative z-10 w-full max-w-md border-white/40 bg-card/95 shadow-2xl">
        <CardHeader className="space-y-3 text-center">
          <div className="mx-auto rounded-lg bg-white p-2">
            <img src={logoAsset.url} alt="Prefeitura de Joinville" className="h-12 w-12 object-contain" />
          </div>
          <CardTitle className="flex items-center justify-center gap-2 text-xl">
            <KeyRound className="h-5 w-5" /> Redefinir senha
          </CardTitle>
          <CardDescription>Gestão de Convênios e Parcerias da SMS Joinville</CardDescription>
        </CardHeader>
        <CardContent>
          {validando ? (
            <p role="status" className="text-center text-sm text-muted-foreground">
              Validando seu link de recuperação…
            </p>
          ) : !autorizado ? (
            <div className="space-y-4 text-center">
              <p role="alert" className="text-sm text-destructive">
                {erroLink ?? "Não foi possível validar a recuperação de senha."}
              </p>
              <Link to="/auth" className="text-sm font-medium text-primary underline">
                Solicitar novo link na tela de login
              </Link>
            </div>
          ) : (
            <form onSubmit={redefinir} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="senha-nova">Nova senha</Label>
                <Input
                  id="senha-nova" type="password" minLength={8} autoComplete="new-password"
                  value={senha} onChange={(e) => setSenha(e.target.value)}
                  required disabled={salvando}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="senha-confirmar">Confirmar nova senha</Label>
                <Input
                  id="senha-confirmar" type="password" minLength={8} autoComplete="new-password"
                  value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)}
                  required disabled={salvando}
                />
              </div>
              <p className="flex items-start gap-2 text-xs text-muted-foreground">
                <LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Use pelo menos 8 caracteres. A nova senha substitui a anterior.
              </p>
              <Button className="w-full" type="submit" disabled={salvando}>
                {salvando ? "Atualizando senha…" : "Salvar nova senha"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
