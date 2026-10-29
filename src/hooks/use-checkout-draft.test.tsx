// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useCheckoutDraft } from "./use-checkout-draft";
import { useCheckoutReturn } from "./use-checkout-return";
import { CHECKOUT_CUSTOMER_FIELDS } from "@/lib/checkout-resume";

let root: Root;
let container: HTMLDivElement;
let draft: ReturnType<typeof useCheckoutDraft<{ email: string }>>;
function Form({ token }: { token: string }) {
  draft = useCheckoutDraft(token, "customer", CHECKOUT_CUSTOMER_FIELDS, { email: "" });
  return null;
}
async function render(node: ReactNode) { await act(async () => { root.render(node); }); }
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  sessionStorage.clear();
  container = document.createElement("div");
  root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); });
describe("interrupted checkout input", () => {
  it("restores typed data after the form closes and remounts", async () => {
    await render(<Form token="link-a" />);
    await act(async () => draft[1]({ email: "cliente@example.com" }));
    await render(null);
    await render(<Form token="link-a" />);
    expect(draft[0].email).toBe("cliente@example.com");
  });
  it("does not leak drafts into another payment link", async () => {
    await render(<Form token="link-a" />);
    await act(async () => draft[1]({ email: "cliente@example.com" }));
    await render(null);
    await render(<Form token="link-b" />);
    expect(draft[0].email).toBe("");
  });
  it("does not restore a cleared, confirmed draft", async () => {
    await render(<Form token="link-a" />);
    await act(async () => draft[1]({ email: "cliente@example.com" }));
    draft[2]();
    await render(null);
    await render(<Form token="link-a" />);
    expect(draft[0].email).toBe("");
  });
});
describe("returning to checkout", () => {
  it("refreshes on focus, restored page, visible tab and connectivity return", async () => {
    let refreshes = 0;
    const refresh = () => { refreshes++; };
    function Monitor() { useCheckoutReturn(refresh); return null; }
    await render(<Monitor />);
    window.dispatchEvent(new Event("focus"));
    window.dispatchEvent(new Event("online"));
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
    expect(refreshes).toBe(4);
    await render(null);
    window.dispatchEvent(new Event("focus"));
    expect(refreshes).toBe(4);
  });
});