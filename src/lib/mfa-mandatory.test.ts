import { describe, expect, it } from "vitest";
import { assertTwoFactorIfEnrolled } from "./finance.server";
describe("mandatory MFA on legacy helper", () => {
  it("AAL1 cannot pass even without any enrolled factor lookup", async () => {
    await expect(assertTwoFactorIfEnrolled({ aal: "aal1" }, "fixture")).rejects.toThrow();
  });
  it("AAL2 positive control passes", async () => {
    await expect(assertTwoFactorIfEnrolled({ aal: "aal2" }, "fixture")).resolves.toBeUndefined();
  });
});