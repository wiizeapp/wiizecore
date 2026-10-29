import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export function BirthDateField({ value, onChange }: { value: string; onChange: (date: string) => void }) {
  const { t } = useTranslation("ui");
  const date = value ? new Date(`${value}T12:00:00`) : undefined;
  return <div className="space-y-2">
    <Label>{t("Data de nascimento de quem assina")}</Label>
    <Popover><PopoverTrigger asChild><Button type="button" variant="outline" className="w-full justify-start gap-2"><CalendarIcon className="size-4" />{date ? format(date, "dd/MM/yyyy") : t("Selecione sua data de nascimento")}</Button></PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" captionLayout="dropdown" startMonth={new Date(1900, 0)} endMonth={new Date()} defaultMonth={date ?? new Date(1990, 0)} selected={date} onSelect={(d) => onChange(d ? format(d, "yyyy-MM-dd") : "")} disabled={{ after: new Date() }} className="pointer-events-auto" /></PopoverContent>
    </Popover>
  </div>;
}