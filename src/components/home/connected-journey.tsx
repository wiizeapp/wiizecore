import { Copy, CreditCard, FileChartColumn, FileSignature, Link2, UserRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import "./connected-journey.css";

const stages = [
  { position: "details", icon: UserRound, label: "Dados da contratação" },
  { position: "contract", icon: FileSignature, label: "Assinatura do contrato" },
  { position: "payment", icon: CreditCard, label: "Pagamento confirmado" },
  { position: "documents", icon: FileChartColumn, label: "Próximas cobranças e documentos" },
];

/** Static illustration only. The sample URL is not an active checkout or copy action. */
export function ConnectedJourneySection() {
  const { t } = useTranslation("ui");
  return (
    <section className="connected-journey" aria-labelledby="connected-journey-title">
      <div className="section-shell">
        <div className="connected-journey-intro">
          <h2 id="connected-journey-title">
            {t("Da contratação às próximas cobranças,")} <span>{t("tudo conectado.")}</span>
          </h2>
          <p>{t("Um único link conecta as etapas da jornada do seu cliente, do preenchimento dos dados e assinatura do contrato ao pagamento e ao acesso às informações da cobrança.")}</p>
        </div>
        <figure className="connected-journey-figure">
          <div className="connected-journey-map">
            <svg className="connected-journey-arrows connected-journey-arrows-desktop" viewBox="0 0 1080 360" fill="none" aria-hidden="true">
              <defs>
                <marker id="journey-arrow-desktop" markerWidth="9" markerHeight="9" refX="7" refY="4" orient="auto" markerUnits="userSpaceOnUse">
                  <path d="M1 1L7 4L1 7" />
                </marker>
              </defs>
              <g markerEnd="url(#journey-arrow-desktop)">
                <path d="M155 95C155 136 222 125 265 151" />
                <path d="M155 265C155 226 222 235 265 209" />
                <path d="M795 163C858 125 925 144 925 95" />
                <path d="M795 197C858 235 925 218 925 265" />
              </g>
            </svg>
            <svg className="connected-journey-arrows connected-journey-arrows-mobile" viewBox="0 0 320 516" preserveAspectRatio="none" fill="none" aria-hidden="true">
              <defs>
                <marker id="journey-arrow-mobile" markerWidth="9" markerHeight="9" refX="7" refY="4" orient="auto" markerUnits="userSpaceOnUse">
                  <path d="M1 1L7 4L1 7" />
                </marker>
              </defs>
              <g markerEnd="url(#journey-arrow-mobile)">
                <path d="M22 64C2 88 2 180 22 213" />
                <path d="M40 165C24 177 24 193 40 210" />
                <path d="M290 280C314 296 314 318 290 340" />
                <path d="M302 279C324 331 314 409 292 441" />
              </g>
            </svg>
            {stages.map(({ position, icon: Icon, label }) => (
              <div key={position} className={`connected-journey-stage connected-journey-stage-${position}`}>
                <span className="connected-journey-stage-icon"><Icon aria-hidden="true" /></span>
                <h3>{t(label)}</h3>
              </div>
            ))}
            <div className="connected-journey-link">
              <Link2 className="connected-journey-link-icon" aria-hidden="true" />
              <span className="connected-journey-url">https://pagamento.wiizepay.com/<wbr /><strong>seucliente</strong></span>
              <Copy className="connected-journey-copy-icon" aria-hidden="true" />
            </div>
          </div>
          <figcaption className="sr-only">{t("Exemplo ilustrativo. Não representa uma conta ou transação real.")}</figcaption>
        </figure>
      </div>
    </section>
  );
}
