import { Toaster as Sonner } from "sonner";
import { CheckCircle2, Info, Loader2, TriangleAlert, XCircle } from "lucide-react";

type ToasterProps = React.ComponentProps<typeof Sonner>;

// Avisos com visual único: fundo neutro do tema, faixa e ícone na cor do tipo.
const Toaster = ({ richColors: _ignored, ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      icons={{
        success: <CheckCircle2 className="h-5 w-5 text-success" />,
        error: <XCircle className="h-5 w-5 text-destructive" />,
        warning: <TriangleAlert className="h-5 w-5 text-warning" />,
        info: <Info className="h-5 w-5 text-info" />,
        loading: <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />,
      }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "wz-toast group relative flex w-[360px] items-start gap-3 overflow-hidden rounded-xl border border-border bg-popover py-3.5 pl-4 pr-9 text-popover-foreground shadow-[0_12px_32px_-12px_color-mix(in_oklab,var(--foreground)_35%,transparent)] backdrop-blur",
          title: "text-sm font-semibold leading-5",
          description: "mt-0.5 text-xs leading-relaxed text-muted-foreground",
          icon: "mt-0.5 shrink-0",
          success: "wz-toast-success",
          error: "wz-toast-error",
          warning: "wz-toast-warning",
          info: "wz-toast-info",
          actionButton: "ml-auto shrink-0 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground",
          cancelButton: "shrink-0 rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground",
          closeButton:
            "!absolute !left-auto !right-2 !top-2 !transform-none flex h-6 w-6 items-center justify-center rounded-md !border-0 !bg-transparent text-muted-foreground hover:!bg-muted hover:text-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
