import { z } from "zod";
import { validCnpj, validCpf } from "./doc-validation";

export const BRAZIL_STATES = [
  ["AC", "Acre"], ["AL", "Alagoas"], ["AP", "Amapá"], ["AM", "Amazonas"], ["BA", "Bahia"], ["CE", "Ceará"],
  ["DF", "Distrito Federal"], ["ES", "Espírito Santo"], ["GO", "Goiás"], ["MA", "Maranhão"], ["MT", "Mato Grosso"],
  ["MS", "Mato Grosso do Sul"], ["MG", "Minas Gerais"], ["PA", "Pará"], ["PB", "Paraíba"], ["PR", "Paraná"],
  ["PE", "Pernambuco"], ["PI", "Piauí"], ["RJ", "Rio de Janeiro"], ["RN", "Rio Grande do Norte"],
  ["RS", "Rio Grande do Sul"], ["RO", "Rondônia"], ["RR", "Roraima"], ["SC", "Santa Catarina"],
  ["SP", "São Paulo"], ["SE", "Sergipe"], ["TO", "Tocantins"],
] as const;

const str = (max = 200) => z.string().trim().max(max).optional().default("");
export const activationFormSchema = z.object({
  fullName: str(), cpf: str(20), birthDate: str(10), email: str(200), phone: str(20),
  zipCode: str(10), address: str(), number: str(20), complement: str(), district: str(), city: str(),
  state: z.string().trim().toUpperCase().max(2).optional().default(""),
  legalName: str(), tradeName: str(), cnpj: str(20), companyType: str(40), openedOn: str(10),
  monthlyRevenue: str(40), businessModel: str(1000), paymentSources: str(1000), expectedVolume: str(40),
  legalRepName: str(), legalRepCpf: str(20), legalRepRole: str(80),
}).strict();

export type ActivationForm = z.infer<typeof activationFormSchema>;
export const REQUIRED_DOCS = {
  individual: ["id_front", "id_back", "selfie"],
  company: ["id_front", "id_back", "selfie", "company_doc", "legal_rep_doc"],
} as const;

export function validateActivationStep(personType: "individual" | "company" | null, form: ActivationForm, step: number) {
  const errors: Record<string, string> = {};
  const need = (key: keyof ActivationForm, label: string) => { if (!form[key]?.trim()) errors[key] = `Preencha ${label.toLowerCase()}.`; };
  if (step === 0 && !personType) errors['personType'] = "Escolha Pessoa Física ou Pessoa Jurídica.";
  const common: [keyof ActivationForm, string][][] = [
    [["fullName", "nome completo"], ["cpf", "CPF"], ["birthDate", "data de nascimento"], ["phone", "celular com DDD"]],
    [["zipCode", "CEP"], ["address", "rua ou avenida"], ["number", "número"], ["district", "bairro"], ["city", "cidade"], ["state", "Estado"]],
    [["monthlyRevenue", "faturamento mensal"], ["expectedVolume", "valor mensal esperado"], ["businessModel", "serviço prestado"], ["paymentSources", "formas de pagamento dos clientes"]],
  ];
  for (const [key, label] of common[step - 1] ?? []) need(key, label);
  if (step === 1 && personType === "company") {
    for (const [key, label] of [["legalName", "razão social"], ["cnpj", "CNPJ"], ["companyType", "tipo de empresa"], ["openedOn", "data de abertura"], ["legalRepName", "nome do responsável legal"], ["legalRepCpf", "CPF do responsável legal"]] as [keyof ActivationForm, string][]) need(key, label);
  }
  if (step === 1 && form['cpf'] && !validCpf(form['cpf'])) errors['cpf'] = "Informe um CPF válido.";
  if (step === 1 && personType === "company" && form['cnpj'] && !validCnpj(form['cnpj'])) errors['cnpj'] = "Informe um CNPJ válido.";
  if (step === 1 && personType === "company" && form['legalRepCpf'] && !validCpf(form['legalRepCpf'])) errors['legalRepCpf'] = "Informe um CPF válido.";
  if (step === 2 && form['state'] && !BRAZIL_STATES.some(([uf]) => uf === form['state'])) errors['state'] = "Selecione um Estado válido.";
  return errors;
}

export function formatBRLInput(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 15);
  return digits ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(digits) / 100) : "";
}