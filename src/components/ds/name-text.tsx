import { cn } from "@/lib/utils";

/** Limits long customer/contract names: one line with ellipsis, full name on hover. */
export function NameText({ children, className, max = "max-w-[16rem]" }: { children: string | null | undefined; className?: string; max?: string }) {
  const value = children ?? "—";
  return <span title={value} className={cn("inline-block min-w-0 truncate align-bottom", max, className)}>{value}</span>;
}
