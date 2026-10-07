import fs from "node:fs";

const allowed = new Set([
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "VITE_SUPABASE_PROJECT_ID",
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_PROJECT_ID",
]);
const forbidden = /(SERVICE[_-]?ROLE|SECRET|PASSWORD|PRIVATE[_-]?KEY|ACCESS[_-]?TOKEN)/i;

function keys(path) {
  return fs
    .readFileSync(path, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => line.split("=", 1)[0].trim());
}

const errors = [];
for (const path of [".env", ".env.example"]) {
  for (const key of keys(path)) {
    if (forbidden.test(key)) errors.push(path + ": variável privilegiada/proibida: " + key);
    if (!allowed.has(key)) errors.push(path + ": variável não prevista no contrato público: " + key);
  }
}

if (errors.length) {
  console.error(["Contrato de ambiente violado:", ...errors.map((e) => "- " + e)].join("\n"));
  process.exit(1);
}
console.log("✓ contrato de ambiente público válido");
