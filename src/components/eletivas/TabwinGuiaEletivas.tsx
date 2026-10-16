import {useMemo,useState,type MouseEvent} from "react";
import {Dialog,DialogContent,DialogTitle} from "@/components/ui/dialog";
import tabwinHtml from "./reference/tabwin-v2422.html?raw";
import "@/styles/eletivas-reference-tabwin.css";

const panes=["faec","mac","sia"] as const;
type Pane=typeof panes[number];
const parsed=tabwinHtml.replace('<div class="overlay" id="tabwinOverlay">',"")
 .replace(/<\/div>\s*$/,"")
 .replace('<button class="dx" id="tabwinClose">fechar ✕</button>',"")
 .replace(/target="_blank"/g,'target="_blank" rel="noopener noreferrer"');
if(!parsed.includes('data-twpane="faec"'))throw Error("Guia TabWin original incompleto.");

export function TabwinGuiaEletivas({open,onOpenChange}:{
 open:boolean;onOpenChange:(v:boolean)=>void;
}){
 const [pane,setPane]=useState<Pane>("faec");
 const html=useMemo(()=>parsed,[]);
 const onSelect=(e:MouseEvent<HTMLDivElement>)=>{
  const el=e.target instanceof Element?e.target.closest<HTMLElement>("[data-tw]"):null;
  if(!el)return;
  const selected=el.dataset.tw as Pane;
  if(!panes.includes(selected))return;
  setPane(selected);
  const root=e.currentTarget;
  root.querySelectorAll<HTMLElement>("[data-tw]").forEach(n=>{
   n.classList.toggle("on",n.dataset.tw===selected);
   n.setAttribute("aria-pressed",String(n.dataset.tw===selected));
  });
  root.querySelectorAll<HTMLElement>("[data-twpane]").forEach(n=>{
   n.classList.toggle("on",n.dataset.twpane===selected);
  });
 };
 return <Dialog open={open} onOpenChange={onOpenChange}>
  <DialogContent className="ec-tabwin max-h-[90vh] max-w-[990px] overflow-y-auto p-0">
   <DialogTitle className="sr-only">Como gerar as tabulações no TabWin</DialogTitle>
   <div className="ec-tabwin-original" onClick={onSelect}
    dangerouslySetInnerHTML={{__html:html}}/>
  </DialogContent>
 </Dialog>;
}
