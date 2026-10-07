import fs from "node:fs";
import path from "node:path";

const MIGRATIONS_DIR = "supabase/migrations";
const TYPES_FILE = "src/integrations/supabase/types.ts";
const COLUMN_TRACK_FROM = "202610";
const SQL_TYPES = /^(uuid|text|varchar|character\s+varying|integer|int|bigint|smallint|numeric|decimal|boolean|date|timestamp|timestamptz|json|jsonb|text\[\]|uuid\[\]|int\[\]|integer\[\])/i;

const files = fs.readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith(".sql")).sort();
const createdTables = new Map();
const recentColumns = new Map();
const columnsFor = (map, table) => {
  if (!map.has(table)) map.set(table, new Set());
  return map.get(table);
};

for (const file of files) {
  const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");

  for (const match of sql.matchAll(
    /CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+public\.([a-zA-Z0-9_]+)\s*\(([\s\S]*?)\);/gi,
  )) {
    const table = match[1];
    createdTables.set(table, file);
    if (file < COLUMN_TRACK_FROM) continue;
    const columns = columnsFor(recentColumns, table);
    for (const raw of match[2].split(/\r?\n/)) {
      const line = raw.trim().replace(/,$/, "");
      if (!line || /^(CONSTRAINT|PRIMARY|UNIQUE|CHECK|FOREIGN)\b/i.test(line)) continue;
      const parts = line.match(/^"?([a-zA-Z_][a-zA-Z0-9_]*)"?\s+(.+)$/);
      if (!parts || !SQL_TYPES.test(parts[2])) continue;
      columns.add(parts[1]);
    }
  }

  if (file >= COLUMN_TRACK_FROM) {
    for (const match of sql.matchAll(
      /ALTER\s+TABLE\s+public\.([a-zA-Z0-9_]+)([\s\S]*?);/gi,
    )) {
      const table = match[1];
      const columns = columnsFor(recentColumns, table);
      for (const add of match[2].matchAll(
        /ADD\s+COLUMN(?:\s+IF\s+NOT\s+EXISTS)?\s+"?([a-zA-Z_][a-zA-Z0-9_]*)"?/gi,
      )) {
        columns.add(add[1]);
      }
      for (const drop of match[2].matchAll(
        /DROP\s+COLUMN(?:\s+IF\s+EXISTS)?\s+"?([a-zA-Z_][a-zA-Z0-9_]*)"?/gi,
      )) {
        columns.delete(drop[1]);
      }
    }
  }
}

const types = fs.readFileSync(TYPES_FILE, "utf8");
const tablesStart = types.indexOf("Tables: {");
const viewsStart = types.indexOf("Views: {", tablesStart);
if (tablesStart < 0 || viewsStart < 0) {
  console.error("Não foi possível localizar o bloco Tables em " + TYPES_FILE);
  process.exit(1);
}
const tablesBlock = types.slice(tablesStart, viewsStart);
const typedTables = new Map();
const tableMatches = [...tablesBlock.matchAll(/^\s{6}([a-zA-Z0-9_]+): \{/gm)];

for (let index = 0; index < tableMatches.length; index++) {
  const match = tableMatches[index];
  const name = match[1];
  const start = match.index;
  const end = tableMatches[index + 1]?.index ?? tablesBlock.length;
  const block = tablesBlock.slice(start, end);
  const rowStart = block.indexOf("Row: {");
  const insertStart = block.indexOf("Insert: {", rowStart);
  if (rowStart < 0 || insertStart < 0) continue;
  const rowBlock = block.slice(rowStart + "Row: {".length, insertStart);
  typedTables.set(
    name,
    new Set(
      [...rowBlock.matchAll(/^\s{10}([a-zA-Z_][a-zA-Z0-9_]*):/gm)].map((m) => m[1]),
    ),
  );
}

const errors = [];
for (const [table, migration] of createdTables) {
  if (!typedTables.has(table)) errors.push(`tabela criada em ${migration} ausente em types.ts: ${table}`);
}
for (const [table, columns] of recentColumns) {
  const typed = typedTables.get(table);
  if (!typed) continue;
  for (const column of columns) {
    if (!typed.has(column)) errors.push(`coluna recente ausente em types.ts: ${table}.${column}`);
  }
}

if (errors.length) {
  console.error(["Tipos Supabase defasados em relação às migrations:", ...errors.map((e) => "- " + e)].join("\n"));
  process.exit(1);
}
console.log(`✓ contrato migrations ↔ types válido (${createdTables.size} tabelas; colunas rastreadas desde ${COLUMN_TRACK_FROM})`);
