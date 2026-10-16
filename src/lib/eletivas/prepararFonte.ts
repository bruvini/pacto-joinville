import {identificarFonteBytes} from "./autoRoteamento";
import {validarEstruturaFonte} from "./validarEstruturaFonte";
import type {FonteId} from "./fontes";

/** Fontes técnicas são validadas antes do upload.
 * Documentos SEI são lançados na Etapa 6, não nesta tela. */
export function validarFonteAntesUpload(args:{
 nome:string;bytes:ArrayBuffer;papel:FonteId;cnes:string;
}):{layout:string;abas:string[];avisos:string[];motivo:string}{
 const {nome,bytes,papel,cnes}=args;
 if(!bytes.byteLength||bytes.byteLength>50*1024*1024)
  throw Error("Arquivo vazio ou maior que 50 MB.");
 const nomeValido=/\.(dbf|xlsx|xls|ods)$/i.test(nome);
 if(papel==="outros"){
  if(!nomeValido&&!/\.pdf$/i.test(nome))throw Error("Extensão de evidência não permitida.");
  return {layout:"evidencia",abas:[],avisos:[],motivo:"Fonte de apoio fora do motor"};
 }
 if(!nomeValido)throw Error("Fonte técnica exige arquivo DBF/XLSX/XLS/ODS.");
 const dbf=nome.toLowerCase().endsWith(".dbf");
 if((papel.startsWith("dbf_")&&!dbf)||(!papel.startsWith("dbf_")&&dbf))
  throw Error("Papel incompatível com o formato DBF ou planilha.");
 const detectado=identificarFonteBytes(nome,bytes);
 if(detectado&&detectado.id!==papel)
  throw Error("Estrutura detectada como "+detectado.id+
   ", mas selecionada como "+papel+". Corrija a classificação antes de enviar.");
 const validado=validarEstruturaFonte(papel,bytes,cnes,nome);
 return {...validado,motivo:detectado?.motivo??"Estrutura validada por papel escolhido"};
}
