import { createFileRoute, notFound, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { OnboardingGate } from "@/components/onboarding-gate";
import { MandatoryMfaGate } from "@/components/mandatory-mfa-gate";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow" }] }),
  beforeLoad: async ({ location }) => {
    // Sessão local (rápida); o servidor valida o acesso em cada operação.
    const { data } = await supabase.auth.getSession();
    const user = data.session?.user;
    if (!user) {
      if (location.pathname === "/nimda") throw notFound();
      throw redirect({ to: "/auth" });
    }
    // 2FA cadastrado: nada abre antes de confirmar o código do autenticador nesta sessão.
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2") throw redirect({ to: "/auth" });
    return { user };
  },
  component: () => (
    // Ordem obrigatória: 2FA configurado e confirmado → onboarding → painel. O servidor repete as mesmas checagens.
    <MandatoryMfaGate>
      <OnboardingGate>
        <AppShell><Outlet /></AppShell>
      </OnboardingGate>
    </MandatoryMfaGate>
  ),
});
