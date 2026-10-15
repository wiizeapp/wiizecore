import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { acceptInvite, getInvite } from "@/lib/team.functions";
import { ROLE_LABEL } from "@/lib/permissions";
import { assertStrongPassword } from "@/lib/password-policy";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/convite/$token")({
  head: () => ({
    meta: [
      { title: "Convite para equipe — Wiize Recebe" },
      { name: "description", content: "Aceite o convite para entrar na equipe de uma empresa na Wiize Recebe." },
      { property: "og:title", content: "Convite para equipe — Wiize Recebe" },
      { property: "og:description", content: "Entre na equipe da sua empresa na Wiize Recebe." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: InvitePage,
});

function InvitePage() {
  const { t: ui } = useTranslation("ui");
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const fetchInvite = useServerFn(getInvite);
  const accept = useServerFn(acceptInvite);
  const { data: invite, isLoading } = useQuery({ queryKey: ["invite", token], queryFn: () => fetchInvite({ data: { token } }) });
  const [userEmail, setUserEmail] = useState<string | null | undefined>(undefined);
  const [mode, setMode] = useState<"signup" | "login">("signup");
  const [password, setPassword] = useState("");
  const [terms, setTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => setUserEmail(data.user?.email?.toLowerCase() ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setUserEmail(s?.user?.email?.toLowerCase() ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (isLoading || userEmail === undefined) return <Shell><p className="text-muted-foreground">Carregando convite…</p></Shell>;
  if (!invite?.found) return <Shell><h1 className="text-xl font-semibold">Convite não encontrado</h1><p className="text-muted-foreground mt-2">Peça um novo convite para quem administra a empresa.</p></Shell>;
  if (invite.status !== "pending")
    return (
      <Shell>
        <h1 className="text-xl font-semibold">{invite.status === "accepted" ? "Convite já utilizado" : invite.status === "expired" ? "Convite expirado" : "Convite cancelado"}</h1>
        <p className="text-muted-foreground mt-2">Se precisar, peça um novo convite.</p>
        <Button asChild className="mt-4"><Link to="/auth">Ir para o login</Link></Button>
      </Shell>
    );

  const join = async () => {
    setBusy(true);
    try {
      await accept({ data: { token } });
      toast.success(`Você entrou na equipe de ${invite.company}.`);
      void navigate({ to: "/painel" });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (!terms) { toast.error("Aceite os termos para continuar."); return; }
    setBusy(true);
    try {
      if (mode === "signup") {
        assertStrongPassword(password, "A senha");
        const { data, error } = await supabase.auth.signUp({
          email: invite.email,
          password,
          options: { emailRedirectTo: window.location.href, data: { full_name: invite.fullName ?? undefined } },
        });
        if (error) throw error;
        if (data.user && (data.user.identities?.length ?? 0) === 0) throw new Error("Este e-mail já tem conta. Faça login.");
        if (!data.session) setSent(true);
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: invite.email, password });
        if (error) throw new Error("E-mail ou senha incorretos.");
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell>
      <p className="text-sm text-primary font-medium">Convite para equipe</p>
      <h1 className="mt-1 text-2xl font-semibold">{invite.company}</h1>
      <p className="mt-2 text-muted-foreground">
        {invite.fullName ? `${invite.fullName}, você` : "Você"} foi convidado como <strong className="text-foreground">{ROLE_LABEL[invite.role]}</strong>.
      </p>
      {userEmail === invite.email ? (
        <Button className="mt-6 w-full" disabled={busy} onClick={join}>Entrar na equipe</Button>
      ) : userEmail ? (
        <div className="mt-6 space-y-3">
          <p className="text-sm text-muted-foreground">Você está conectado com outro e-mail. Saia e entre com {invite.email}.</p>
          <Button variant="outline" className="w-full" onClick={() => void supabase.auth.signOut()}>Sair desta conta</Button>
        </div>
      ) : sent ? (
        <p className="mt-6 rounded-lg border p-4 text-sm">Enviamos um e-mail para <strong>{invite.email}</strong>. Confirme o endereço e você voltará para esta página para entrar na equipe.</p>
      ) : (
        <div className="mt-6 space-y-4">
          <div className="flex gap-2 rounded-lg bg-muted p-1 text-sm">
            <button className={`flex-1 rounded-md py-1.5 ${mode === "signup" ? "bg-background shadow" : ""}`} onClick={() => setMode("signup")}>Criar senha</button>
            <button className={`flex-1 rounded-md py-1.5 ${mode === "login" ? "bg-background shadow" : ""}`} onClick={() => setMode("login")}>Já tenho conta</button>
          </div>
          <div className="space-y-1.5"><Label>{ui("E-mail")}</Label><Input value={invite.email} disabled /></div>
          <div className="space-y-1.5">
            <Label>{mode === "signup" ? "Crie uma senha" : "Senha"}</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            {mode === "signup" && <p className="text-xs text-muted-foreground">Mínimo de 10 caracteres, com maiúscula, minúscula e símbolo.</p>}
          </div>
          <label className="flex items-start gap-2 text-sm">
            <Checkbox checked={terms} onCheckedChange={(v) => setTerms(v === true)} />
            <span>Li e aceito os <Link to="/termos-de-uso" className="underline">Termos de Uso</Link> e a <Link to="/politica-de-privacidade" className="underline">Política de Privacidade</Link>.</span>
          </label>
          <Button className="w-full" disabled={busy} onClick={submit}>{mode === "signup" ? "Criar conta" : "Entrar"}</Button>
          <p className="text-xs text-muted-foreground">Depois de entrar, você pode ativar a verificação em duas etapas em Segurança.</p>
        </div>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border bg-card p-6 sm:p-8">{children}</div>
    </div>
  );
}
