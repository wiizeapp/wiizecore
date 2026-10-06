import { DataLoading } from "@/components/states";

/** Esqueleto mostrado enquanto uma página ainda está abrindo (evita tela vazia). */
export function RoutePending() {
  return (
    <div className="mx-auto grid min-h-[55vh] w-full max-w-[1440px] place-items-center p-6">
      <DataLoading label="Abrindo página" className="min-h-40" />
    </div>
  );
}
