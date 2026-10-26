import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { ShieldAlert, Search, SlidersHorizontal, Save, Play, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { listPldCases, getPldCase, updatePldCase, savePldRule, runPldObservation } from "@/lib/pld.functions";
import type { PldRuleCode, PldParameters } from "@/lib/pld-rules";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";

const statusLabels = { new:"Novo",in_review:"Em análise",awaiting_information:"Aguardando informações",escalated:"Escalado",closed:"Concluído" } as const;
const rules: Record<PldRuleCode,string> = { volume_growth:"Crescimento de volume",small_payments:"Sequência de pequenos pagamentos",rapid_withdrawal:"Saques após recebimentos",refund_frequency:"Frequência de reembolsos" };

export function AdminPld() {
  const { t } = useTranslation("ui");
  const list = useServerFn(listPldCases), observe = useServerFn(runPldObservation);
  const [status,setStatus] = useState("all"),[tenant,setTenant] = useState(""),[priority,setPriority] = useState("all"),[rule,setRule] = useState("all"),[from,setFrom] = useState(""),[assigned,setAssigned] = useState("");
  const [page,setPage] = useState(0),[selected,setSelected] = useState<string|null>(null),[editingRule,setEditingRule] = useState(false);
  const qc = useQueryClient();
  const query = useQuery({ queryKey:["admin-pld",status,tenant,priority,rule,from,assigned,page],queryFn:() => list({ data:{ page,status:status === "all" ? undefined : status as keyof typeof statusLabels,tenantId:tenant || undefined,priority:priority === "all" ? undefined : priority as "low"|"medium"|"high",rule:rule === "all" ? undefined : rule as PldRuleCode,from:from ? new Date(from).toISOString() : undefined,assignedTo:assigned || undefined } }) });
  const run = useMutation({ mutationFn:() => observe({ data:{ tenantId:tenant } }),onSuccess:result => { toast.success(`${t("Novos alertas")}: ${result.created} · ${t("Dados insuficientes")}: ${result.insufficient}`); void qc.invalidateQueries({queryKey:["admin-pld"]}); },onError:(e:Error)=>toast.error(t(e.message)) });
  return <section className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-4"><div className="flex items-center gap-3"><ShieldAlert className="size-6 text-primary"/><h2 className="text-xl font-semibold">{t("Prevenção à lavagem de dinheiro")}</h2></div><Button variant="outline" onClick={()=>setEditingRule(true)}><SlidersHorizontal className="mr-2 size-4"/>{t("Regras de análise")}</Button></div>
    <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">{(["new","in_review","escalated","closed"] as const).map(s=><div key={s} className="border-l-2 border-border pl-4"><p className="text-sm text-muted-foreground">{t(statusLabels[s])}</p><p className="mt-1 text-2xl font-semibold">{query.isPending ? "—" : query.data?.summary[s] ?? "—"}</p></div>)}</div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <div className="space-y-1"><Label>{t("Situação")}</Label><Select value={status} onValueChange={v=>{setStatus(v);setPage(0);}}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">{t("Todas")}</SelectItem>{Object.entries(statusLabels).map(([v,l])=><SelectItem value={v} key={v}>{t(l)}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-1"><Label>{t("Referência da empresa")}</Label><Input value={tenant} onChange={e=>{setTenant(e.target.value);setPage(0);}}/></div>
      <div className="space-y-1"><Label>{t("Prioridade")}</Label><Select value={priority} onValueChange={v=>{setPriority(v);setPage(0);}}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{[["all","Todas"],["low","Baixa"],["medium","Média"],["high","Alta"]].map(([v,l])=><SelectItem key={v} value={v}>{t(l)}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-1"><Label>{t("Regra")}</Label><Select value={rule} onValueChange={v=>{setRule(v);setPage(0);}}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">{t("Todas")}</SelectItem>{Object.entries(rules).map(([v,l])=><SelectItem key={v} value={v}>{t(l)}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-1"><Label>{t("Desde")}</Label><Input type="date" value={from} onChange={e=>{setFrom(e.target.value);setPage(0);}}/></div>
      <div className="space-y-1"><Label>{t("Referência do responsável")}</Label><Input value={assigned} onChange={e=>{setAssigned(e.target.value);setPage(0);}}/></div>
    </div>
    <div className="flex flex-wrap items-center gap-3"><Badge variant="secondary">{t("Modo de observação")}</Badge><Button variant="outline" disabled={!tenant || run.isPending} onClick={()=>run.mutate()}><Play className="mr-2 size-4"/>{t(run.isPending ? "Analisando…" : "Analisar empresa")}</Button><span className="text-sm text-muted-foreground">{t("Regras ativas")}: {query.data?.rules.filter((r,i,all)=>all.findIndex(x=>x.rule_code === r.rule_code)===i && r.enabled).length ?? "—"}</span></div>
    {query.isError ? <p role="alert" className="text-destructive">{t(query.error.message)}</p> : null}
    <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>{t("Caso")}</TableHead><TableHead>{t("Empresa")}</TableHead><TableHead>{t("Situação")}</TableHead><TableHead>{t("Prioridade")}</TableHead><TableHead>{t("Data")}</TableHead><TableHead/></TableRow></TableHeader><TableBody>
      {(query.data?.rows ?? []).map(r=><TableRow key={r.id}><TableCell className="font-mono text-xs">{r.id.slice(0,8)}</TableCell><TableCell className="font-mono text-xs">{r.tenant_id.slice(0,8)}…</TableCell><TableCell>{t(statusLabels[r.status as keyof typeof statusLabels])}</TableCell><TableCell>{t(r.priority === "high" ? "Alta" : r.priority === "low" ? "Baixa" : "Média")}</TableCell><TableCell>{new Date(r.created_at).toLocaleDateString()}</TableCell><TableCell><Button size="icon" variant="ghost" title={t("Analisar caso")} onClick={()=>setSelected(r.id)}><Search className="size-4"/></Button></TableCell></TableRow>)}
      {!query.data?.rows.length ? <TableRow><TableCell colSpan={6} className="py-12 text-center text-muted-foreground">{t(query.isPending ? "Carregando…" : "Nenhum caso encontrado.")}</TableCell></TableRow> : null}
    </TableBody></Table></div>
    <div className="flex items-center justify-end gap-3"><span className="text-sm text-muted-foreground">{query.data?.total ?? "—"} {t("casos")}</span><Button size="icon" variant="outline" title={t("Anterior")} disabled={page===0} onClick={()=>setPage(v=>v-1)}><ChevronLeft className="size-4"/></Button><Button size="icon" variant="outline" title={t("Próximo")} disabled={(page+1)*50 >= (query.data?.total ?? 0)} onClick={()=>setPage(v=>v+1)}><ChevronRight className="size-4"/></Button></div>
    {selected ? <CaseDialog id={selected} onClose={()=>setSelected(null)}/> : null}
    {editingRule ? <RuleDialog onClose={()=>setEditingRule(false)}/> : null}
  </section>;
}

function CaseDialog({id,onClose}:{id:string;onClose:()=>void}) {
  const {t} = useTranslation("ui"),qc = useQueryClient();
  const get = useServerFn(getPldCase),update = useServerFn(updatePldCase);
  const query = useQuery({queryKey:["admin-pld-case",id],queryFn:()=>get({data:{id}})});
  const [status,setStatus] = useState("in_review"),[note,setNote] = useState(""),[outcome,setOutcome] = useState(""),[assign,setAssign] = useState(true);
  const save = useMutation({mutationFn:async()=>{
    if (!query.data) throw new Error(t("Caso não encontrado."));
    return update({data:{id,revision:query.data.revision,status:status as keyof typeof statusLabels,note,outcome:outcome ? outcome as "false_positive"|"explained"|"specialist_review" : null,assignToMe:assign}});
  },onSuccess:()=>{toast.success(t("Análise salva."));void qc.invalidateQueries({queryKey:["admin-pld"]});qc.removeQueries({queryKey:["admin-pld-case",id]});onClose();},onError:(e:Error)=>toast.error(t(e.message))});
  return <Dialog open onOpenChange={v=>!v&&onClose()}><DialogContent className="max-h-[85dvh] max-w-2xl overflow-y-auto"><DialogHeader><DialogTitle>{t("Análise do caso")}</DialogTitle></DialogHeader>
    {query.isError ? <p role="alert" className="text-destructive">{t(query.error.message)}</p> : null}
    {query.data ? <div className="space-y-5"><div><p className="font-semibold">{query.data.tenantName}</p><p className="text-sm text-muted-foreground">{t(query.data.content.reason ?? "Indicador de movimentação para análise humana")}</p><p className="mt-2 text-sm">{t("Regra")}: {t(rules[query.data.content.rule as PldRuleCode] ?? "Revisão manual")} · {t("Versão")}: {query.data.content.ruleVersion ?? "—"}</p><p className="text-sm">{t("Quantidade")}: {query.data.content.count ?? "—"} · {t("Valor observado")}: {query.data.content.total ?? "—"}</p><p className="text-xs text-muted-foreground">{t("Origem")}: {query.data.content.source ?? "—"}</p></div>
      <div><h3 className="text-sm font-semibold">{t("Referências das operações")}</h3><div className="mt-2 max-h-32 overflow-auto font-mono text-xs">{(query.data.content.references ?? []).map(r=><p key={r}>{r}</p>)}</div></div>
      <div className="space-y-3 border-t border-border pt-4"><h3 className="font-semibold">{t("Histórico de análise")}</h3>{query.data.events.map(e=><div key={e.id} className="border-l-2 border-border pl-3"><p className="text-xs text-muted-foreground">{new Date(e.created_at).toLocaleString()} · {e.actor_id.slice(0,8)}</p><p className="whitespace-pre-wrap text-sm">{e.content.note}</p>{e.content.outcome ? <Badge variant="secondary">{t(e.content.outcome === "false_positive" ? "Falso positivo" : e.content.outcome === "explained" ? "Explicado" : "Avaliação especializada")}</Badge> : null}</div>)}</div>
      <form className="space-y-3 border-t border-border pt-4" onSubmit={e=>{e.preventDefault();save.mutate();}}>
        <Label>{t("Nova situação")}</Label><Select value={status} onValueChange={setStatus}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{Object.entries(statusLabels).filter(([v])=>v!=="new").map(([v,l])=><SelectItem value={v} key={v}>{t(l)}</SelectItem>)}</SelectContent></Select>
        {status === "closed" ? <><Label>{t("Resultado da análise")}</Label><Select value={outcome} onValueChange={setOutcome}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{[["false_positive","Falso positivo"],["explained","Explicado"],["specialist_review","Avaliação especializada"]].map(([v,l])=><SelectItem key={v} value={v}>{t(l)}</SelectItem>)}</SelectContent></Select></> : null}
        <Label htmlFor="pld-note">{t("Justificativa protegida")}</Label><Textarea id="pld-note" value={note} onChange={e=>setNote(e.target.value)} minLength={5} maxLength={10000} required/>
        <div className="flex items-center gap-2"><Checkbox id="pld-assign" checked={assign} onCheckedChange={v=>setAssign(v===true)}/><Label htmlFor="pld-assign">{t("Assumir análise")}</Label></div>
        <Button disabled={save.isPending}><Save className="mr-2 size-4"/>{t("Salvar análise")}</Button>
      </form>
    </div> : query.isPending ? <p>{t("Carregando…")}</p> : null}
  </DialogContent></Dialog>;
}

function RuleDialog({onClose}:{onClose:()=>void}) {
  const {t} = useTranslation("ui"),qc = useQueryClient(),fn = useServerFn(savePldRule);
  const [code,setCode] = useState<PldRuleCode>("volume_growth"),[enabled,setEnabled] = useState(false),[reason,setReason] = useState("");
  const [params,setParams] = useState<Record<keyof PldParameters,string>>({windowDays:"",minCount:"",minTotal:"",smallPaymentMax:"",growthMultiplier:"",rapidHours:""});
  const fields: [keyof PldParameters,string][] = [["windowDays","Período em dias"],["minCount","Quantidade mínima"],["minTotal","Valor total mínimo"],["smallPaymentMax","Valor máximo por pequeno pagamento"],["growthMultiplier","Multiplicador de crescimento"],["rapidHours","Intervalo em horas após recebimento"]];
  const save = useMutation({mutationFn:()=>fn({data:{code,enabled,justification:reason,parameters:{...params,windowDays:Number(params.windowDays),minCount:Number(params.minCount),rapidHours:Number(params.rapidHours)}}}),onSuccess:()=>{toast.success(t("Regra salva."));void qc.invalidateQueries({queryKey:["admin-pld"]});onClose();},onError:(e:Error)=>toast.error(t(e.message))});
  return <Dialog open onOpenChange={v=>!v&&onClose()}><DialogContent className="max-h-[85dvh] overflow-auto"><DialogHeader><DialogTitle>{t("Nova versão de regra")}</DialogTitle></DialogHeader><form className="space-y-4" onSubmit={e=>{e.preventDefault();save.mutate();}}>
    <Select value={code} onValueChange={v=>setCode(v as PldRuleCode)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{Object.entries(rules).map(([v,l])=><SelectItem value={v} key={v}>{t(l)}</SelectItem>)}</SelectContent></Select>
    <div className="grid grid-cols-2 gap-3">{fields.map(([k,l])=><div key={k} className="space-y-1"><Label htmlFor={`param-${k}`}>{t(l)}</Label><Input id={`param-${k}`} inputMode="decimal" required value={params[k]} onChange={e=>setParams(v=>({...v,[k]:e.target.value.replace(",",".")}))}/></div>)}</div>
    <Label htmlFor="pld-reason">{t("Justificativa dos parâmetros")}</Label><Textarea id="pld-reason" minLength={10} maxLength={1000} required value={reason} onChange={e=>setReason(e.target.value)}/>
    <div className="flex items-center gap-2"><Checkbox id="pld-enabled" checked={enabled} onCheckedChange={v=>setEnabled(v===true)}/><Label htmlFor="pld-enabled">{t("Ativar esta versão para observação")}</Label></div>
    <Button disabled={save.isPending}><Save className="mr-2 size-4"/>{t("Salvar regra")}</Button>
  </form></DialogContent></Dialog>;
}