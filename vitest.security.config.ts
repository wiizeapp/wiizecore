import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Security handler tests execute the original handler with mocked authorization/storage,
// rather than TanStack's transformed transport stub. No live clients are loaded.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { include: ["src/lib/final-security-flows.security-check.ts", "src/lib/contract-signing.security-check.ts"], environment: "node" },
});