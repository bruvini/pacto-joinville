/** Carrega pdf.js para uso no servidor (Workers), sem import() dinâmico do worker. */
export async function carregarPdfjsServidor() {
  const worker: any = await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
  (globalThis as any).pdfjsWorker = { WorkerMessageHandler: worker.WorkerMessageHandler };
  return await import("pdfjs-dist/legacy/build/pdf.mjs");
}
