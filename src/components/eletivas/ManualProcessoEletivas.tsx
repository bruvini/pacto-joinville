import {useMemo,useState,useRef,useCallback,type MouseEvent} from "react";
import {Info} from "lucide-react";
import manualMarkup from "./reference/manual-v2422.html?raw";
import "@/styles/eletivas-reference-manual.css";

/**
 * Port 1:1 da seção #v-manual do HTML 2.42.2.
 * Conteúdo estático e revisado, versionado no repositório.
 * Não recebe strings do usuário / arquivos importados em innerHTML.
 */
const CHAPTERS=[
 {id:"m-inicio",label:"Início"},
 {id:"m-passos",label:"Passo a passo"},
 {id:"m-cib",label:"Deliberações CIB"},
 {id:"m-fluxo",label:"Fluxo BPMN"},
 {id:"m-principio",label:"Princípio"},
 {id:"m-fontes",label:"Fontes"},
 {id:"m-checagens",label:"Checagens"},
 {id:"m-destinos",label:"Destinos"},
 {id:"m-base",label:"Base normativa"},
 {id:"m-biblio",label:"Biblioteca"},
] as const;
const literal=manualMarkup
 .replace('class="view man"','class="view man" aria-label="Manual do processo original"')
 .replaceAll('target="_blank"', 'target="_blank" rel="noopener noreferrer"');
const tocMarkup='<nav class="man-toc" id="manToc" aria-label="Índice dos capítulos">'+
 CHAPTERS.map((v,i)=>'<a href="#'+v.id+'"'+(i===0?' class="on" aria-current="location"':'')+
  '>'+v.label+'</a>').join('')+'</nav>';
const safeHtml=literal.replace('<nav class="man-toc" id="manToc"></nav>',tocMarkup);
if(safeHtml===literal)throw Error("A referência HTML perdeu o índice do Manual.");

export function ManualProcessoEletivas({competencia}:{competencia:string}){
 const rootRef=useRef<HTMLDivElement>(null);
 const [capitulo,setCapitulo]=useState("m-inicio");
 const html=useMemo(()=>safeHtml,[]);
 const navegar=useCallback((event:MouseEvent<HTMLDivElement>)=>{
  const el=event.target instanceof Element?event.target.closest("a[href^='#m-']"):null;
  if(!(el instanceof HTMLAnchorElement))return;
  const id=el.hash.slice(1);
  const heading=rootRef.current?.querySelector<HTMLElement>("#"+id);
  if(!heading)return;
  event.preventDefault();
  setCapitulo(id);
  rootRef.current?.querySelectorAll<HTMLAnchorElement>("nav.man-toc a").forEach(a=>{
   const active=a.hash==="#"+id;
   a.classList.toggle("on",active);
   if(active)a.setAttribute("aria-current","location");
   else a.removeAttribute("aria-current");
  });
  heading.scrollIntoView({behavior:"auto",block:"start"});
 },[]);
 return <div className="ec-manual-ref" ref={rootRef} onClick={navegar}>
  <div className="ec-manual-note" role="note">
   <Info className="h-4 w-4 float-left mr-2 mt-0.5" aria-hidden="true"/>
   <strong>Adaptação institucional no Lovable · {competencia}</strong>
   Este manual mantém integralmente o conteúdo do HTML standalone como referência
   histórica, inclusive suas instruções para processamento local.
   Nesta versão, a competência é criada a partir de uma parcela aberta de convênio
   no Fluxo 1; CNES e competência não são editáveis livremente, os arquivos são
   armazenados em ambiente institucional privado e os relatórios oficiais/assinaturas
   são registrados na Etapa 6 — Liberação de Recurso do lançamento.
  </div>
  <div dangerouslySetInnerHTML={{__html:html}}/>
  <span className="sr-only" aria-live="polite">
   Capítulo selecionado: {CHAPTERS.find(c=>c.id===capitulo)?.label}
  </span>
 </div>;
}
