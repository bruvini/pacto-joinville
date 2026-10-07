import fs from "node:fs";

const budgets = {
  "src/routes/_authenticated/lancamentos.$id.tsx": 105000,
  "src/routes/_authenticated/lancamentos.index.tsx": 64000,
  "src/components/piso/EtapasPiso.tsx": 84000,
  "src/routes/_authenticated/dashboard.tsx": 58000,
};

const failures = [];
for (const [file, maxBytes] of Object.entries(budgets)) {
  const size = fs.statSync(file).size;
  if (size > maxBytes) failures.push(`${file}: ${size} bytes > limite ${maxBytes}`);
}

if (failures.length) {
  console.error(
    [
      "Orçamento arquitetural excedido. Extraia lógica/componentes em vez de aumentar o megazord:",
      ...failures.map((item) => "- " + item),
    ].join("\n"),
  );
  process.exit(1);
}

console.log("✓ orçamento de tamanho dos arquivos críticos respeitado");
