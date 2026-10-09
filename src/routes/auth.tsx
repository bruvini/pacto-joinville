import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import logoAsset from "@/assets/joinville-logo.png.asset.json";
import { registrarAcesso } from "@/lib/acesso";
import { ClipboardList, FileText, ChartNoAxesCombined } from "lucide-react";
import { LoginBackground } from "@/components/auth/LoginBackground";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Entrar — Gestão de Convênios SMS Joinville" }] }),
  component: AuthPage,
});

const DOMINIO = "@joinville.sc.gov.br";

/** Campo de e-mail institucional: usuário digita só a parte antes do @. */
function EmailInstitucional({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-stretch rounded-md border border-input overflow-hidden focus-within:ring-2 focus-within:ring-ring">
      <input
        value={value}
        onChange={(e) => {
          const digitado = e.target.value.trim().toLowerCase();
          // Permite colar o endereço institucional completo sem duplicar o domínio.
          const usuario = digitado.includes("@")
            ? digitado.split("@")[0]
            : digitado;
          onChange(usuario.replace(/\s/g, ""));
        }}
        placeholder="nome.sobrenome"
        autoComplete="username"
        className="flex-1 min-w-0 bg-transparent px-3 py-2 text-sm outline-none"
        required
      />
      <span className="flex items-center bg-muted px-2 text-sm text-muted-foreground select-none">{DOMINIO}</span>
    </div>
  );
}

