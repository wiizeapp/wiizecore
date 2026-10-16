import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { RoutePending } from "@/components/states/route-pending";

// Após uma nova publicação, arquivos antigos somem: recarrega a página uma vez para buscar a versão nova.
if (typeof window !== "undefined") {
  const KEY = "wp_chunk_reload";
  const reloadOnce = () => {
    const last = Number(sessionStorage.getItem(KEY) ?? 0);
    if (Date.now() - last < 10_000) return;
    sessionStorage.setItem(KEY, String(Date.now()));
    window.location.reload();
  };
  // Não cancelar o evento: o Vite deve rejeitar a importação que falhou.
  // preventDefault() transforma a falha em undefined e quebra lazyRouteComponent
  // ao ler "component", principalmente quando o limite de recarga é atingido.
  window.addEventListener("vite:preloadError", () => { reloadOnce(); });
  window.addEventListener("unhandledrejection", (e) => {
    const msg = String((e.reason as Error)?.message ?? e.reason ?? "");
    if (/Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(msg)) reloadOnce();
  });
}

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadDelay: 40,
    defaultPreloadStaleTime: 30_000,
    defaultPendingComponent: RoutePending,
    defaultPendingMs: 800,
    defaultPendingMinMs: 300,
  });

  return router;
};
