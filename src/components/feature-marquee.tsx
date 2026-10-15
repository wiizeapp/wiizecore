import { Boxes } from "lucide-react";
import brandLogoUrl from "@/assets/wiizepay-logo.png";
const brandLogo = { url: brandLogoUrl };
import wiizeLogoUrl from "@/assets/ecosystem-wiize.png";
const wiizeLogo = { url: wiizeLogoUrl };
import metaLogoUrl from "@/assets/ecosystem-meta.png";
const metaLogo = { url: metaLogoUrl };
import asaasLogoUrl from "@/assets/ecosystem-asaas.png";
const asaasLogo = { url: asaasLogoUrl };
import asaasWhiteLogoUrl from "@/assets/ecosystem-asaas-white.png";
const asaasWhiteLogo = { url: asaasWhiteLogoUrl };
import resendLogoUrl from "@/assets/ecosystem-resend.png";
const resendLogo = { url: resendLogoUrl };
import vercelDarkLogoUrl from "@/assets/ecosystem-vercel-dark.png";
const vercelDarkLogo = { url: vercelDarkLogoUrl };
import metaDarkLogoUrl from "@/assets/ecosystem-meta-dark.png";
const metaDarkLogo = { url: metaDarkLogoUrl };
import whatsappDarkLogoUrl from "@/assets/ecosystem-whatsapp-dark.png";
const whatsappDarkLogo = { url: whatsappDarkLogoUrl };
import resendDarkLogoUrl from "@/assets/ecosystem-resend-dark.png";
const resendDarkLogo = { url: resendDarkLogoUrl };
import wiizeWordmarkDarkLogoUrl from "@/assets/ecosystem-wiize-wordmark-dark.png";
const wiizeWordmarkDarkLogo = { url: wiizeWordmarkDarkLogoUrl };
import { Marquee } from "@/components/ui/marquee";

const items = [
  { label: "Wiize", logo: wiizeLogo.url, darkLogo: wiizeWordmarkDarkLogo.url, withBrandMark: true },
  { label: "Asaas", logo: asaasLogo.url, darkLogo: asaasWhiteLogo.url },
  { label: "Meta", logo: metaLogo.url, darkLogo: metaDarkLogo.url },
  { label: "WhatsApp", logo: whatsappDarkLogo.url, darkLogo: whatsappDarkLogo.url },
  { label: "Resend", logo: resendLogo.url, darkLogo: resendDarkLogo.url },
  { label: "Vercel", logo: vercelDarkLogo.url, darkLogo: vercelDarkLogo.url },
];

function EcosystemMark({ item, compact = false }: { item: (typeof items)[number]; compact?: boolean }) {
  const isWhatsApp = item.label === "WhatsApp";
  const logoClass = compact ? "h-4 max-w-12 object-contain" : `${isWhatsApp ? "h-8 sm:h-9" : "h-7"} max-w-28 object-contain`;
  return (
    <span className="inline-flex items-center gap-1.5">
      {item.withBrandMark ? <img src={brandLogo.url} alt="" className={compact ? "size-4 rounded-sm" : "size-7 rounded-md"} /> : null}
      <img src={item.logo} alt="" className={`${logoClass} dark:hidden`} />
      <img src={item.darkLogo ?? item.logo} alt="" className={`${logoClass} hidden dark:block`} />
    </span>
  );
}

export function EcosystemBadge() {
  return (
    <div className="inline-flex max-w-full items-center gap-3 rounded-full border border-border bg-card/85 px-3 py-2 shadow-card backdrop-blur-xl">
      <div className="flex -space-x-2" aria-hidden="true">
        {items.slice(0, 4).map((item) => <span key={item.label} className="grid size-8 place-items-center overflow-hidden rounded-full border-2 border-card bg-card px-1 text-foreground"><EcosystemMark item={item} compact /></span>)}
      </div>
      <Boxes className="size-4 shrink-0 text-primary" aria-hidden="true" />
    </div>
  );
}

export function FeatureMarquee() {
  return (
    <section className="border-y border-border bg-surface py-10 sm:py-14" aria-label="Ecossistema Wiize Core">
      <Marquee pauseOnHover speed={30} className="mt-0">
        {items.map((item) => (
          <div key={item.label} className="flex h-12 w-40 shrink-0 items-center justify-center px-6 sm:w-56 sm:px-10">
            <span className="transition-opacity duration-300 hover:opacity-70">
              <EcosystemMark item={item} />
            </span>
          </div>
        ))}
      </Marquee>
    </section>
  );
}