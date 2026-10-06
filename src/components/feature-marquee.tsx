import { Boxes } from "lucide-react";
import brandLogo from "@/assets/wiizepay-logo.png.asset.json";
import wiizeLogo from "@/assets/ecosystem-wiize.png.asset.json";
import metaLogo from "@/assets/ecosystem-meta.png.asset.json";
import asaasLogo from "@/assets/ecosystem-asaas.png.asset.json";
import asaasWhiteLogo from "@/assets/ecosystem-asaas-white.png.asset.json";
import resendLogo from "@/assets/ecosystem-resend.png.asset.json";
import vercelDarkLogo from "@/assets/ecosystem-vercel-dark.png.asset.json";
import metaDarkLogo from "@/assets/ecosystem-meta-dark.png.asset.json";
import whatsappDarkLogo from "@/assets/ecosystem-whatsapp-dark.png.asset.json";
import resendDarkLogo from "@/assets/ecosystem-resend-dark.png.asset.json";
import wiizeWordmarkDarkLogo from "@/assets/ecosystem-wiize-wordmark-dark.png.asset.json";
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
    <section className="border-y border-border bg-surface py-10 sm:py-14" aria-label="Ecossistema WiizePay">
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