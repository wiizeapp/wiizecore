import { describe, expect, it } from "vitest";
import { approvedWebhookDestination as allowed } from "./webhook-destination";
describe("server-approved outbound destinations", () => {
  it("fails closed without server configuration", () => expect(allowed("https://hooks.example.com/a", undefined)).toBe(false));
  it("allows only the exact approved host", () => {
    expect(allowed("https://hooks.example.com/a", "hooks.example.com")).toBe(true);
    expect(allowed("https://evil.hooks.example.com/a", "hooks.example.com")).toBe(false);
    expect(allowed("https://hooks.example.com.evil.test/a", "hooks.example.com")).toBe(false);
  });
  it("rejects internal addresses, credentials and nonstandard ports", () => {
    for (const url of ["https://127.0.0.1/a", "https://[::1]/a", "https://x.internal/a", "https://user:pass@hooks.example.com/a", "https://hooks.example.com:8080/a"]) expect(allowed(url, "127.0.0.1,[::1],x.internal,hooks.example.com")).toBe(false);
  });
});