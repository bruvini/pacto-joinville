import { useMemo, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CurrencyInput } from "@/components/inputs/CurrencyInput";
import { SeiLink } from "@/components/inputs/SeiLink";
import {
  type CadastroEmenda, formularioVazioEmenda, normalizarCadastroEmenda,
  validarCadastroEmenda, PERIODICIDADES, SITUACOES,
} from "@/lib/emendas/cadastro";

type Catalogos = {
  prestadores: { id:string;nome_instituicao:string }[];
  convenios: { id:string;prestador_id:string;objeto:string|null }[];
  termos: { id:string;convenio_id:string;objeto:string|null }[];
};
type Props=Catalogos & {
  inicial?:CadastroEmenda;
  editando?:boolean;
  onSalvar:(dados:CadastroEmenda)=>Promise<void>;
  onCancelar?:()=>void;
};
function Campo({titulo,children,help}:{titulo:string;children:React.ReactNode;help?:string}) {
  return <div className="space-y-1.5">
    <Label className="text-xs font-medium">{titulo}</Label>
    {children}
    {help && <p className="text-[11px] leading-relaxed text-muted-foreground">{help}</p>}
  </div>;
}
const textoOpcional = (value:string)=>value||null;

export function FormularioEmenda({inicial,editando=false,onSalvar,onCancelar,prestadores,convenios,termos}:Props) {
  const [form,setForm]=useState<CadastroEmenda>(inicial??formularioVazioEmenda());
  const [erro,setErro]=useState<string[]>([]);
  const [salvando,setSalvando]=useState(false);
  const set=<K extends keyof CadastroEmenda>(campo:K, valor:CadastroEmenda[K])=>
    setForm(prev=>({...prev,[campo]:valor}));
  const conveniosFiltrados=useMemo(()=>convenios.filter(x=>x.prestador_id===form.prestador_id),[convenios,form.prestador_id]);
  const termosFiltrados=useMemo(()=>termos.filter(x=>x.convenio_id===form.convenio_id),[termos,form.convenio_id]);
  const salvar=async(e:React.FormEvent)=>{
    e.preventDefault();
    const normalizado=normalizarCadastroEmenda(form);
    const errs=validarCadastroEmenda(normalizado,editando);
    if(form.convenio_id&&!conveniosFiltrados.some(c=>c.id===form.convenio_id))
      errs.push("O convênio não pertence à instituição selecionada.");
    if(form.termo_aditivo_id&&!termosFiltrados.some(c=>c.id===form.termo_aditivo_id))
      errs.push("O termo não pertence ao convênio selecionado.");
    setErro(errs);
    if(errs.length) return;
    setSalvando(true);
    try {await onSalvar(normalizado);}
    catch(error){setErro([error instanceof Error?error.message:"Não foi possível salvar a emenda."]);}
    finally{setSalvando(false);}
  };
  return <form onSubmit={salvar} className="space-y-4">
    {erro.length>0 && <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
      {erro.map((e,i)=><p key={i}>{e}</p>)}
    </div>}
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">Identificação e finalidade</CardTitle></CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Campo titulo="Número da emenda *"><Input value={form.numero} onChange={e=>set("numero",e.target.value)} placeholder="42510002/2026" /></Campo>
        <Campo titulo="Exercício *"><Input inputMode="numeric" type="number" min={2000} max={2100} value={form.exercicio} onChange={e=>set("exercicio",Number(e.target.value))}/></Campo>
        <Campo titulo="Situação"><Select value={form.situacao} onValueChange={v=>set("situacao",v)}>
          <SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{SITUACOES.map(s=><SelectItem value={s} key={s}>{s}</SelectItem>)}</SelectContent>
        </Select></Campo>
        <Campo titulo="Modalidade *"><Input value={form.modalidade} onChange={e=>set("modalidade",e.target.value)} placeholder="Emenda individual, bancada..." /></Campo>
        <Campo titulo="Autoria parlamentar *"><Input value={form.autoria_parlamentar} onChange={e=>set("autoria_parlamentar",e.target.value)}/></Campo>
        <Campo titulo="Origem do recurso *"><Input value={form.origem_recurso} onChange={e=>set("origem_recurso",e.target.value)} placeholder="Federal, estadual, municipal..." /></Campo>
        <div className="sm:col-span-2 lg:col-span-3"><Campo titulo="Objeto *"><Textarea rows={2} value={form.objeto} onChange={e=>set("objeto",e.target.value)}/></Campo></div>
        <div className="sm:col-span-2"><Campo titulo="Finalidade"><Textarea rows={2} value={form.finalidade} onChange={e=>set("finalidade",e.target.value)}/></Campo></div>
        <Campo titulo="Descrição complementar"><Textarea rows={2} value={form.descricao} onChange={e=>set("descricao",e.target.value)}/></Campo>
      </CardContent>
    </Card>
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">Vínculos com cadastros existentes</CardTitle></CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-3">
        <Campo titulo="Instituição *"><Select value={form.prestador_id||"none"} onValueChange={v=>setForm(p=>({...p,prestador_id:v==="none"?"":v,convenio_id:null,termo_aditivo_id:null}))}>
          <SelectTrigger><SelectValue placeholder="Selecione..."/></SelectTrigger>
          <SelectContent><SelectItem value="none">Selecione...</SelectItem>{prestadores.map(x=><SelectItem key={x.id} value={x.id}>{x.nome_instituicao}</SelectItem>)}</SelectContent>
        </Select></Campo>
        <Campo titulo="Convênio (quando aplicável)"><Select value={form.convenio_id??"none"} onValueChange={v=>setForm(p=>({...p,convenio_id:v==="none"?null:v,termo_aditivo_id:null}))}>
          <SelectTrigger><SelectValue placeholder="Sem convênio"/></SelectTrigger>
          <SelectContent><SelectItem value="none">Sem convênio</SelectItem>{conveniosFiltrados.map(x=><SelectItem key={x.id} value={x.id}>{x.objeto??x.id}</SelectItem>)}</SelectContent>
        </Select></Campo>
        <Campo titulo="Termo aditivo (quando aplicável)"><Select value={form.termo_aditivo_id??"none"} onValueChange={v=>set("termo_aditivo_id",v==="none"?null:v)}>
          <SelectTrigger><SelectValue placeholder="Sem termo"/></SelectTrigger>
          <SelectContent><SelectItem value="none">Sem termo</SelectItem>{termosFiltrados.map(x=><SelectItem key={x.id} value={x.id}>{x.objeto??x.id}</SelectItem>)}</SelectContent>
        </Select></Campo>
      </CardContent>
    </Card>
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">Proposta, processo e referência financeira</CardTitle></CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Campo titulo="Valor global autorizado inicial *" help={editando?"O valor original é imutável. Use a movimentação formal no detalhamento para ajustá-lo.":"Não é um pagamento ou uma reserva. Informe o valor do ato autorizativo."}>
          <CurrencyInput value={form.valor_autorizado_inicial} disabled={editando} onChange={n=>set("valor_autorizado_inicial",n)}/>
        </Campo>
        <Campo titulo="Número da proposta"><Input value={form.numero_proposta??""} onChange={e=>set("numero_proposta",textoOpcional(e.target.value))}/></Campo>
        <Campo titulo="Data de publicação"><Input type="date" value={form.data_publicacao??""} onChange={e=>set("data_publicacao",textoOpcional(e.target.value))}/></Campo>
        <Campo titulo="Número do processo SEI principal"><Input value={form.processo_sei_numero??""} onChange={e=>set("processo_sei_numero",textoOpcional(e.target.value))}/></Campo>
        <div className="sm:col-span-2"><Campo titulo="Link do processo SEI principal">
          <SeiLink value={form.processo_sei_link??""} onChange={v=>set("processo_sei_link",textoOpcional(v))}/>
        </Campo></div>
        <Campo titulo="Periodicidade padrão"><Select value={form.periodicidade_padrao} onValueChange={v=>set("periodicidade_padrao",v)}>
          <SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{PERIODICIDADES.map(x=><SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent>
        </Select></Campo>
        <Campo titulo="Competência inicial (MM/AAAA)"><Input placeholder="10/2026" value={form.competencia_inicial??""} onChange={e=>set("competencia_inicial",textoOpcional(e.target.value))}/></Campo>
        <Campo titulo="Prazo de execução (dias)"><Input type="number" min={1} max={3650} value={form.prazo_execucao_dias??""} onChange={e=>set("prazo_execucao_dias",e.target.value?Number(e.target.value):null)}/></Campo>
        <div className="flex items-center gap-2 self-end pb-2">
          <Checkbox checked={form.exige_atesto} onCheckedChange={c=>set("exige_atesto",c===true)}/>
          <Label>Exige documento comprobatório/atesto</Label>
        </div>
        <div className="sm:col-span-2 lg:col-span-3"><Campo titulo="Observações"><Textarea value={form.observacoes} rows={2} onChange={e=>set("observacoes",e.target.value)}/></Campo></div>
      </CardContent>
    </Card>
    <div className="flex justify-end gap-2">
      {onCancelar&&<Button type="button" variant="outline" onClick={onCancelar}>Cancelar</Button>}
      <Button type="submit" disabled={salvando}>{salvando?<Loader2 className="mr-2 h-4 w-4 animate-spin"/>:<Save className="mr-2 h-4 w-4"/>}
        {editando?"Salvar cadastro":"Cadastrar emenda"}</Button>
    </div>
  </form>;
}
