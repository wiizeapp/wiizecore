import { ArrowDown, Briefcase, Check, CheckCircle2, CreditCard, Download, FileSignature, FileText, Link2, LockKeyhole, QrCode, Receipt, UserRound, Wallet } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Brand } from "@/components/brand";
import "./connected-journey.css";

/** Presentation only: no customer records, payment actions or financial state. */
export function ConnectedJourneySection() {
  const { t } = useTranslation("ui");
  return <section className="connected-journey section-shell" aria-labelledby="connected-journey-title">
    <div className="connected-journey-intro">
      <h2 id="connected-journey-title" className="text-3xl font-semibold leading-tight sm:text-[2.6rem]">{t("Da contratação às próximas cobranças,")} <span className="hero-shine">{t("tudo conectado.")}</span></h2>
      <p className="text-sm leading-7 text-muted-foreground sm:text-base">{t("Um único link conecta as etapas da jornada do seu cliente, do preenchimento dos dados e assinatura do contrato ao pagamento e ao acesso às informações da cobrança.")}</p>
    </div>
    <figure>
      <div className="connected-journey-window">
        <div className="connected-journey-toolbar"><Brand size="sm" /><span className="connected-journey-link"><Link2 className="size-4" /><span>{t("Um único link")}</span><LockKeyhole className="size-3.5" /></span></div>
        <div className="connected-journey-workspace">
          <div className="connected-journey-history">
            <div className="connected-journey-step">
              <span className="connected-journey-number">01</span><h3 className="connected-journey-label"><UserRound />{t("Dados da contratação")}</h3>
              <div className="connected-journey-service"><Briefcase className="size-3.5" />{t("Consultoria estratégica")}</div>
              <div className="connected-journey-fields">{["Nome completo", "E-mail", "CPF/CNPJ"].map(label => <div key={label} className="connected-journey-field"><span>{t(label)}</span><i aria-hidden="true" /></div>)}</div>
            </div>
            <div className="connected-journey-step">
              <span className="connected-journey-number">02</span><h3 className="connected-journey-label"><FileSignature />{t("Assinatura do contrato")}</h3>
              <div className="connected-journey-document"><p>{t("Contrato de prestação de serviços")}</p><div className="connected-journey-document-lines" aria-hidden="true"><i /><i /><i /></div>
                <div className="connected-journey-signature"><svg className="connected-journey-signature-mark" viewBox="0 0 100 40" fill="none" aria-hidden="true"><path d="M4 29C14 27 32 4 25 6C17 9 15 33 24 30C35 26 42 12 37 14C32 16 33 33 41 27L48 21C47 33 52 32 60 23C58 32 66 27 70 24L94 24" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg><span className="flex items-center gap-1"><Check className="size-3.5" />{t("Assinatura registrada")}</span></div>
              </div>
            </div>
          </div>
          <div className="connected-journey-payment">
            <div className="connected-journey-label"><span className="text-xs text-primary">03</span><CreditCard />{t("Pagamento")}</div>
            <div className="connected-journey-paid"><span className="connected-journey-paid-icon"><CheckCircle2 className="size-8" /></span><h3>{t("Pagamento confirmado")}</h3><p>{t("Recibo disponível em PDF")}</p><div className="connected-journey-methods"><span><QrCode />Pix</span><span><FileText />{t("Boleto")}</span><span><CreditCard />{t("Cartão")}</span></div></div>
            <div className="connected-journey-continuation"><ArrowDown className="size-4" />{t("Portal do cliente")}</div>
          </div>
        </div>
        <div className="connected-journey-portal">
          <div className="connected-journey-portal-heading"><span className="connected-journey-number">04</span><h3 className="connected-journey-label"><Wallet />{t("Próximas cobranças e documentos")}</h3></div>
          <div className="connected-journey-portal-content">
            <div><p className="connected-journey-portal-subtitle">{t("Suas cobranças")}</p><div className="connected-journey-row"><Receipt /><span>{t("Consultoria estratégica")}<small>{t("Próxima cobrança")}</small></span><b className="connected-journey-status">{t("Pendente")}</b></div><div className="connected-journey-row"><CheckCircle2 /><span>{t("Pagamento confirmado")}<small>{t("Recibo disponível em PDF")}</small></span><Download /></div></div>
            <div><p className="connected-journey-portal-subtitle">{t("Seus documentos")}</p><div className="connected-journey-row"><FileSignature /><span>{t("Contrato assinado")}<small>{t("Versão assinada disponível")}</small></span><Download /></div><div className="connected-journey-row"><FileText /><span>{t("Relatório do serviço")}<small>{t("Disponibilizado pela empresa")}</small></span><Download /></div></div>
          </div>
        </div>
      </div>
      <figcaption className="connected-journey-caption">{t("Exemplo ilustrativo. Não representa uma conta ou transação real.")}</figcaption>
    </figure>
  </section>;
}