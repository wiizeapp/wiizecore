import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Options = { title: string; description?: string; confirmText?: string; cancelText?: string; destructive?: boolean };
type Pending = Options & { resolve: (v: boolean) => void };

let open: ((p: Pending) => void) | null = null;

/** Confirmação própria da WiizePay (substitui a caixa padrão do navegador). */
export function confirmAction(options: Options): Promise<boolean> {
  return new Promise((resolve) => {
    if (!open) return resolve(false);
    open({ ...options, resolve });
  });
}

export function ConfirmDialogHost() {
  const [pending, setPending] = useState<Pending | null>(null);
  useEffect(() => {
    open = setPending;
    return () => {
      open = null;
    };
  }, []);
  const close = (v: boolean) => {
    pending?.resolve(v);
    setPending(null);
  };
  return (
    <AlertDialog open={!!pending} onOpenChange={(o) => !o && close(false)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <AlertDialogTitle>{pending?.title}</AlertDialogTitle>
          {pending?.description ? <AlertDialogDescription>{pending.description}</AlertDialogDescription> : null}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => close(false)}>{pending?.cancelText ?? "Voltar"}</AlertDialogCancel>
          <AlertDialogAction
            className={pending?.destructive ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined}
            onClick={() => close(true)}
          >
            {pending?.confirmText ?? "Confirmar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
