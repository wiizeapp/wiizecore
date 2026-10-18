import paymentPreview from "@/assets/payment-link-preview.png.asset.json";
import { DEPLOY_CONFIG } from "@/lib/deploy-config";

/** Imagem pública exclusiva dos links de pagamento, sem dados do cliente. */
const imageUrl = new URL(paymentPreview.url, DEPLOY_CONFIG.paymentShareAssetOrigin).href;

export const paymentShareMeta = [
  { property: "og:image", content: imageUrl },
  { property: "og:image:secure_url", content: imageUrl },
  { property: "og:image:type", content: paymentPreview.content_type },
  { property: "og:image:width", content: "1200" },
  { property: "og:image:height", content: "675" },
  { name: "twitter:image", content: imageUrl },
];