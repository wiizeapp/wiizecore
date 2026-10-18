import { BRAND_CONFIG } from "@/lib/brand-config";
import { DEPLOY_CONFIG } from "@/lib/deploy-config";

/** Único ponto de montagem de metadados públicos (title, canonical, Open Graph, JSON-LD). */
export const SITE_URL = DEPLOY_CONFIG.publicSiteUrl.replace(/\/$/, "");
export const absoluteUrl = (path: string) => new URL(path, SITE_URL + "/").href;

export const BRAND_DESCRIPTION =
  "A WiizeCore é uma plataforma de software que integra pagamentos, cobranças, clientes, contratos e gestão financeira para prestadores de serviços. O processamento dos pagamentos é feito por infraestrutura de pagamentos de terceiros (Asaas).";

type Crumb = { name: string; path: string };
type PageHeadInput = {
  path: string;
  title: string;
  description: string;
  ogTitle?: string;
  ogDescription?: string;
  type?: "website" | "article";
  breadcrumb?: Crumb[];
  jsonLd?: Record<string, unknown>[];
};

export function breadcrumbJsonLd(items: Crumb[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [{ name: "Início", path: "/" }, ...items].map((item, i) => ({
      "@type": "ListItem", position: i + 1, name: item.name, item: absoluteUrl(item.path),
    })),
  };
}

export function organizationJsonLd() {
  return [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: BRAND_CONFIG.displayName,
      url: SITE_URL + "/",
      logo: absoluteUrl("/favicon.png"),
      description: BRAND_DESCRIPTION,
      email: BRAND_CONFIG.contactEmail,
      contactPoint: { "@type": "ContactPoint", contactType: "customer support", email: BRAND_CONFIG.contactEmail, availableLanguage: ["pt-BR"] },
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      name: BRAND_CONFIG.displayName,
      url: SITE_URL + "/",
      inLanguage: "pt-BR",
      publisher: { "@id": `${SITE_URL}/#organization` },
    },
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: BRAND_CONFIG.displayName,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      url: SITE_URL + "/",
      description: BRAND_DESCRIPTION,
      publisher: { "@id": `${SITE_URL}/#organization` },
    },
  ];
}

export function faqJsonLd(faqs: Array<[string, string]>) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
  };
}

export function pageHead(input: PageHeadInput) {
  const url = absoluteUrl(input.path);
  const ogTitle = input.ogTitle ?? input.title;
  const ogDescription = input.ogDescription ?? input.description;
  const ld = [...(input.jsonLd ?? [])];
  if (input.breadcrumb?.length) ld.push(breadcrumbJsonLd(input.breadcrumb));
  return {
    meta: [
      { title: input.title },
      { name: "description", content: input.description },
      { property: "og:title", content: ogTitle },
      { property: "og:description", content: ogDescription },
      { property: "og:type", content: input.type ?? "website" },
      { property: "og:url", content: url },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: ogTitle },
      { name: "twitter:description", content: ogDescription },
    ],
    links: [{ rel: "canonical", href: url }],
    scripts: ld.map((data) => ({ type: "application/ld+json", children: JSON.stringify(data) })),
  };
}
