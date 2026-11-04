import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { extrairDadosPortariaGm } from "@/lib/piso/portaria";
import { lerMemoria13PorCnes } from "@/lib/piso/memoria13";

const entrada = z.object({
  competenciaId: z.string().uuid(),
  arquivoId: z.string().uuid(),
});
type Categoria = "portaria_gm" | "afc13_cnes";

/** Autenticação, autorização e integridade são verificadas de novo no servidor.
 * Não aceitar texto/valores extraídos no navegador como fonte financeira.
 */
async function carregarArquivoOficial(
  data:{competenciaId:string;arquivoId:string},
  context:unknown,
  categoria:Categoria,
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin=supabaseAdmin as any;
  const userId=String((context as any).userId??"");
  if(!userId)throw new Error("Sessão não identificada.");

  const {data:roles,error:rolesErro}=await admin.from("user_roles")
    .select("role").eq("user_id",userId);
  if(rolesErro)throw rolesErro;
  if(!(roles??[]).some((r:any)=>["admin","acp","aco"].includes(r.role)))
    throw new Error("Você não tem permissão para processar documentos oficiais do Piso.");

  const {data:competencia,error:competenciaErro}=await admin.from("piso_competencias")
    .select("id,tipo_parcela,status,exercicio_referencia")
    .eq("id",data.competenciaId).single();
  if(competenciaErro||!competencia)throw new Error("Competência do Piso não localizada.");
  if(competencia.status==="encerrada")
    throw new Error("Competência encerrada. Reabra formalmente antes de reprocessar documentos oficiais.");
  if(categoria==="afc13_cnes"&&competencia.tipo_parcela!=="decimo_terceiro")
    throw new Error("A memória da 13ª só pode ser processada em parcela adicional.");

  const {data:arquivo,error:arquivoErro}=await admin.from("piso_arquivos")
    .select("*").eq("id",data.arquivoId)
    .eq("competencia_id",data.competenciaId).eq("categoria",categoria).single();
  if(arquivoErro||!arquivo)
    throw new Error("Arquivo original não localizado nesta competência/categoria.");

  if(Number(arquivo.tamanho??0)>30*1024*1024)
    throw new Error("Arquivo excede o limite de 30 MB para processamento seguro.");
  const {data:original,error:storageErro}=await admin.storage.from("piso-arquivos")
    .download(arquivo.storage_path);
  if(storageErro||!original)
    throw new Error("Não foi possível recuperar o documento original preservado no Storage.");
  const buffer=await original.arrayBuffer();
  if(buffer.byteLength>30*1024*1024)
    throw new Error("Arquivo excede o limite de 30 MB para processamento seguro.");
  const hash=await crypto.subtle.digest("SHA-256",buffer);
  const sha=Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,"0")).join("");
  if(!arquivo.sha256||sha!==String(arquivo.sha256).toLowerCase())
    throw new Error("A integridade SHA-256 da evidência oficial não confere.");
  const {data:perfil}=await admin.from("profiles").select("nome")
    .eq("id",userId).maybeSingle();
  return {admin,competencia,arquivo,buffer,userId,nome:perfil?.nome??"Usuário"};
}

/** Extrai texto do PDF PRESERVADO no servidor; não solicita novo upload.
 * Lê as páginas até encontrar o cabeçalho do ato e a linha do município.
 * A extração é de texto nativo; PDFs somente escaneados exigem conferência manual.
 */
