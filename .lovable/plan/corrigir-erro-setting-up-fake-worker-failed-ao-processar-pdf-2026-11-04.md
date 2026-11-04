# Corrigir erro "Setting up fake worker failed" ao processar PDF do Piso

## O que acontece
Na etapa "Auditar e conciliar", o PDF é lido no servidor. Lá não existe navegador, então a biblioteca de PDF tenta carregar sozinha um arquivo auxiliar ("worker") no momento da leitura. O servidor publicado não permite esse carregamento tardio, e a leitura falha — tanto ao reprocessar quanto ao enviar um PDF novo.

## Correção
Carregar esse auxiliar junto com a biblioteca, logo no início, e entregá-lo pronto para ela. Assim a leitura não precisa buscar nada depois e funciona no servidor.

Aplicar nos dois pontos que leem PDF no servidor:
- Piso da Enfermagem — leitura do PDF oficial (portaria) na etapa de auditoria/conciliação.
- Leitura de PDF no servidor do módulo CACON (mesmo problema, mesma correção).

Os pontos que leem PDF no navegador continuam como estão.

## Verificação
- Teste automatizado que lê um PDF pequeno pela função de leitura do servidor e confirma que o texto sai.
- Conferir o build e repetir o reprocessamento na tela.

## Detalhes técnicos
- Criar `src/lib/pdf-server.ts` com `carregarPdfjsServidor()`:
  - `const worker = await import("pdfjs-dist/legacy/build/pdf.worker.mjs")`
  - `globalThis.pdfjsWorker = { WorkerMessageHandler: worker.WorkerMessageHandler }` (pdf.js usa isso e pula o `import()` dinâmico do fake worker)
  - retorna `await import("pdfjs-dist/legacy/build/pdf.mjs")`.
- Usar em `processar-evidencias-oficiais.ts` (`lerPdfOficial`) e `cacon/processar.ts` (`tentarExtracaoServidor`), mantendo `isEvalSupported:false`, `disableFontFace:true`.
