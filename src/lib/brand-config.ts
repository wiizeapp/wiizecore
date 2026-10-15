export const BRAND_CONFIG = {
  brandName: "Wiize",
  productName: "Wiize Recebe",
  displayName: "Wiize Recebe",
  siteDomain: "wiize.com.br",
  contactEmail: "wiizepay@gmail.com",
  legal: {
    legalName: null as string | null,
    document: null as string | null,
    address: null as string | null,
    cityState: null as string | null,
    postalCode: null as string | null,
    dataOfficerName: null as string | null,
  },
} as const;

export const LEGAL_VERSION = "1.1";
export const LEGAL_PUBLISHED_AT = "25 de setembro de 2026";
export const LEGAL_UPDATED_AT = "15 de outubro de 2026";

export function supportMailto(subject?: string) {
  const query = subject ? `?subject=${encodeURIComponent(subject)}` : "";
  return `mailto:${BRAND_CONFIG.contactEmail}${query}`;
}