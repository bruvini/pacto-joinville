import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Clock, LogOut } from "lucide-react";
import logoAsset from "@/assets/joinville-logo.png.asset.json";

export const Route = createFileRoute("/pendente")({
  head: () => ({ meta: [{ title: "Acesso pendente" }] }),
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id);
    // Já aprovado? Vai para o app.
    if (roles && roles.length > 0) throw redirect({ to: "/dashboard" });
  },
  component: PendentePage,
});

function PendentePage() {
  const nav = useNavigate();
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary to-acp p-4">
      <Card className="w-full max-w-md shadow-2xl text-center">
        <CardHeader>
          <div className="mx-auto bg-white rounded-lg p-2 w-fit mb-3">
            <img src={logoAsset.url} alt="Prefeitura de Joinville" className="h-14 w-14 object-contain" />
          </div>
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-warning/20">
            <Clock className="h-6 w-6 text-warning-foreground" />
          </div>
          <CardTitle className="text-lg">Acesso pendente de aprovação</CardTitle>
          <CardDescription>
            Sua conta foi criada com sucesso. Um administrador precisa liberar seu acesso e definir seu papel (ACP ou UFI)
            antes de você usar o sistema. Você será avisado quando for aprovado.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            className="w-full"
            onClick={async () => { await supabase.auth.signOut(); nav({ to: "/auth" }); }}
          >
            <LogOut className="h-4 w-4 mr-2" />Sair
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
