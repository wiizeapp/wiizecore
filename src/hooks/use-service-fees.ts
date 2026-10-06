import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listPublicFees } from "@/lib/fees.functions";

/** Tarifas de serviços (nota fiscal, saque) vindas da configuração central. */
export function useServiceFees() {
  const fn = useServerFn(listPublicFees);
  const q = useQuery({ queryKey: ["public-fees"], queryFn: () => fn(), staleTime: 300_000 });
  return q.data?.serviceFees ?? null;
}
