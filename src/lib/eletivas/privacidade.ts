/** Redação conservadora de eventual dado nominativo: o Encontro de Contas
 * guarda AIH/procedimento/quantia e não publica dados identificáveis dos pacientes.
 * Este filtro é defesa em profundidade, não substitui validação do importador. */
const campoPessoal=/^(nome_?paciente|paciente|cpf|cns|cartao_?sus|nome_?mae|data_?nascimento|endereco_?paciente|telefone_?paciente|prontuario_?paciente)$/i;
const redigir=(t:string)=>t
 .replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g,"[CPF oculto]")
 .replace(/\b(?:CPF\s*:?\s*)\d{11}\b/gi,"CPF [oculto]")
 .replace(/\b(?:CNS\s*:?\s*)\d{15}\b/gi,"CNS [oculto]");
export function sanitizarEvidenciaEC(dado:unknown,nivel=0):unknown{
 if(nivel>12)return "[Estrutura omitida por profundidade]";
 if(typeof dado==="string")return redigir(dado);
 if(Array.isArray(dado))return dado.slice(0,2000).map(v=>sanitizarEvidenciaEC(v,nivel+1));
 if(!dado||typeof dado!=="object")return dado;
 return Object.fromEntries(Object.entries(dado as Record<string,unknown>)
  .filter(([chave])=>!campoPessoal.test(chave))
  .map(([k,v])=>[k,sanitizarEvidenciaEC(v,nivel+1)]));
}
