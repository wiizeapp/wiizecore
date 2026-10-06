import { createFileRoute, notFound, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { OnboardingGate } from "@/components/onboarding-gate";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      if (location.pathname === "/nimda") throw notFound();
      throw redirect({ to: "/auth" });
    }
    // 2FA ativo: nada abre antes de confirmar o código do autenticador.
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2") throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: () => (
    <OnboardingGate>
      <AppShell><Outlet /></AppShell>
    </OnboardingGate>
  ),
});
