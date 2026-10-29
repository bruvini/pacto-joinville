import { useMemo, useState } from "react";
import { Loader2, Save, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { explicarErroCadastro } from "@/lib/emendas/erros";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CurrencyInput } from "@/components/inputs/CurrencyInput";
import { SeiLink } from "@/components/inputs/SeiLink";
import {
  type CadastroEmenda, formularioVazioEmenda, normalizarCadastroEmenda,
  validarCadastroEmenda, totalAutorizado, SITUACOES, nomeSituacao,
  MODALIDADES_EMENDA, ORIGENS_RECURSO_EMENDA,
} from "@/lib/emendas/cadastro";

type Catalogos = {
  prestadores: { id:string;nome_instituicao:string }[];
  convenios: { id:string;prestador_id:string;objeto:string|null }[];
  termos: { id:string;convenio_id:string;identificador:string;objeto:string|null }[];
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
  const alterado=useMemo(()=>JSON.stringify(normalizarCadastroEmenda(form))!==JSON.stringify(
    normalizarCadastroEmenda(inicial??formularioVazioEmenda())),[form,inicial]);
  const set=<K extends keyof CadastroEmenda>(campo:K, valor:CadastroEmenda[K])=>
    setForm(prev=>({...prev,[campo]:valor}));
  const conveniosFiltrados=useMemo(()=>convenios.filter(x=>x.prestador_id===form.prestador_id),[convenios,form.prestador_id]);
  const termosFiltrados=useMemo(()=>termos.filter(x=>x.convenio_id===form.convenio_id),[termos,form.convenio_id]);
  const modalidades=useMemo(()=>form.modalidade && !MODALIDADES_EMENDA.some(x=>x===form.modalidade)
    ? [...MODALIDADES_EMENDA,form.modalidade] : [...MODALIDADES_EMENDA],[form.modalidade]);
  const origens=useMemo(()=>form.origem_recurso && !ORIGENS_RECURSO_EMENDA.some(x=>x===form.origem_recurso)
    ? [...ORIGENS_RECURSO_EMENDA,form.origem_recurso] : [...ORIGENS_RECURSO_EMENDA],[form.origem_recurso]);
  const salvar=async(e:React.FormEvent)=>{
    e.preventDefault();
    const normalizado=normalizarCadastroEmenda(form);
    const errs=validarCadastroEmenda(normalizado,editando);
    if(form.convenio_id&&!conveniosFiltrados.some(c=>c.id===form.convenio_id))
      errs.push("O convênio não pertence à instituição selecionada.");
    if(form.termo_aditivo_id&&!termosFiltrados.some(c=>c.id===form.termo_aditivo_id))
      errs.push("O termo não pertence ao convênio selecionado.");
    setErro(errs);
    if(editando&&!alterado)return;
    if(errs.length) {
      toast.error("Revise os campos da emenda", { description:errs[0] });
      return;
    }
    setSalvando(true);
    try {
      await onSalvar(normalizado);
    } catch(error) {
      const info=explicarErroCadastro(error);
      setErro([info.mensagem,info.diagnostico]);
      toast.error("Cadastro não foi salvo", {
        description:info.mensagem,
        duration:9000,
      });
    } finally {
      setSalvando(false);
    }
  };
  return <form onSubmit={salvar} className="space-y-4">
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">Identificação e finalidade</CardTitle></CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Campo titulo="Número da emenda *"><Input value={form.numero} onChange={e=>set("numero",e.target.value)} placeholder="42510002/2026" /></Campo>
        <Campo titulo="Situação"><Select value={form.situacao} onValueChange={v=>set("situacao",v)}>
          <SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{SITUACOES.map(s=><SelectItem value={s} key={s}>{nomeSituacao(s).toLocaleUpperCase("pt-BR")}</SelectItem>)}</SelectContent>
        </Select></Campo>
        <Campo titulo="Modalidade *">
          <Select value={form.modalidade||undefined} onValueChange={v=>set("modalidade",v)}>
            <SelectTrigger><SelectValue placeholder="Selecione a modalidade"/></SelectTrigger>
            <SelectContent>{modalidades.map(v=><SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
          </Select>
        </Campo>
        <Campo titulo="Autoria parlamentar *"><Input value={form.autoria_parlamentar} onChange={e=>set("autoria_parlamentar",e.target.value)}/></Campo>
        <Campo titulo="Origem do recurso *">
          <Select value={form.origem_recurso||undefined} onValueChange={v=>set("origem_recurso",v)}>
            <SelectTrigger><SelectValue placeholder="Selecione a origem"/></SelectTrigger>
            <SelectContent>{origens.map(v=><SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
          </Select>
        </Campo>
        <div className="sm:col-span-2 lg:col-span-3"><Campo titulo="Objeto *"><Textarea rows={2} value={form.objeto} onChange={e=>set("objeto",e.target.value)}/></Campo></div>
        <Campo titulo="Processo SEI principal (número)">
          <Input type="text" inputMode="text" autoComplete="off" name="processo-administrativo-sei"
            data-lpignore="true" data-1p-ignore="true" value={form.processo_sei_numero??""}
            onChange={e=>set("processo_sei_numero",textoOpcional(e.target.value))} placeholder="26.0.083102-3"/>
        </Campo>
        <div className="sm:col-span-2"><Campo titulo="Link SEI do processo principal">
          <SeiLink value={form.processo_sei_link??""} onChange={v=>set("processo_sei_link",textoOpcional(v))}/>
        </Campo></div>
        <Campo titulo="Prazo de execução (dias)">
          <Input type="number" min={1} max={3650} autoComplete="off" value={form.prazo_execucao_dias??""}
            onChange={e=>set("prazo_execucao_dias",e.target.value?Number(e.target.value):null)}/>
        </Campo>
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
          <SelectContent><SelectItem value="none">Sem termo</SelectItem>{termosFiltrados.map(x=><SelectItem key={x.id} value={x.id}>{x.identificador||x.objeto||x.id}</SelectItem>)}</SelectContent>
        </Select></Campo>
      </CardContent>
    </Card>
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">Portaria municipal e valores</CardTitle></CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Campo titulo="Valor da emenda *" help={editando?"Valor inicial preservado. Alterações formais ficam no histórico.":"Valor previsto no ato de destinação."}>
          <CurrencyInput value={form.valor_autorizado_inicial} disabled={editando} onChange={n=>set("valor_autorizado_inicial",n)}/>
        </Campo>
        <Campo titulo="Rendimento (se houver)" help="Receita de rendimento informada e comprovada. Acrescenta ao limite cadastral; não confirma disponibilidade na Fazenda.">
          <CurrencyInput value={form.valor_rendimento} onChange={n=>set("valor_rendimento",n)}/>
        </Campo>
        <div className="rounded-md border bg-primary/5 p-3">
          <p className="text-xs text-muted-foreground">Total da emenda + rendimento</p>
          <p className="text-lg font-bold tabular-nums text-primary">{totalAutorizado(form.valor_autorizado_inicial,form.valor_rendimento,[]).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}</p>
          <p className="text-[11px] text-muted-foreground">Antes de reservas, notas e ajustes formais</p>
        </div>
        <Campo titulo="Portaria municipal da emenda" help="Número do ato, diferente do número SEI.">
          <Input autoComplete="off" name="portaria-emenda" value={form.numero_portaria_municipal??""} onChange={e=>set("numero_portaria_municipal",textoOpcional(e.target.value))} placeholder="Ex.: 000/2026/SMS"/>
        </Campo>
        <Campo titulo="Número SEI da portaria"><Input autoComplete="off" name="documento-sei-portaria-emenda" value={form.portaria_municipal_numero_sei??""} onChange={e=>set("portaria_municipal_numero_sei",textoOpcional(e.target.value))}/></Campo>
        <div className="min-w-0"><Campo titulo="Link SEI da portaria municipal">
          <SeiLink value={form.portaria_municipal_link_sei??""} onChange={v=>set("portaria_municipal_link_sei",textoOpcional(v))}/>
        </Campo></div>
        <Campo titulo="Número da proposta de financiamento">
          <Input autoComplete="off" name="proposta-financiamento" value={form.numero_proposta??""} onChange={e=>set("numero_proposta",textoOpcional(e.target.value))}/>
        </Campo>
        <Campo titulo="Data de publicação"><Input type="date" value={form.data_publicacao??""} onChange={e=>set("data_publicacao",textoOpcional(e.target.value))}/></Campo>

      </CardContent>
    </Card>
    {erro.length>0 && <div role="alert" aria-live="assertive" className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
      <p className="mb-1 flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" />Cadastro não salvo</p>
      {erro.map((e,i)=><p key={i} className="break-words">{e}</p>)}
      <p className="mt-2 text-xs">Os dados permanecem no formulário para correção. Nenhum registro foi confirmado.</p>
    </div>}
    <div className="flex justify-end gap-2">
      {onCancelar&&<Button type="button" variant="outline" onClick={onCancelar}>Cancelar</Button>}
      <Button type="submit" disabled={salvando||(editando&&!alterado)}>{salvando?<Loader2 className="mr-2 h-4 w-4 animate-spin"/>:<Save className="mr-2 h-4 w-4"/>}
        {editando?"Salvar cadastro":"Cadastrar emenda"}</Button>
    </div>
  </form>;
}
