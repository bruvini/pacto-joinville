import {defineConfig} from "vitest/config";
import {fileURLToPath} from "node:url";

// Vitest isolado do build Lovable: resolve o alias @ sem carregar
// plugins Cloudflare/Nitro que não pertencem aos testes unitários.
export default defineConfig({
 resolve:{alias:{"@":fileURLToPath(new URL("./src",import.meta.url))}},
 test:{include:["src/**/*.test.ts"],environment:"node"},
});
