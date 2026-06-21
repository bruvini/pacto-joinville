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
import { ShieldCheck, ScrollText, BarChart3 } from "lucide-react";

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
        onChange={(e) => onChange(e.target.value.replace(/[@\s]/g, "").toLowerCase())}
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
    nav({ to: "/dashboard" });
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
    <div className="relative min-h-screen w-full overflow-hidden bg-[#003866] lg:grid lg:grid-cols-2">
      {/* Textura de pontos (CSS puro, sem imagens) */}
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{ backgroundImage: "radial-gradient(rgba(255,255,255,0.07) 1px, transparent 1px)", backgroundSize: "22px 22px" }}
      />
      {/* Brilho diagonal institucional */}
      <div className="pointer-events-none absolute inset-0" style={{ background: "linear-gradient(135deg, rgba(0,30,60,0.65), transparent 45%, rgba(51,153,204,0.28))" }} />
      {/* Formas translúcidas decorativas */}
      <div className="pointer-events-none absolute -top-40 -left-40 h-[28rem] w-[28rem] rounded-full" style={{ background: "radial-gradient(circle, rgba(51,153,204,0.35), transparent 70%)" }} />
      <div className="pointer-events-none absolute -bottom-48 right-[-6rem] h-[34rem] w-[34rem] rounded-full" style={{ background: "radial-gradient(circle, rgba(0,86,150,0.45), transparent 70%)" }} />

      {/* ===== Painel institucional (desktop) ===== */}
      <div className="relative hidden lg:flex flex-col justify-between p-12 text-white">
        <div className="flex items-center gap-3">
          <div className="bg-white rounded-lg p-1.5"><img src={logoAsset.url} alt="Prefeitura de Joinville" className="h-10 w-10 object-contain" /></div>
          <div className="leading-tight">
            <div className="text-xs uppercase tracking-widest text-white/70">Prefeitura de Joinville</div>
            <div className="font-bold">Secretaria Municipal de Saúde</div>
          </div>
        </div>

        <div className="max-w-md">
          <div className="h-1 w-16 bg-[#8FC23E] rounded-full mb-6" />
          <h1 className="text-4xl font-bold leading-tight">Gestão e Auditoria<br />de Empenhos</h1>
          <p className="mt-4 text-white/80 text-lg">Convênios e Parcerias com confiabilidade, rastreabilidade e controle — do empenho à prestação de contas.</p>
          <ul className="mt-8 space-y-4">
            <Pilar icon={ShieldCheck} titulo="Seguro e em conformidade" desc="Controle de acesso por papel, LGPD e ISO 27001." />
            <Pilar icon={ScrollText} titulo="Auditoria imutável" desc="Cada ação registrada, sem rasura." />
            <Pilar icon={BarChart3} titulo="Decisão por dados" desc="Painel de BI com alertas em tempo real." />
          </ul>
        </div>

        <div className="text-xs text-white/50">© {new Date().getFullYear()} SMS Joinville · Área de Convênios e Parcerias</div>
      </div>

      {/* ===== Formulário ===== */}
      <div className="relative flex items-center justify-center p-4 min-h-screen lg:min-h-0 lg:bg-background">
      <Card className="w-full max-w-md shadow-2xl border-white/10">
        <CardHeader className="text-center">
          <div className="mx-auto bg-white rounded-lg p-2 w-fit mb-3 lg:hidden">
            <img src={logoAsset.url} alt="Prefeitura de Joinville" className="h-16 w-16 object-contain" />
          </div>
          <CardTitle className="text-xl">Gestão de Convênios e Parcerias</CardTitle>
          <CardDescription>Secretaria Municipal de Saúde — Joinville</CardDescription>
        </CardHeader>
        <CardContent>
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
              </form>
            </TabsContent>
            <TabsContent value="signup">
              <form onSubmit={onSignup} className="space-y-3 mt-4">
                <div><Label>Nome completo</Label><Input value={nome} onChange={(e) => setNome(e.target.value)} required /></div>
                <div><Label>E-mail institucional</Label><EmailInstitucional value={local} onChange={setLocal} /></div>
                <div><Label>Senha</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} /></div>
                <Button className="w-full" disabled={loading}>Criar conta</Button>
                <p className="text-xs text-muted-foreground">
                  Após o cadastro, seu acesso fica <b>pendente</b> até um administrador liberar e definir seu papel (ACP ou ACO).
                  O primeiro usuário do sistema vira Admin automaticamente.
                </p>
              </form>
            </TabsContent>
          </Tabs>
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
