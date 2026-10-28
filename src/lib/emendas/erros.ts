/** Tradução de erros de persistência do Supabase/PostgREST.
 * Nunca imprime JWT, sessão, payload completo ou dados pessoais em console.
 */
export type ErroDeCadastro = {
  codigo: string | null;
  mensagem: string;
  diagnostico: string;
};
type ErroPostgrest = { code?: unknown; message?: unknown; hint?: unknown; details?: unknown };
export function explicarErroCadastro(erro: unknown): ErroDeCadastro {
  const e: ErroPostgrest = typeof erro === "object" && erro !== null
    ? erro as ErroPostgrest : {message:String(erro)};
  const codigo = typeof e.code === "string" ? e.code : null;
  const mensagemBanco = typeof e.message === "string" ? e.message : "Erro ao registrar a emenda.";
  const dica = typeof e.hint === "string" ? e.hint : null;
  const comuns:Record<string,string> = {
    "42703":"Uma função ou gatilho SQL acessou um campo inexistente. Verifique a migration no banco conectado ao aplicativo.",
    "23502":"O banco exige um campo que não foi recebido. Confira a mensagem com o nome da coluna.",
    "23503":"Um vínculo selecionado não existe ou não corresponde à instituição/convênio.",
    "23505":"Já existe uma emenda com esta combinação de número e exercício.",
    "23514":"Um valor, documento SEI ou vínculo não atende a uma regra do banco.",
    "22P02":"Há um identificador inválido em um campo de referência (por exemplo, ID de instituição ou termo).",
    "PGRST204":"A API ainda não reconhece uma das colunas enviadas. Verifique se a migration da Fase 2 foi aplicada neste banco e atualize o cache do esquema.",
    "PGRST200":"A API não encontrou uma relação esperada. Confira as migrations do módulo.",
    "42501":"Seu perfil não possui autorização para gravar este registro. Verifique as permissões ACP/Admin.",
    "P0001":"Uma validação do banco impediu o registro. Confira a mensagem retornada.",
  };
  return {
    codigo,
    mensagem: comuns[codigo??""] ?? "O Supabase recusou o cadastro. Consulte a mensagem técnica abaixo para identificar o motivo.",
    diagnostico: [codigo ? `Código ${codigo}` : null,mensagemBanco,dica].filter(Boolean).join(" · "),
  };
}
