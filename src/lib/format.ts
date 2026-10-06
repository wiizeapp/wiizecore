import { currentLocale } from "@/i18n";
import { privacyStore } from "./privacy-store";

export function formatBRL(value: number | string | null | undefined): string {
  if (privacyStore.get()) return "R$ ••••";
  const numeric = typeof value === "string" ? Number(value) : (value ?? 0);
  return new Intl.NumberFormat(currentLocale(), {
    style: "currency",
    currency: "BRL",
  }).format(Number.isFinite(numeric) ? numeric : 0);
}

export function formatPercent(value: number | string | null | undefined): string {
  const numeric = typeof value === "string" ? Number(value) : (value ?? 0);
  return `${new Intl.NumberFormat(currentLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    Number.isFinite(numeric) ? numeric : 0,
  )}%`;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  // Datas sem horário (vencimento) são datas de calendário: não converter fuso, senão 05/10 vira 04/10.
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(currentLocale(), { dateStyle: "short" }).format(date);
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(currentLocale(), { dateStyle: "short", timeStyle: "short" }).format(date);
}

export function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

export function formatDocument(value: string | null | undefined): string {
  if (!value) return "—";
  const digits = onlyDigits(value);
  if (digits.length === 11) {
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  }
  if (digits.length === 14) {
    return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  }
  return value;
}

export function isValidCPF(value: string): boolean {
  const digits = onlyDigits(value);
  if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) return false;
  const calc = (slice: number) => {
    let sum = 0;
    for (let i = 0; i < slice; i += 1) sum += Number(digits[i]) * (slice + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return calc(9) === Number(digits[9]) && calc(10) === Number(digits[10]);
}

export function isValidCNPJ(value: string): boolean {
  const digits = onlyDigits(value);
  if (digits.length !== 14 || /^(\d)\1{13}$/.test(digits)) return false;
  const calc = (length: number) => {
    let position = length - 7;
    let sum = 0;
    for (let i = 0; i < length; i += 1) {
      sum += Number(digits[i]) * position;
      position -= 1;
      if (position < 2) position = 9;
    }
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  return calc(12) === Number(digits[12]) && calc(13) === Number(digits[13]);
}
