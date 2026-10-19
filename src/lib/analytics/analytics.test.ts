// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { mergeAttribution, touchFromUrl } from "./attribution";
import { sanitizeParams } from "./params";
import { clicksAllowed, normalizePath, pageGroup } from "./paths";
import { __resetAnalytics, activeProvider, configureAnalytics, safeLocation, track, trackPage } from "./index";

const ON = { necessary: true, functional: false, analytics: true, marketing: false };
const OFF = { ...ON, analytics: false };
const GA4 = { enabled: true, gtm_id: null, ga4_id: "G-TEST1234", meta_pixel_id: null };
const GTM = { enabled: true, gtm_id: "GTM-ABCD12", ga4_id: "G-TEST1234", meta_pixel_id: null };
const events = () => (window.dataLayer ?? []).filter((e: any) => e && typeof e.event === "string" && !e.event.startsWith("gtm") && !e.event.startsWith("wiize_"));

describe("rotas com códigos privados", () => {
  it("normaliza links de pagamento, portal, convite e IDs", () => {
    expect(normalizePath("/pagar/abc123TOKENxyz9876?x=1")).toBe("/pagar/:token");
    expect(normalizePath("/checkout/qwe")).toBe("/checkout/:token");
    expect(normalizePath("/portal/k3y")).toBe("/portal/:key");
    expect(normalizePath("/convite/zzz")).toBe("/convite/:token");
    expect(normalizePath("/clientes/0f8fad5b-d9cb-469f-a165-70867728950e")).toBe("/clientes/:id");
    expect(normalizePath("/notas-fiscais/123")).toBe("/notas-fiscais/:id");
    expect(normalizePath("/notas-fiscais/configuracoes")).toBe("/notas-fiscais/configuracoes");
    expect(normalizePath("/ajuda/artigo/como-cobrar")).toBe("/ajuda/artigo/como-cobrar");
  });
  it("classifica grupos e bloqueia cliques em páginas sensíveis", () => {
    expect(pageGroup("/taxas")).toBe("pricing");
    expect(pageGroup("/pagar/:token")).toBe("public_checkout");
    expect(pageGroup("/painel")).toBe("app_dashboard");
    expect(clicksAllowed("/pagar/abc")).toBe(false);
    expect(clicksAllowed("/portal/abc")).toBe(false);
    expect(clicksAllowed("/taxas")).toBe(true);
  });
  it("page_location sem códigos e só com parâmetros de campanha", () => {
    expect(safeLocation("https://wiizecore.com/pagar/SECRET123abc456789?utm_source=wpp&email=a@b.com", false)).toBe("https://wiizecore.com/pagar/:token?utm_source=wpp");
    expect(safeLocation("https://wiizecore.com/?fbclid=1", false)).toBe("https://wiizecore.com/");
    expect(safeLocation("https://wiizecore.com/?fbclid=1", true)).toBe("https://wiizecore.com/?fbclid=1");
  });
});

describe("sem dados pessoais", () => {
  it("remove e-mail, CPF, CNPJ, telefone, tokens e URLs", () => {
    expect(sanitizeParams({ email: "a@b.com", element_name: "fulano@x.com", cpf: "1", placement: "123.456.789-09", note: "11.222.333/0001-81", phone_like: "11999998888", token: "x", destination: "https://x.com/?a=1", ok: "signup", value: 2.5 }))
      .toEqual({ ok: "signup", value: 2.5 });
  });
});

