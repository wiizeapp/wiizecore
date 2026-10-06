import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ensureWorkspace } from "@/lib/workspace.functions";

export function useWorkspace() {
  const ensure = useServerFn(ensureWorkspace);
  return useQuery({
    queryKey: ["workspace"],
    queryFn: () => ensure({ data: {} }),
    staleTime: 60_000,
  });
}
