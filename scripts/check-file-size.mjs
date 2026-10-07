import fs from "node:fs";

const budgets = {
  // Arquivos legados ainda grandes: orçamento abaixo impede crescimento e força
  // a próxima funcionalidade nova a sair para hook/lib/componente próprio.
  "src/routes/_authenticated/lancamentos.$id.tsx": 104000,
  "src/routes/_authenticated/lancamentos.index.tsx": 63000,
  // Estes dois já foram parcialmente decompostos nesta rodada.
  "src/components/piso/EtapasPiso.tsx": 70000,
  "src/routes/_authenticated/dashboard.tsx": 55000,
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
