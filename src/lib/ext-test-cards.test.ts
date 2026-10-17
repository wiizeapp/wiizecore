import { describe, expect, it } from "vitest";
import { testCardOutcome } from "./ext-test-cards";

describe("cartões de teste do sandbox", () => {
  it("4242 4242 4242 4242 aprova", () => expect(testCardOutcome("4242 4242 4242 4242")).toBe("approve"));
  it("4000 0000 0000 0002 recusa", () => expect(testCardOutcome("4000000000000002")).toBe("decline"));
  it("4000 0000 0000 0077 fica pendente", () => expect(testCardOutcome("4000-0000-0000-0077")).toBe("pending"));
  it("cartão que não é de teste é rejeitado", () => expect(testCardOutcome("5555 5555 5555 4444")).toBeNull());
});
