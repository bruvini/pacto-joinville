import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listLancamentos from "./tools/list-lancamentos";
import getLancamento from "./tools/get-lancamento";
import listPrestadores from "./tools/list-prestadores";
import listConvenios from "./tools/list-convenios";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "gestao-empenhos-mcp",
  title: "Gestão de Convênios SMS Joinville",
  version: "0.1.0",
  instructions:
    "Ferramentas para consultar convênios, prestadores e lançamentos de pagamento (empenhos/atestos/anulações) da Secretaria Municipal de Saúde de Joinville. Todas as consultas respeitam o perfil (ACP/ACO/Admin) do usuário autenticado.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listLancamentos, getLancamento, listPrestadores, listConvenios],
});
