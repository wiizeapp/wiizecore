import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Na Vercel (variável VERCEL=1 definida automaticamente) o servidor é gerado no formato da Vercel.
const onVercel = !!process.env["VERCEL"];

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  ...(onVercel ? { nitro: { preset: "vercel" } } : {}),
});
