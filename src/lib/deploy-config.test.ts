import { describe, expect, it } from "vitest";
import { DEPLOY_CONFIG } from "./deploy-config";
import { absoluteUrl } from "./seo";

describe("Production domain", () => {
  it("uses wiizepay.com for public navigation", () => {
    expect(DEPLOY_CONFIG.publicSiteUrl).toBe("https://wiizepay.com");
    expect(absoluteUrl("/termos-de-uso")).toBe("https://wiizepay.com/termos-de-uso");
  });

  it("uses the same production origin for developer API URLs", () => {
    expect(DEPLOY_CONFIG.apiSiteUrl).toBe("https://wiizepay.com");
    expect(new URL("/api/public/v1/ext/charges", DEPLOY_CONFIG.apiSiteUrl).href)
      .toBe("https://wiizepay.com/api/public/v1/ext/charges");
  });
});