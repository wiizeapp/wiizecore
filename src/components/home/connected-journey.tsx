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
            <svg className="connected-journey-arrows connected-journey-arrows-desktop" viewBox="0 0 1080 330" preserveAspectRatio="none" fill="none" aria-hidden="true">
              <defs>
                <linearGradient id="journey-curve-light" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="var(--journey-highlight)" />
                  <stop offset="1" stopColor="var(--journey-lime)" />
                </linearGradient>
                <linearGradient id="journey-rail-light">
                  <stop offset="0" stopColor="var(--journey-highlight)" stopOpacity="0" />
                  <stop offset="0.3" stopColor="var(--journey-highlight)" stopOpacity="0.3" />
                  <stop offset="0.5" stopColor="var(--journey-lime)" stopOpacity="0.8" />
                  <stop offset="0.7" stopColor="var(--journey-highlight)" stopOpacity="0.3" />
                  <stop offset="1" stopColor="var(--journey-highlight)" stopOpacity="0" />
                </linearGradient>
                <marker id="journey-arrow-desktop" markerWidth="13" markerHeight="13" refX="10" refY="6" orient="auto" markerUnits="userSpaceOnUse">
                  <path d="M2 1L10 6L2 11" />
                </marker>
              </defs>
              <g className="connected-journey-rails">
                <path d="M30 103C105 151 215 159 290 151M790 151C890 161 991 151 1050 106" />
              </g>
              <g markerEnd="url(#journey-arrow-desktop)">
                <path d="M175 76C212 68 245 91 263 119" />
                <path d="M215 237C244 247 270 229 288 205" />
                <path d="M806 112C838 125 871 102 889 76" />
                <path d="M796 204C820 228 839 236 858 224" />
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
              <span className="connected-journey-copy"><Copy className="connected-journey-copy-icon" aria-hidden="true" /></span>
            </div>
          </div>
          <figcaption className="sr-only">{t("Exemplo ilustrativo. Não representa uma conta ou transação real.")}</figcaption>
        </figure>
      </div>
    </section>
  );
}
