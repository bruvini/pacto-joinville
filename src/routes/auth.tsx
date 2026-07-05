import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import logoAsset from "@/assets/joinville-logo.png.asset.json";
import { SETORES } from "@/lib/setores";
import { registrarAcesso } from "@/lib/acesso";
import { ShieldCheck, ScrollText, BarChart3 } from "lucide-react";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Entrar — Gestão de Convênios SMS Joinville" }] }),
  validateSearch: (s: Record<string, unknown>) => ({
    next: typeof s.next === "string" && s.next.startsWith("/") && !s.next.startsWith("//") ? s.next : "",
  }),
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
  const [setor, setSetor] = useState("");

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

  const onSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validarLocal()) return;
    if (!setor) return toast.error("Informe o setor em que trabalha.");
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email: emailCompleto(),
      password,
      options: { emailRedirectTo: window.location.origin, data: { nome, setor } },
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Conta criada! Seu acesso ficará pendente até a aprovação de um administrador.");
  };

  return (
    <div
      className="relative min-h-screen w-full overflow-hidden lg:grid lg:grid-cols-2"
      style={{ background: "linear-gradient(115deg, #002747 0%, #003866 28%, #15558a 52%, #5f93bd 72%, var(--background) 100%)" }}
    >
      {/* Malha de elementos conectados (SVG leve, sem imagens) */}
      <Constelacao />
      {/* Textura de pontos sutil */}
      <div
        className="pointer-events-none absolute inset-0 opacity-50"
        style={{ backgroundImage: "radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px)", backgroundSize: "24px 24px" }}
      />
      {/* Formas translúcidas para profundidade */}
      <div className="pointer-events-none absolute -top-40 -left-40 h-[30rem] w-[30rem] rounded-full" style={{ background: "radial-gradient(circle, rgba(51,153,204,0.30), transparent 70%)" }} />
      <div className="pointer-events-none absolute top-1/3 left-1/3 h-[26rem] w-[26rem] rounded-full" style={{ background: "radial-gradient(circle, rgba(143,194,62,0.10), transparent 70%)" }} />

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
      <div className="relative flex items-center justify-center p-4 min-h-screen lg:min-h-0">
      <Card className="w-full max-w-md shadow-2xl border-white/40 bg-card/95">
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
                <div>
                  <Label>Setor em que trabalha</Label>
                  <Select value={setor} onValueChange={setSetor}>
                    <SelectTrigger><SelectValue placeholder="Selecione o setor" /></SelectTrigger>
                    <SelectContent>{SETORES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground mt-1">O e-mail e o setor serão usados para as notificações do sistema.</p>
                </div>
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

/** Malha de nós conectados — SVG estático e leve (sem JS, sem imagens). */
function Constelacao() {
  const nodes = [
    [8, 18], [22, 10], [16, 40], [34, 28], [30, 55], [12, 70], [46, 14],
    [48, 44], [40, 72], [62, 30], [58, 60], [72, 18], [70, 48], [26, 86], [54, 88],
  ];
  const links = [
    [0, 1], [0, 2], [1, 3], [2, 3], [3, 4], [2, 5], [4, 5], [1, 6], [3, 7],
    [6, 7], [4, 8], [7, 8], [6, 9], [7, 10], [9, 10], [9, 11], [10, 12], [11, 12], [5, 13], [8, 14], [13, 14],
  ];
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-40" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <g stroke="rgba(255,255,255,0.22)" strokeWidth="0.18">
        {links.map(([a, b], i) => (
          <line key={i} x1={nodes[a][0]} y1={nodes[a][1]} x2={nodes[b][0]} y2={nodes[b][1]} />
        ))}
      </g>
      {nodes.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i % 4 === 0 ? 0.85 : 0.5} fill={i % 5 === 0 ? "#8FC23E" : "rgba(255,255,255,0.65)"} />
      ))}
    </svg>
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