function AuthPage() {
  const nav = useNavigate();
  const [loading, setLoading] = useState(false);
  const [local, setLocal] = useState(""); // parte do e-mail antes do @
  const [password, setPassword] = useState("");
  const [nome, setNome] = useState("");
  const [recuperando, setRecuperando] = useState(false);
  const [linkEnviado, setLinkEnviado] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) nav({ to: "/dashboard" });
    });
  }, [nav]);

  const emailCompleto = () => `${local}${DOMINIO}`;
  const validarLocal = () => {
    if (!local) { toast.error("Informe o e-mail institucional."); return false; }
    return true;
  };

  const onLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validarLocal()) return;
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: emailCompleto(), password });
    setLoading(false);
    if (error) return toast.error(error.message);
    void registrarAcesso("login");
    nav({ to: "/dashboard" });
  };

  const solicitarRecuperacao = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validarLocal()) return;
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(emailCompleto(), {
      redirectTo: `${window.location.origin}/redefinir-senha`,
    });
    setLoading(false);
    if (error) {
      toast.error("Não foi possível solicitar a recuperação: " + error.message);
      return;
    }
    // Mensagem neutra, não revela se o e-mail está cadastrado.
    setLinkEnviado(true);
  };

  const onSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validarLocal()) return;
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email: emailCompleto(),
      password,
      options: { emailRedirectTo: window.location.origin, data: { nome } },
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Conta criada! Seu acesso ficará pendente até a aprovação de um administrador.");
  };

  return (
    <div className="relative isolate min-h-screen w-full overflow-hidden lg:grid lg:grid-cols-2">
      <LoginBackground />

      {/* ===== Painel institucional (desktop) ===== */}
      <div className="relative z-10 hidden lg:flex flex-col justify-between p-12 text-white">
        <div className="flex items-center gap-3">
          <div className="bg-white rounded-lg p-1.5"><img src={logoAsset.url} alt="Prefeitura de Joinville" className="h-10 w-10 object-contain" /></div>
          <div className="leading-tight">
            <div className="text-xs uppercase tracking-widest text-white/70">Prefeitura de Joinville</div>
            <div className="font-bold">Secretaria Municipal de Saúde</div>
          </div>
        </div>

        <div className="max-w-md">
          <div className="h-1 w-16 bg-[#8FC23E] rounded-full mb-6" />
          <h1 className="text-4xl font-bold leading-tight">Gestão de recursos<br />e parcerias em saúde</h1>
          <p className="mt-4 text-white/80 text-lg">Acompanhe convênios, PVH, Piso da Enfermagem e dietas CACON em um só lugar.</p>
          <ul className="mt-8 space-y-4">
            <Pilar icon={ClipboardList} titulo="Execução financeira" desc="Empenhos, repasses e pagamentos por competência." />
            <Pilar icon={FileText} titulo="Documentos e processos" desc="Assinaturas, documentos SEI e histórico de alterações." />
            <Pilar icon={ChartNoAxesCombined} titulo="Conferência e indicadores" desc="Prestações de contas, prazos e painéis de gestão." />
          </ul>
        </div>

        <div className="text-xs text-white/50">© {new Date().getFullYear()} SMS Joinville · Área de Convênios e Parcerias</div>
      </div>

      {/* ===== Formulário ===== */}
      <div className="relative z-10 flex items-center justify-center p-4 min-h-screen lg:min-h-0">
      <Card className="w-full max-w-md shadow-2xl border-white/40 bg-card/95">
        <CardHeader className="text-center">
          <div className="mx-auto bg-white rounded-lg p-2 w-fit mb-3 lg:hidden">
            <img src={logoAsset.url} alt="Prefeitura de Joinville" className="h-16 w-16 object-contain" />
          </div>
          <CardTitle className="text-xl">Gestão de Convênios e Parcerias</CardTitle>
          <CardDescription>Secretaria Municipal de Saúde de Joinville</CardDescription>
        </CardHeader>
        <CardContent>
          {recuperando ? (
            <div className="space-y-4">
              {linkEnviado ? (
                <p role="status" className="rounded-md border border-primary/20 bg-primary/5 p-3 text-sm">
                  Se o e-mail estiver cadastrado, enviaremos um link para redefinir a senha. Verifique sua caixa de entrada e spam.
                </p>
              ) : (
                <form onSubmit={solicitarRecuperacao} className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Informe seu e-mail institucional para receber um link de recuperação de senha.
                  </p>
                  <div className="space-y-1">
                    <Label>E-mail institucional</Label>
                    <EmailInstitucional value={local} onChange={setLocal} />
                  </div>
                  <Button className="w-full" type="submit" disabled={loading}>
                    {loading ? "Enviando…" : "Enviar link de recuperação"}
                  </Button>
                </form>
              )}
              <Button
                type="button" variant="ghost" className="w-full"
                onClick={() => { setRecuperando(false); setLinkEnviado(false); }}
              >
                Voltar para entrar
              </Button>
            </div>
          ) : (
          <Tabs defaultValue="login">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Entrar</TabsTrigger>
              <TabsTrigger value="signup">Cadastrar</TabsTrigger>
            </TabsList>
            <TabsContent value="login">
              <form onSubmit={onLogin} className="space-y-3 mt-4">
                <div><Label>E-mail institucional</Label><EmailInstitucional value={local} onChange={setLocal} /></div>
                <div><Label>Senha</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
                <Button className="w-full" disabled={loading}>Entrar</Button>
                <button type="button" className="block w-full text-right text-xs font-medium text-primary hover:underline" onClick={() => { setRecuperando(true); setLinkEnviado(false); }}>Esqueci minha senha</button>
              </form>
            </TabsContent>
            <TabsContent value="signup">
              <form onSubmit={onSignup} className="space-y-3 mt-4">
                <div><Label>Nome completo</Label><Input value={nome} onChange={(e) => setNome(e.target.value)} required /></div>
                <div><Label>E-mail institucional</Label><EmailInstitucional value={local} onChange={setLocal} /></div>
                <div><Label>Senha</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} /></div>
                <Button className="w-full" disabled={loading}>Criar conta</Button>
                <p className="text-xs text-muted-foreground">
                  Após o cadastro, seu acesso fica <b>pendente</b> até um administrador liberar e definir seu <b>papel e setor</b> (ACP, UFI ou APC) na tela de Gestão de Usuários.
                  O primeiro usuário do sistema vira Admin automaticamente.
                </p>
              </form>
            </TabsContent>
          </Tabs>
          )}
        </CardContent>
      </Card>
      </div>
    </div>
  );
}

function Pilar({ icon: Icon, titulo, desc }: { icon: any; titulo: string; desc: string }) {
  return (
    <li className="flex items-start gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/15">
        <Icon className="h-5 w-5 text-[#8FC23E]" />
      </div>
      <div>
        <div className="font-semibold">{titulo}</div>
        <div className="text-sm text-white/70">{desc}</div>
      </div>
    </li>
  );
}
