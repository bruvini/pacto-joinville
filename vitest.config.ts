import { defineConfig } from "vitest/config";

// Config isolada do vite.config.ts (que carrega plugins de build do Lovable):
// os testes cobrem apenas as regras de negócio puras de src/lib.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
