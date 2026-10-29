import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const ler = <T,>(dados: T | null, error: {message:string} | null): T => {
  if (error) throw new Error(error.message);
  return dados as T;
};

export function useCatalogosEmendas() {
  const prestadores = useQuery({
    queryKey: ["emendas","prestadores"],
    queryFn: async () => {
      const r=await supabase.from("prestadores").select("id,nome_instituicao,status").order("nome_instituicao");
      return ler(r.data ?? [],r.error);
    },
    staleTime: 60_000,
  });
  const convenios = useQuery({
    queryKey: ["emendas","convenios"],
    queryFn: async () => {
      const r=await supabase.from("convenios").select("id,prestador_id,objeto,link_processo_sei").order("created_at",{ascending:false});
      return ler(r.data ?? [],r.error);
    },
    staleTime: 60_000,
  });
  const termos = useQuery({
    queryKey: ["emendas","termos"],
    queryFn: async () => {
      const r=await supabase.from("termos_aditivos").select("id,convenio_id,identificador,objeto,created_at").order("created_at",{ascending:false});
      return ler(r.data ?? [],r.error);
    },
    staleTime: 60_000,
  });
  return {
    prestadores: prestadores.data ?? [],
    convenios: convenios.data ?? [],
    termos: termos.data ?? [],
    loading: prestadores.isPending || convenios.isPending || termos.isPending,
    error: prestadores.error || convenios.error || termos.error,
  };
}
export function useListaEmendas() {
  return useQuery({
    queryKey: ["emendas","lista"],
    queryFn: async () => {
      const [cadastro,resumo]=await Promise.all([
        supabase.from("emendas").select("*").is("excluida_em",null).order("exercicio",{ascending:false}).order("created_at",{ascending:false}),
        supabase.from("emendas_resumo").select("*"),
      ]);
      return {
        cadastro:ler(cadastro.data??[],cadastro.error),
        resumo:ler(resumo.data??[],resumo.error),
      };
    },
  });
}
export function useDetalheEmenda(id:string) {
  return useQuery({
    queryKey:["emendas","detalhe",id],
    enabled:!!id,
    queryFn:async()=>{
      const [emenda,documentos,fontes,ajustes,historico,resumo]=await Promise.all([
        supabase.from("emendas").select("*").eq("id",id).is("excluida_em",null).maybeSingle(),
        supabase.from("emenda_documentos").select("*").eq("emenda_id",id).order("created_at",{ascending:false}),
        supabase.from("emenda_fontes").select("*").eq("emenda_id",id).order("created_at",{ascending:false}),
        supabase.from("emenda_ajustes_valor").select("*").eq("emenda_id",id).order("registrado_em",{ascending:false}),
        supabase.from("emenda_historico").select("*").eq("emenda_id",id).order("ocorrido_em",{ascending:false}).limit(150),
        supabase.from("emendas_resumo").select("*").eq("id",id).maybeSingle(),
      ]);
      return {
        emenda:ler(emenda.data,emenda.error),
        documentos:ler(documentos.data??[],documentos.error),
        fontes:ler(fontes.data??[],fontes.error),
        ajustes:ler(ajustes.data??[],ajustes.error),
        historico:ler(historico.data??[],historico.error),
        resumo:ler(resumo.data,resumo.error),
      };
    },
  });
}
export const invalidarEmendas = async (qc:import("@tanstack/react-query").QueryClient) =>
  qc.invalidateQueries({queryKey:["emendas"]});