async function lerPdfOficial(buffer:ArrayBuffer):Promise<string> {
  const pdfjs=await (await import("@/lib/pdf-server")).carregarPdfjsServidor();
  const tarefa=pdfjs.getDocument({
    data:new Uint8Array(buffer),
    useSystemFonts:true,
    disableFontFace:true,
    isEvalSupported:false,
  });
  const pdf=await tarefa.promise;
  let cabecalho="", trechoMunicipio="", primeiroTexto="";
  try {
    for(let n=1;n<=pdf.numPages;n++){
      const pagina=await pdf.getPage(n);
      const conteudo=await pagina.getTextContent();
      const texto=conteudo.items.map((x:any)=>"str" in x?x.str:"").join(" ");
      if (typeof pagina.cleanup === "function") pagina.cleanup();
      if(!primeiroTexto && texto.trim()) primeiroTexto=texto.slice(0,20000);
      if(!cabecalho && /PORTARIA\s+GM\/?MS\b/i.test(texto))
        cabecalho=texto.slice(0,20000);
      if(!trechoMunicipio && /420910\s+JOINVILLE\s+MUNICIPAL/i.test(texto))
        trechoMunicipio=texto;
      if(cabecalho&&trechoMunicipio)break;
    }
  } finally {
    // pdf.js possui versões/ambientes em que o documento não expõe destroy().
    // A tarefa de carregamento é o recurso correto para encerrar a sessão.
    if (typeof tarefa.destroy === "function") await tarefa.destroy();
  }
  // Não confundir texto existente com ausência das expressões regulares esperadas.
  return [cabecalho || primeiroTexto,trechoMunicipio].filter(Boolean).join("\n");
}

export const processarPortariaPisoServidor=createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .validator((data:unknown)=>entrada.parse(data))
  .handler(async ({data,context})=>{
    const {admin,competencia,arquivo,buffer,userId,nome}=
      await carregarArquivoOficial(data,context,"portaria_gm");
    if(!String(arquivo.nome_original??"").toLowerCase().endsWith(".pdf")&&
       !String(arquivo.mime??"").toLowerCase().includes("pdf"))
      throw new Error("A Portaria GM/MS deve ser anexada em PDF.");
    const texto=await lerPdfOficial(buffer);
    if(!texto.trim())
      throw new Error(`O arquivo ${arquivo.nome_original} não apresentou texto extraível no processamento. Confira se o PDF salvo é pesquisável ou use a conferência manual.`);
    // PDFs impressos a partir do DOU podem conter fontes Type3 sem mapa Unicode.
    // Neles, há uma camada de texto, mas os caracteres retornados são ilegíveis.
    // Não tratar isso como falta de número da portaria nem tentar deduzir valores.
    const caracteresControle = [...texto].filter(ch => /[\u0000-\u0008\u000E-\u001F]/.test(ch)).length;
    const textoCorrompido = caracteresControle > texto.length * 0.05 ||
      (!/\b(?:PORTARIA|MINIST[EÉ]RIO|SA[UÚ]DE|MUNICIPAL|JOINVILLE)\b/i.test(texto) &&
        /[^\p{L}\p{N}\s.,:;/$%º°ª()\-]/u.test(texto));
    if (textoCorrompido)
      throw new Error(`O PDF ${arquivo.nome_original} possui texto com codificação de fontes incompatível (caracteres ilegíveis). Utilize a versão pesquisável do DOU ou confira manualmente os valores; o arquivo original permanece preservado.`);
    const dados=extrairDadosPortariaGm(texto);
    if(!dados.numero)
      throw new Error(`O PDF ${arquivo.nome_original} contém texto, mas o número da Portaria GM/MS não foi identificado. Confira o documento ou registre os dados manualmente.`);
    const ementa=texto.slice(0,2500)
      .normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
    const parcela13= /decima\s+terceira\s+parcela|13[aª]?\s+parcela|decimo\s+terceiro/.test(ementa);
    if(competencia.tipo_parcela==="decimo_terceiro"&&!parcela13)
      throw new Error("A Portaria não identifica expressamente a 13ª parcela na ementa.");
    if(competencia.tipo_parcela!=="decimo_terceiro"&&parcela13)
      throw new Error("A publicação é da 13ª parcela e não pode preencher uma competência mensal.");
    if(!dados.joinville_localizada)
      throw new Error(`O PDF ${arquivo.nome_original} foi lido, mas não foi possível identificar os quatro valores da linha financeira de Joinville. É possível conferi-los manualmente.`);

    const patch=Object.fromEntries(Object.entries({
      portaria_gm_numero:dados.numero,
      portaria_gm_data_ato:dados.data_ato,
      portaria_gm_data_publicacao:dados.data_publicacao,
      portaria_gm_edicao:dados.edicao,
      portaria_gm_secao:dados.secao,
      portaria_gm_pagina:dados.pagina,
      valor_homologado:dados.valor_homologado,
      desconto_saldo:dados.desconto_saldo,
      acerto_contas:dados.acerto_contas,
      valor_transferido:dados.valor_transferido,
    }).filter(([,valor])=>valor!=null));
    const {error}=await admin.from("piso_competencias")
      .update(patch).eq("id",data.competenciaId);
    if(error)throw error;

    const {error:logErro}=await admin.from("historico_logs").insert({
      piso_competencia_id:data.competenciaId,
      usuario_id:userId,usuario_nome:nome,
      acao:"Piso · Portaria GM/MS processada no servidor",
      detalhes:{
        arquivo_id:arquivo.id,sha256:arquivo.sha256,portaria:dados.numero,
        valor_homologado:dados.valor_homologado,
        valor_transferido:dados.valor_transferido,origem_calculo:"server_fn",
      },
    });
    if(logErro)throw new Error("Portaria extraída e salva, mas falhou o registro do histórico: "+logErro.message);
    return {tipo:"portaria_gm",dados};
  });

