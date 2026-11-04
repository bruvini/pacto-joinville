/** Carrega pdf.js para uso no servidor (Workers), sem import() dinâmico do worker. */
export async function carregarPdfjsServidor(): Promise<any> {
  const worker: any = await import("pdfjs-dist/legacy/build/pdf.worker.mjs" as string);
  (globalThis as any).pdfjsWorker = { WorkerMessageHandler: worker.WorkerMessageHandler };
  return await import("pdfjs-dist/legacy/build/pdf.mjs");
}
