import { useTranslation } from "react-i18next";
import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Copy, Crown, Plus, ShieldAlert, UserPlus } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { EmptyState, ErrorState, ListSkeleton, StatusBadge, SummaryStrip } from "@/components/ds";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDate } from "@/lib/format";
import {
  cancelInvite, createInvite, deleteCustomRole, getMemberDetail, listTeam, listTeamAudit,
  resendInvite, saveCustomRole, setMemberStatus, updateMember,
} from "@/lib/team.functions";
import { ACTION_LABEL, CRITICAL_PERMISSIONS, PERMISSION_MODULES, ROLE_LABEL, basePermissions, type TeamRole } from "@/lib/permissions";

export const Route = createFileRoute("/_authenticated/equipe")({
  head: () => ({
    meta: [
      { title: "Equipe e permissões — Wiize Recebe" },
      { name: "description", content: "Convide colaboradores, defina cargos e permissões e acompanhe a atividade da equipe." },
      { property: "og:title", content: "Equipe e permissões — Wiize Recebe" },
      { property: "og:description", content: "Gestão de usuários, permissões e auditoria da sua empresa." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Equipe,
});

type Team = Awaited<ReturnType<typeof listTeam>>;
type Member = Team["members"][number];

const inviteLink = (token: string) => `${window.location.origin}/convite/${token}`;
const copy = async (text: string) => {
  await navigator.clipboard.writeText(text).catch(() => undefined);
  toast.success("Link do convite copiado. Envie para a pessoa convidada.");
};
const fmtTime = (s: number) => (s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.round((s % 3600) / 60)}min` : `${Math.round(s / 60)} min`);

function Equipe() {
  const { t: ui } = useTranslation("ui");
  const fetchTeam = useServerFn(listTeam);
  const q = useQuery({ queryKey: ["team"], queryFn: () => fetchTeam(), refetchInterval: 60_000 });
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editing, setEditing] = useState<Member | null>(null);
  const [viewing, setViewing] = useState<Member | null>(null);

  if (q.isError) return <div className="p-6"><ErrorState text={(q.error as Error).message} onRetry={() => void q.refetch()} /></div>;
  const t = q.data;
  const canManage = !!t?.me.permissions.includes("team.manage");
  const canAudit = !!t?.me.permissions.includes("audit.view");
  const active = t?.members.filter((m) => m.status === "active") ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title={ui("Equipe e permissões")}
        description="Cada pessoa tem login, senha e 2FA próprios e só vê o que você liberar."
        action={canManage ? <Button onClick={() => setInviteOpen(true)}><UserPlus className="mr-2 h-4 w-4" />Convidar pessoa</Button> : undefined}
      />
      <SummaryStrip
        cols={5}
        items={[
          { label: "Ativos", value: t ? active.length : null },
          { label: "Online agora", value: t ? active.filter((m) => m.online).length : null, accent: true },
          { label: "Convites pendentes", value: t ? t.invites.filter((i) => i.status === "pending").length : null },
          { label: "Com 2FA", value: t ? `${active.filter((m) => m.mfa).length}/${active.length}` : null },
          { label: "Desativados", value: t ? t.members.length - active.length : null },
        ]}
      />
      <Tabs defaultValue="membros">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="membros">Membros</TabsTrigger>
          <TabsTrigger value="convites">Convites</TabsTrigger>
          <TabsTrigger value="cargos">Cargos</TabsTrigger>
          {canAudit && <TabsTrigger value="auditoria">Auditoria</TabsTrigger>}
        </TabsList>
        <TabsContent value="membros" className="mt-4">
          {!t ? <ListSkeleton rows={4} /> : (
            <div className="rounded-xl border divide-y overflow-hidden">
              {t.members.map((m) => (
                <div key={m.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${m.online ? "bg-primary" : "bg-muted-foreground/30"}`} title={m.online ? "Online" : "Offline"} />
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {m.name ?? m.email ?? "Usuário"} {m.isMe && <span className="text-muted-foreground text-sm">(você)</span>}
                      </p>
                      <p className="truncate text-sm text-muted-foreground">{m.email}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {m.role === "owner" ? <StatusBadge tone="success"><Crown className="mr-1 inline h-3 w-3" />Proprietário</StatusBadge> : <StatusBadge>{t.roles.find((r) => r.id === m.custom_role_id)?.name ?? ROLE_LABEL[m.role as TeamRole]}</StatusBadge>}
                    <StatusBadge tone={m.mfa ? "success" : "warning"}>{m.mfa ? "2FA ativo" : "Sem 2FA"}</StatusBadge>
                    {m.status !== "active" && <StatusBadge tone="danger">Desativado</StatusBadge>}
                    <span className="text-xs text-muted-foreground">{m.last_seen_at ? `Visto ${formatDate(m.last_seen_at)}` : "Nunca acessou"}</span>
                    <Button size="sm" variant="ghost" onClick={() => setViewing(m)}>Atividade</Button>
                    {canManage && !m.isMe && m.role !== "owner" && (t.me.role === "owner" || m.role !== "admin") && (
                      <Button size="sm" variant="outline" onClick={() => setEditing(m)}>Gerenciar</Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
        <TabsContent value="convites" className="mt-4"><Invites team={t} canManage={canManage} /></TabsContent>
        <TabsContent value="cargos" className="mt-4"><Roles team={t} canManage={canManage} /></TabsContent>
        {canAudit && <TabsContent value="auditoria" className="mt-4"><Audit team={t} /></TabsContent>}
      </Tabs>
      {t && inviteOpen && <InviteDialog team={t} onClose={() => setInviteOpen(false)} />}
      {t && editing && <MemberDialog team={t} member={editing} onClose={() => setEditing(null)} />}
      {viewing && <ActivityDialog member={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

function PermissionMatrix({ value, onChange, allowed, critical }: { value: string[]; onChange: (v: string[]) => void; allowed: string[]; critical: boolean }) {
  const toggle = (p: string, on: boolean) => onChange(on ? [...new Set([...value, p])] : value.filter((x) => x !== p));
  return (
    <div className="space-y-3">
      <div className="rounded-lg border divide-y max-h-[40vh] overflow-y-auto">
        {PERMISSION_MODULES.map((m) => (
          <div key={m.id} className="p-3">
            <p className="text-sm font-medium">{m.label}</p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
              {m.actions.map((a) => {
                const id = `${m.id}.${a}`;
                return (
                  <label key={id} className={`flex items-center gap-1.5 text-sm ${allowed.includes(id) ? "" : "opacity-40"}`}>
                    <Checkbox disabled={!allowed.includes(id)} checked={value.includes(id)} onCheckedChange={(v) => toggle(id, v === true)} />
                    {ACTION_LABEL[a]}
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3">
        <p className="flex items-center gap-2 text-sm font-medium"><ShieldAlert className="h-4 w-4 text-destructive" />Permissões críticas (saques e contas bancárias)</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {critical ? "Admins recebem estas permissões. Colaboradores nunca podem recebê-las." : "Somente Proprietário e Admin. Colaboradores nunca recebem, mesmo com acesso ao financeiro."}
        </p>
        <ul className="mt-2 space-y-1 text-xs text-muted-foreground">{CRITICAL_PERMISSIONS.map((c) => <li key={c.id}>• {c.label}</li>)}</ul>
      </div>
    </div>
  );
}

function useRefresh() {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: ["team"] });
}

function RoleSelect({ team, role, setRole, customRoleId, setCustomRoleId }: { team: Team; role: TeamRole; setRole: (r: TeamRole) => void; customRoleId: string | null; setCustomRoleId: (v: string | null) => void }) {
  const value = customRoleId ? `custom:${customRoleId}` : role;
  return (
    <Select
      value={value}
      onValueChange={(v) => {
        if (v.startsWith("custom:")) { setRole("viewer"); setCustomRoleId(v.slice(7)); }
        else { setRole(v as TeamRole); setCustomRoleId(null); }
      }}
    >
      <SelectTrigger><SelectValue /></SelectTrigger>
      <SelectContent>
        {team.me.role === "owner" && <SelectItem value="admin">Admin — acesso completo, inclusive saques</SelectItem>}
        <SelectItem value="finance">Colaborador financeiro — sem saques</SelectItem>
        <SelectItem value="viewer">Colaborador — só o que você marcar</SelectItem>
        {team.roles.map((r) => <SelectItem key={r.id} value={`custom:${r.id}`}>Cargo: {r.name}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function InviteDialog({ team, onClose }: { team: Team; onClose: () => void }) {
  const { t: ui } = useTranslation("ui");
  const refresh = useRefresh();
  const create = useServerFn(createInvite);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<TeamRole>("viewer");
  const [customRoleId, setCustomRoleId] = useState<string | null>(null);
  const [perms, setPerms] = useState<string[]>(["dashboard.view"]);
  const [link, setLink] = useState<string | null>(null);
  const m = useMutation({
    mutationFn: () => create({ data: { email, fullName: name, role, customRoleId, permissions: perms } }),
    onSuccess: (r) => { setLink(inviteLink(r.token)); refresh(); },
    onError: (e) => toast.error((e as Error).message),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Convidar pessoa</DialogTitle></DialogHeader>
        {link ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Convite criado. Ele vale por 7 dias e só pode ser usado uma vez. Envie este link para {email}:</p>
            <div className="flex gap-2"><Input readOnly value={link} /><Button onClick={() => void copy(link)}><Copy className="h-4 w-4" /></Button></div>
            <Button variant="outline" className="w-full" onClick={onClose}>Concluir</Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><Label>{ui("Nome")}</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>{ui("E-mail")}</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            </div>
            <div className="space-y-1.5"><Label>Cargo</Label><RoleSelect team={team} role={role} setRole={setRole} customRoleId={customRoleId} setCustomRoleId={setCustomRoleId} /></div>
            {role === "viewer" && !customRoleId && (
              <div className="space-y-1.5"><Label>Permissões</Label><PermissionMatrix value={perms} onChange={setPerms} allowed={team.me.permissions} critical={false} /></div>
            )}
            {role !== "viewer" && <p className="text-sm text-muted-foreground">Permissões padrão do cargo: {basePermissions(role).length} liberadas.</p>}
            <Button className="w-full" disabled={m.isPending || !email} onClick={() => m.mutate()}>Criar convite</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function MemberDialog({ team, member, onClose }: { team: Team; member: Member; onClose: () => void }) {
  const { t: ui } = useTranslation("ui");
  const refresh = useRefresh();
  const update = useServerFn(updateMember);
  const setStatus = useServerFn(setMemberStatus);
  const [role, setRole] = useState<TeamRole>(member.role as TeamRole);
  const [customRoleId, setCustomRoleId] = useState<string | null>(member.custom_role_id);
  const [perms, setPerms] = useState<string[]>(member.permissions ?? []);
  const save = useMutation({
    mutationFn: () => update({ data: { memberId: member.id, role, customRoleId, permissions: perms } }),
    onSuccess: () => { toast.success("Permissões atualizadas."); refresh(); onClose(); },
    onError: (e) => toast.error((e as Error).message),
  });
  const status = useMutation({
    mutationFn: () => setStatus({ data: { memberId: member.id, active: member.status !== "active" } }),
    onSuccess: () => { toast.success(member.status === "active" ? "Acesso desativado. A pessoa foi desconectada." : "Acesso reativado."); refresh(); onClose(); },
    onError: (e) => toast.error((e as Error).message),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{member.name ?? member.email}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5"><Label>Cargo</Label><RoleSelect team={team} role={role} setRole={setRole} customRoleId={customRoleId} setCustomRoleId={setCustomRoleId} /></div>
          <div className="space-y-1.5">
            <Label>Permissões extras</Label>
            <PermissionMatrix value={perms} onChange={setPerms} allowed={team.me.permissions} critical={role === "admin"} />
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button className="flex-1" disabled={save.isPending} onClick={() => save.mutate()}>{ui("Salvar")}</Button>
            <Button variant={member.status === "active" ? "destructive" : "outline"} disabled={status.isPending} onClick={() => status.mutate()}>
              {member.status === "active" ? "Desativar acesso" : "Reativar acesso"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Desativar bloqueia o acesso imediatamente e mantém todo o histórico.</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ActivityDialog({ member, onClose }: { member: Member; onClose: () => void }) {
  const fetchDetail = useServerFn(getMemberDetail);
  const q = useQuery({ queryKey: ["team-member", member.id], queryFn: () => fetchDetail({ data: { memberId: member.id } }) });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Atividade de {member.name ?? member.email}</DialogTitle></DialogHeader>
        {!q.data ? <ListSkeleton rows={4} /> : (
          <div className="space-y-5 text-sm">
            <p>Tempo ativo nos últimos 30 dias: <strong>{fmtTime(q.data.totalSeconds30d)}</strong></p>
            <section>
              <h3 className="font-medium mb-2">Páginas mais usadas</h3>
              {q.data.topPages.length === 0 ? <p className="text-muted-foreground">Sem registros ainda.</p> : (
                <ul className="divide-y rounded-lg border">{q.data.topPages.map((p) => <li key={p.path} className="flex justify-between p-2"><span>{p.path}</span><span className="text-muted-foreground">{fmtTime(p.seconds)}</span></li>)}</ul>
              )}
            </section>
            <section>
              <h3 className="font-medium mb-2">Dispositivos</h3>
              {q.data.sessions.length === 0 ? <p className="text-muted-foreground">Nenhum acesso registrado.</p> : (
                <ul className="divide-y rounded-lg border">{q.data.sessions.map((s, i) => <li key={i} className="p-2"><p className="truncate">{s.user_agent ?? "Dispositivo"}</p><p className="text-xs text-muted-foreground">{s.ip_address ?? "IP desconhecido"} · {formatDate(s.last_seen_at)}</p></li>)}</ul>
              )}
            </section>
            {q.data.audits.length > 0 && (
              <section>
                <h3 className="font-medium mb-2">Ações registradas</h3>
                <ul className="divide-y rounded-lg border">{q.data.audits.map((a, i) => <li key={i} className="flex justify-between gap-2 p-2"><span className="truncate">{a.action}</span><span className="shrink-0 text-muted-foreground">{formatDate(a.created_at)}</span></li>)}</ul>
              </section>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Invites({ team, canManage }: { team: Team | undefined; canManage: boolean }) {
  const refresh = useRefresh();
  const resend = useServerFn(resendInvite);
  const cancel = useServerFn(cancelInvite);
  if (!team) return <ListSkeleton rows={3} />;
  if (team.invites.length === 0) return <EmptyState icon={<UserPlus className="h-5 w-5" />} title="Nenhum convite" text="Convide colaboradores para trabalhar na mesma empresa." />;
  const tone = { pending: "warning", accepted: "success", expired: "neutral", cancelled: "danger" } as const;
  const label = { pending: "Pendente", accepted: "Aceito", expired: "Expirado", cancelled: "Cancelado" } as const;
  return (
    <div className="rounded-xl border divide-y">
      {team.invites.map((i) => (
        <div key={i.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1"><p className="truncate font-medium">{i.full_name ?? i.email}</p><p className="truncate text-sm text-muted-foreground">{i.email} · {ROLE_LABEL[i.role as TeamRole]} · criado {formatDate(i.created_at)}</p></div>
          <StatusBadge tone={tone[i.status as keyof typeof tone]}>{label[i.status as keyof typeof label]}</StatusBadge>
          {canManage && (i.status === "pending" || i.status === "expired") && (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={async () => { try { const r = await resend({ data: { id: i.id } }); await copy(inviteLink(r.token)); refresh(); } catch (e) { toast.error((e as Error).message); } }}>Gerar novo link</Button>
              {i.status === "pending" && <Button size="sm" variant="ghost" onClick={async () => { await cancel({ data: { id: i.id } }); refresh(); }}>Cancelar</Button>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function Roles({ team, canManage }: { team: Team | undefined; canManage: boolean }) {
  const refresh = useRefresh();
  const save = useServerFn(saveCustomRole);
  const remove = useServerFn(deleteCustomRole);
  const [edit, setEdit] = useState<{ id: string | null; name: string; permissions: string[] } | null>(null);
  if (!team) return <ListSkeleton rows={3} />;
  return (
    <div className="space-y-3">
      {canManage && <Button variant="outline" onClick={() => setEdit({ id: null, name: "", permissions: ["dashboard.view"] })}><Plus className="mr-2 h-4 w-4" />Novo cargo</Button>}
      {team.roles.length === 0 ? <EmptyState title="Nenhum cargo personalizado" text="Crie cargos como Atendimento ou Comercial com as permissões certas." /> : (
        <div className="rounded-xl border divide-y">
          {team.roles.map((r) => (
            <div key={r.id} className="flex items-center gap-3 p-4">
              <div className="flex-1"><p className="font-medium">{r.name}</p><p className="text-sm text-muted-foreground">{r.permissions.length} permissões</p></div>
              {canManage && <><Button size="sm" variant="outline" onClick={() => setEdit({ id: r.id, name: r.name, permissions: r.permissions })}>Editar</Button>
                <Button size="sm" variant="ghost" onClick={async () => { await remove({ data: { id: r.id } }); refresh(); }}>Excluir</Button></>}
            </div>
          ))}
        </div>
      )}
      {edit && (
        <Dialog open onOpenChange={(o) => !o && setEdit(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>{edit.id ? "Editar cargo" : "Novo cargo"}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5"><Label>Nome do cargo</Label><Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></div>
              <PermissionMatrix value={edit.permissions} onChange={(p) => setEdit({ ...edit, permissions: p })} allowed={team.me.permissions} critical={false} />
              <Button className="w-full" onClick={async () => { try { await save({ data: edit }); toast.success("Cargo salvo."); setEdit(null); refresh(); } catch (e) { toast.error((e as Error).message); } }}>Salvar cargo</Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function Audit({ team }: { team: Team | undefined }) {
  const fetchAudit = useServerFn(listTeamAudit);
  const q = useQuery({ queryKey: ["team-audit"], queryFn: () => fetchAudit() });
  if (!q.data) return <ListSkeleton rows={5} />;
  const who = (id: string | null) => team?.members.find((m) => m.user_id === id)?.name ?? team?.members.find((m) => m.user_id === id)?.email ?? "Sistema";
  if (q.data.length === 0) return <EmptyState title="Sem registros" />;
  return (
    <div className="rounded-xl border divide-y">
      {q.data.map((a) => (
        <div key={a.id} className="flex flex-col gap-1 p-3 text-sm sm:flex-row sm:items-center sm:gap-3">
          <span className="font-medium sm:w-48 truncate">{who(a.user_id)}</span>
          <span className="flex-1 truncate">{a.action}</span>
          <StatusBadge tone={a.result === "success" ? "success" : "danger"}>{a.result === "success" ? "Sucesso" : a.result === "blocked" ? "Bloqueado" : "Falha"}</StatusBadge>
          <span className="text-muted-foreground">{a.ip_address ?? "—"} · {formatDate(a.created_at)}</span>
        </div>
      ))}
    </div>
  );
}
