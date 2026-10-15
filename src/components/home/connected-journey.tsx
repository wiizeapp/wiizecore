import { Copy, Link2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import "./connected-journey.css";

const stages = [
  { position: "details", label: "Dados da contratação" },
  { position: "contract", label: "Assinatura do contrato" },
  { position: "payment", label: "Pagamento confirmado" },
  { position: "documents", label: "Próximas cobranças e documentos" },
];

const mobileSteps = [
  { title: "Dados da contratação", sub: "Informações do cliente e do serviço" },
  { title: "Assinatura do contrato", sub: "Formalização da contratação" },
  { title: "Pagamento", sub: "Checkout e confirmação" },
  { title: "Próximas cobranças e documentos", sub: "Acesso à área do cliente" },
];

/** Static illustration only. The sample URL is not an active checkout or copy action. */
export function ConnectedJourneySection() {
  const { t } = useTranslation("ui");
  return (
    <section className="connected-journey" aria-labelledby="connected-journey-title">
      <div className="section-shell">
        <div className="connected-journey-intro">
          <h2 id="connected-journey-title">
            {t("Da contratação às próximas cobranças,")} <span className="hero-shine">{t("tudo conectado.")}</span>
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
                <path d="M175 66C200 74 216 96 228 128" />
                <path d="M240 226C258 226 270 216 278 204" />
                <path d="M960 64C930 76 884 98 856 132" />
                <path d="M940 240C910 214 884 190 856 174" />
              </g>
            </svg>
            <svg className="connected-journey-arrows connected-journey-arrows-mobile" viewBox="0 0 320 516" preserveAspectRatio="none" fill="none" aria-hidden="true">
              <defs>
                <marker id="journey-arrow-mobile" markerWidth="9" markerHeight="9" refX="7" refY="4" orient="auto" markerUnits="userSpaceOnUse">
                  <path d="M1 1L7 4L1 7" />
                </marker>
              </defs>
              <g markerEnd="url(#journey-arrow-mobile)">
                <path d="M22 64C2 88 2 162 22 190" />
                <path d="M40 165C29 173 29 182 40 190" />
                <path d="M290 340C310 336 309 321 290 310" />
                <path d="M292 441C313 409 314 340 302 310" />
              </g>
            </svg>
            {stages.map(({ position, label }) => (
              <div key={position} className={`connected-journey-stage connected-journey-stage-${position}`}>
                <h3>{t(label)}</h3>
              </div>
            ))}
            <div className="connected-journey-link">
              <Link2 className="connected-journey-link-icon" aria-hidden="true" />
              <span className="connected-journey-url">https://pagamento.<strong>wiizecore
</strong>.com/<wbr />cliente</span>
              <span className="connected-journey-copy"><Copy className="connected-journey-copy-icon" aria-hidden="true" /></span>
            </div>
          </div>
          <div className="connected-journey-mobile">
            <div className="cjm-link">
              <Link2 aria-hidden="true" />
              <span>pagamento.<strong>wiizecore
</strong>.com/cliente</span>
              <Copy aria-hidden="true" />
            </div>
            <ol>
              {mobileSteps.map(({ title, sub }, i) => (
                <li key={title}>
                  <span className="cjm-num">{String(i + 1).padStart(2, "0")}</span>
                  <div className="cjm-card">
                    <span className="cjm-text"><strong>{t(title)}</strong><small>{t(sub)}</small></span>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <figcaption className="sr-only">{t("Exemplo ilustrativo. Não representa uma conta ou transação real.")}</figcaption>
        </figure>
      </div>
    </section>
  );
}