describe("atribuição (janela de 90 dias)", () => {
  const t0 = Date.parse("2026-10-01T12:00:00Z");
  it("UTM, gclid e referenciador", () => {
    expect(touchFromUrl("https://wiizecore.com/?utm_source=Insta&utm_medium=social&utm_campaign=Out", "", t0)).toMatchObject({ source: "insta", medium: "social", campaign: "out" });
    expect(touchFromUrl("https://wiizecore.com/taxas?gclid=XYZ", "", t0)).toMatchObject({ source: "google", medium: "cpc", click_id_type: "gclid", landing_page: "/taxas" });
    expect(touchFromUrl("https://wiizecore.com/", "https://www.google.com/search?q=a", t0)).toMatchObject({ source: "google.com", medium: "organic" });
    expect(touchFromUrl("https://wiizecore.com/", "https://wiizecore.com/taxas", t0).source).toBe("(direct)");
  });
  it("direto não sobrescreve; nova origem atualiza só o último toque; expira em 90 dias", () => {
    const paid = touchFromUrl("https://wiizecore.com/?utm_source=ads", "", t0);
    const a = mergeAttribution(null, paid);
    const direct = touchFromUrl("https://wiizecore.com/", "", t0 + 86_400_000);
    expect(mergeAttribution(a, direct)).toEqual(a);
    const ref = touchFromUrl("https://wiizecore.com/", "https://blog.exemplo.com/post", t0 + 2 * 86_400_000);
    const b = mergeAttribution(a, ref);
    expect(b.first.source).toBe("ads");
    expect(b.last.source).toBe("blog.exemplo.com");
    const late = touchFromUrl("https://wiizecore.com/", "", t0 + 91 * 86_400_000);
    expect(mergeAttribution(b, late).first.source).toBe("(direct)");
  });
});

describe("envio e consentimento", () => {
  beforeEach(() => { __resetAnalytics(); window.dataLayer = []; delete (window as any).gtag; document.head.innerHTML = ""; localStorage.clear(); history.replaceState(null, "", "/"); });

  it("GTM e GA4 juntos → só GTM", () => {
    expect(activeProvider(GTM)).toBe("gtm");
    expect(activeProvider(GA4)).toBe("ga4");
    expect(activeProvider({ ...GTM, enabled: false })).toBeNull();
    configureAnalytics(GTM, ON);
    expect(document.querySelectorAll('script[data-tag="gtm"]').length).toBe(1);
    expect(document.querySelectorAll('script[data-tag="ga4"]').length).toBe(0);
    configureAnalytics(GTM, ON);
    expect(document.querySelectorAll('script[data-tag="gtm"]').length).toBe(1);
  });

  it("consentimento negado: nada é enviado nem guardado", () => {
    configureAnalytics(GTM, OFF);
    history.replaceState(null, "", "/taxas?utm_source=ads");
    trackPage("/taxas");
    track("cta_clicked", { element_name: "signup" });
    expect(events()).toEqual([]);
    expect(localStorage.getItem("wz_attribution")).toBeNull();
  });

  it("page view pendente sai uma única vez após aceitar; mesma rota não repete", () => {
    configureAnalytics(GTM, OFF);
    history.replaceState(null, "", "/pagar/SECRET123abc456789");
    trackPage("/pagar/SECRET123abc456789");
    configureAnalytics(GTM, ON);
    trackPage("/pagar/SECRET123abc456789");
    trackPage("/pagar/OTHER999abc456789x");
    const pv = events().filter((e: any) => e.event === "page_view");
    expect(pv.length).toBe(1);
    expect(pv[0].page_path).toBe("/pagar/:token");
    expect(JSON.stringify(events())).not.toContain("SECRET");
    history.replaceState(null, "", "/taxas");
    trackPage("/taxas");
    expect(events().filter((e: any) => e.event === "page_view").length).toBe(2);
  });

  it("revogar apaga a atribuição e para os envios", () => {
    configureAnalytics(GTM, ON);
    history.replaceState(null, "", "/?utm_source=ads");
    trackPage("/");
    expect(localStorage.getItem("wz_attribution")).not.toBeNull();
    configureAnalytics(GTM, OFF);
    expect(localStorage.getItem("wz_attribution")).toBeNull();
    const before = events().length;
    track("cta_clicked");
    expect(events().length).toBe(before);
  });

  it("evento de clique só para elementos marcados e fora de páginas sensíveis", () => {
    configureAnalytics(GTM, ON);
    document.body.innerHTML = `<a href="/auth" data-analytics-event="cta_clicked" data-analytics-name="signup" data-analytics-location="hero">x</a><a href="/x" data-analytics-event="qualquer">y</a><button>z</button>`;
    document.querySelectorAll("a,button").forEach((el) => (el as HTMLElement).click());
    const clicks = events().filter((e: any) => e.event !== "page_view");
    expect(clicks).toEqual([expect.objectContaining({ event: "cta_clicked", element_name: "signup", placement: "hero", destination: "/auth" })]);
    history.replaceState(null, "", "/pagar/abc");
    (document.querySelector("a") as HTMLElement).click();
    expect(events().filter((e: any) => e.event !== "page_view").length).toBe(1);
  });
});