export const processarMemoria13PisoServidor=createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .validator((data:unknown)=>entrada.parse(data))
  .handler(async ({data,context})=>{
    const {admin,arquivo,buffer,userId}=
      await carregarArquivoOficial(data,context,"afc13_cnes");
    const linhas=lerMemoria13PorCnes(buffer);
    // A RPC existente valida CNES, datas, instituições e grava valores
    // numa transação, sem confiar em valores vindos do navegador.
    const {data:total,error}=await admin.rpc("piso_aplicar_memoria_13_cnes",{
      p_competencia:data.competenciaId,
      p_arquivo:arquivo.id,
      p_linhas:linhas,
      p_autor:userId,
    });
    if(error)throw error;
    return {
      tipo:"afc13_cnes",
      audit:{linhas:linhas.length,total_complemento:Number(total??0),erros:0,alertas:0},
      conciliacao:{criticas:0,alertas:0},
    };
  });

/** Exceção controlada: lançamento manual dos quatro valores oficiais da Portaria.
 * Os demais resultados derivados continuam protegidos pelo trigger do banco.
 */
const entradaValorPortaria = z.object({
  competenciaId: z.string().uuid(),
  campo: z.enum(["valor_homologado", "desconto_saldo", "acerto_contas", "valor_transferido"]),
  valor: z.number().finite().min(0).max(1_000_000_000_000).nullable(),
});

