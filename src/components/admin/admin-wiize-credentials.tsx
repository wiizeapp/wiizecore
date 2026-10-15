import { DEPLOY_CONFIG } from "@/lib/deploy-config";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { provisionWiizeClient } from "@/lib/wiize-pay-oauth.functions";
import { ensureTwoFactor, getMfaState } from "@/lib/mfa-step-up";

const BASE = DEPLOY_CONFIG.publicSiteUrl;

export function AdminWiizeCredentials() {
  const provision = useServerFn(provisionWiizeClient);
  const [result, setResult] = useState<string | null>(null);
  const m = useMutation({
    mutationFn: async () => {
      if (!window.confirm("Gerar novas credenciais do Wiize? Se já existirem, o segredo antigo continua valendo por 24 h.")) throw new Error("Cancelado.");
      const mfa = await getMfaState();
      const code = mfa.factorId && !mfa.isAal2 ? window.prompt("Digite o código de 6 dígitos do autenticador") ?? "" : "";
      await ensureTwoFactor(code);
      return provision();
    },
    onSuccess: (r) => {
      setResult([
        `WIIZE_PAY_AUTHORIZE_URL=${BASE}/oauth/authorize`,
        `WIIZE_PAY_TOKEN_URL=${BASE}/api/public/oauth/token`,
        `WIIZE_PAY_REVOKE_URL=${BASE}/api/public/oauth/revoke`,
        `WIIZE_PAY_API_BASE_URL=${BASE}/api/public/v1`,
        `WIIZE_PAY_CHECKOUT_ORIGIN=${BASE}`,
        `WIIZE_PAY_CLIENT_ID=${r.clientId}`,
        `WIIZE_PAY_CLIENT_SECRET=${r.clientSecret}`,
        `WIIZE_PAY_WEBHOOK_SECRET=${r.webhookSecret}`,
      ].join("\n"));
      toast.success(r.rotated ? "Novo segredo gerado." : "Credenciais criadas.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  return (
    <section className="surface-panel space-y-4 p-5">
      <div>
        <h2 className="font-display text-base font-semibold">Integração Wiize (CRM)</h2>
        <p className="mt-1 text-xs text-muted-foreground">Gera as credenciais para o Wiize se conectar à Wiize Recebe. O segredo aparece só uma vez: copie e guarde no Wiize.</p>
      </div>
      <Button onClick={() => m.mutate()} disabled={m.isPending}>{m.isPending ? "Gerando…" : "Gerar credenciais do Wiize"}</Button>
      {result ? (
        <div className="space-y-2">
          <pre className="overflow-x-auto rounded-lg border border-border bg-card p-4 text-xs">{result}</pre>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => { void navigator.clipboard.writeText(result); toast.success("Copiado."); }}>Copiar tudo</Button>
            <Button variant="ghost" onClick={() => setResult(null)}>Já salvei, ocultar</Button>
          </div>
          <p className="text-xs text-muted-foreground">Cole cada valor no campo de mesmo nome no Wiize. A chave dos avisos já fica guardada aqui automaticamente.</p>
        </div>
      ) : null}
    </section>
  );
}
