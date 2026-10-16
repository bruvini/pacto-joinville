/** Ausência de CNES em fonte OPCIONAL não é erro. Reúne abas repetidas
 * sem esconder avisos efetivos de integridade/validação. */
export function agruparAvisosPublicacao(avisos:string[]){
 const ausencias=new Map<string,Set<string>>();
 const outros:string[]=[];
 const padrao=/^(.+): Aba (.+): CNES ([0-9]{7}) não aparece entre os prestadores publicados; nenhum valor de outro hospital será utilizado\.$/;
 for(const aviso of avisos){
  const m=aviso.match(padrao);
  if(!m){outros.push(aviso);continue;}
  const chave=m[1]+"|"+m[3];
  if(!ausencias.has(chave))ausencias.set(chave,new Set());
  ausencias.get(chave)!.add(m[2]);
 }
 return {outros,
  ausencias:[...ausencias].map(([chave,abas])=>{
   const pos=chave.lastIndexOf("|");
   return {fonte:chave.slice(0,pos),cnes:chave.slice(pos+1),
    abas:[...abas]};
  })};
}