export const salvarValorPortariaPisoServidor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => entradaValorPortaria.parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const userId = String((context as any).userId ?? "");
    if (!userId) throw new Error("Sessão não identificada.");
    const { data: roles, error: rolesError } = await admin.from("user_roles")
      .select("role").eq("user_id", userId);
    if (rolesError) throw rolesError;
    if (!(roles ?? []).some((r: any) => ["admin", "acp"].includes(r.role)))
      throw new Error("Somente administradores e ACP podem informar valores oficiais manualmente.");
    const { data: competencia, error: buscaError } = await admin.from("piso_competencias")
      .select("id,status,portaria_gm_numero,portaria_gm_url_dou,valor_homologado,desconto_saldo,acerto_contas,valor_transferido")
      .eq("id", data.competenciaId).single();
    if (buscaError || !competencia) throw new Error("Competência não encontrada.");
    if (competencia.status === "encerrada")
      throw new Error("Competência encerrada. Reabra formalmente para alterar os valores.");
    if (data.valor !== null && (!competencia.portaria_gm_numero || !/^https:\/\/(?:www\.)?in\.gov\.br\//i.test(competencia.portaria_gm_url_dou ?? "")))
      throw new Error("Informe primeiro o número da Portaria e o link oficial do DOU.");
    const anterior = competencia[data.campo];
    const { data: atualizada, error: atualizarError } = await admin.from("piso_competencias")
      .update({ [data.campo]: data.valor }).eq("id", data.competenciaId)
      .select("id").single();
    if (atualizarError || !atualizada) throw atualizarError ?? new Error("Atualização não confirmada.");
    const { data: perfil } = await admin.from("profiles").select("nome").eq("id",userId).maybeSingle();
    const { error: logError } = await admin.from("historico_logs").insert({
      piso_competencia_id: data.competenciaId,
      usuario_id: userId, usuario_nome: perfil?.nome ?? "Usuário",
      acao: "Piso · Valor da Portaria GM/MS informado manualmente",
      detalhes: {campo: data.campo, anterior, novo: data.valor,
        portaria: competencia.portaria_gm_numero,
        url_dou: competencia.portaria_gm_url_dou, origem_calculo: "manual_conferencia"},
    });
    if (logError) throw new Error("Valor salvo, mas não foi possível registrar o histórico: " + logError.message);
    return { campo: data.campo, valor: data.valor };
  });

/** Apaga somente os dados da seção Portaria GM/MS, preservando PDFs, InvestSUS e histórico. */
const camposPortariaPiso = [
  "portaria_gm_numero", "portaria_gm_data_ato", "portaria_gm_data_publicacao",
  "portaria_gm_edicao", "portaria_gm_secao", "portaria_gm_pagina",
  "portaria_gm_url_dou", "valor_homologado", "desconto_saldo",
  "acerto_contas", "valor_transferido", "desconto_identificacao",
  "acerto_identificacao",
] as const;

export const limparDadosPortariaPisoServidor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ competenciaId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const userId = String((context as any).userId ?? "");
    if (!userId) throw new Error("Sessão não identificada.");
    const { data: roles, error: roleError } = await admin.from("user_roles")
      .select("role").eq("user_id", userId);
    if (roleError) throw roleError;
    if (!(roles ?? []).some((r: any) => ["admin", "acp"].includes(r.role)))
      throw new Error("Somente administradores e ACP podem limpar dados oficiais da Portaria.");
    const { data: competencia, error: compError } = await admin.from("piso_competencias")
      .select(["id", "status", ...camposPortariaPiso].join(","))
      .eq("id", data.competenciaId).single();
    if (compError || !competencia) throw new Error("Competência não encontrada.");
    if (competencia.status === "encerrada")
      throw new Error("Competência encerrada. Reabra formalmente antes de limpar dados.");
    const anterior = Object.fromEntries(camposPortariaPiso.map(campo => [campo, competencia[campo]]));
    const patch = Object.fromEntries(camposPortariaPiso.map(campo => [campo, null]));
    const { data: atualizado, error: updateError } = await admin.from("piso_competencias")
      .update(patch).eq("id", data.competenciaId).neq("status", "encerrada")
      .select("id").maybeSingle();
    if (updateError || !atualizado) throw updateError ?? new Error("A competência não foi atualizada. Recarregue a página.");
    const { data: perfil } = await admin.from("profiles").select("nome").eq("id", userId).maybeSingle();
    const { error: logError } = await admin.from("historico_logs").insert({
      piso_competencia_id: data.competenciaId,
      usuario_id: userId,
      usuario_nome: perfil?.nome ?? "Usuário",
      acao: "Piso · Dados da Portaria GM/MS limpos",
      detalhes: { anterior, campos_limpos: [...camposPortariaPiso], origem_calculo: "limpeza_manual",
        arquivos_preservados: true, investsus_preservado: true },
    });
    if (logError) throw new Error("Dados limpos, mas houve falha ao registrar o histórico: " + logError.message);
    return { camposLimpos: [...camposPortariaPiso] };
  });
