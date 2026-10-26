import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/app-shell";
import { FormSection } from "@/components/ds";
import { ThemePicker } from "@/components/theme-picker";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/_authenticated/perfil")({
  head: () => ({
    meta: [
      { title: "Meu perfil — WiizePay" },
      { name: "description", content: "Seu nome, foto de perfil e tema da interface na WiizePay." },
      { property: "og:title", content: "Meu perfil — WiizePay" },
      { property: "og:description", content: "Seu nome, foto de perfil e tema da interface na WiizePay." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PerfilPage,
});

function PerfilPage() {
  const { t: ui } = useTranslation("ui");
  const { user } = useAuth();
  const meta = user?.user_metadata ?? {};
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const avatar = typeof meta["avatar_url"] === "string" ? meta["avatar_url"] : typeof meta["picture"] === "string" ? meta["picture"] : undefined;

  useEffect(() => {
    setName(typeof meta["full_name"] === "string" ? meta["full_name"] : "");
  }, [meta["full_name"]]);

  const initials = (name || user?.email || "WP").split(/[\s@]+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");

  async function saveName() {
    const trimmed = name.trim();
    if (trimmed.length < 2 || trimmed.length > 80) { toast.error("Informe um nome entre 2 e 80 caracteres."); return; }
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ data: { full_name: trimmed } });
    setSaving(false);
    if (error) toast.error("Não foi possível salvar o nome. Tente novamente.");
    else toast.success("Nome atualizado.");
  }

  async function uploadPhoto(file: File) {
    if (!user) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) { toast.error("Envie uma imagem PNG, JPG ou WEBP."); return; }
    if (file.size > 2 * 1024 * 1024) { toast.error("A imagem deve ter no máximo 2 MB."); return; }
    setUploading(true);
    try {
      const ext = file.type.split("/")[1];
      const path = `${user.id}/avatar-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data, error: urlErr } = await supabase.storage.from("avatars").createSignedUrl(path, 60 * 60 * 24 * 365);
      if (urlErr || !data) throw urlErr;
      const old = typeof meta["avatar_path"] === "string" ? meta["avatar_path"] : null;
      const { error } = await supabase.auth.updateUser({ data: { avatar_url: data.signedUrl, avatar_path: path } });
      if (error) throw error;
      if (old) void supabase.storage.from("avatars").remove([old]);
      toast.success("Foto atualizada.");
    } catch {
      toast.error("Não foi possível enviar a foto. Tente novamente.");
    } finally {
      setUploading(false);
    }
  }

  async function removePhoto() {
    const old = typeof meta["avatar_path"] === "string" ? meta["avatar_path"] : null;
    const { error } = await supabase.auth.updateUser({ data: { avatar_url: null, avatar_path: null } });
    if (error) { toast.error("Não foi possível remover a foto."); return; }
    if (old) void supabase.storage.from("avatars").remove([old]);
    toast.success("Foto removida.");
  }

  return (
    <div className="space-y-6">
      <PageHeader title={ui("Meu perfil")} description="Configurações pessoais da sua conta." />

      <FormSection title={ui("Foto de perfil")} description="Aparece no menu lateral. PNG, JPG ou WEBP até 2 MB.">
        <div className="flex flex-wrap items-center gap-4">
          <div className="grid size-20 place-items-center overflow-hidden rounded-2xl bg-primary font-display text-xl font-bold text-primary-foreground">
            {avatar ? <img src={avatar} alt="Sua foto de perfil" className="size-full object-cover" /> : initials}
          </div>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadPhoto(f); e.target.value = ""; }} />
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}>
              <Camera className="size-4" /> {uploading ? "Enviando..." : "Trocar foto"}
            </Button>
            {avatar ? <Button type="button" variant="ghost" onClick={() => void removePhoto()}><Trash2 className="size-4" />  {ui("Remover")}</Button> : null}
          </div>
        </div>
      </FormSection>

      <FormSection title={ui("Dados pessoais")} description="Seu nome dentro da plataforma.">
        <div className="grid max-w-md gap-4">
          <div className="grid gap-2">
            <Label htmlFor="full-name">{ui("Nome")}</Label>
            <Input id="full-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder={ui("Seu nome")} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="email">{ui("E-mail")}</Label>
            <Input id="email" value={user?.email ?? ""} disabled />
          </div>
          <div><Button type="button" onClick={() => void saveName()} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button></div>
        </div>
      </FormSection>

      <FormSection title={ui("Idioma")} description="Escolha o idioma da sua conta em todos os dispositivos.">
        <LanguageSwitcher align="start" />
      </FormSection>

      <FormSection title={ui("Tema")} description="Escolha as cores da sua área interna.">
        <ThemePicker />
      </FormSection>
    </div>
  );
}
