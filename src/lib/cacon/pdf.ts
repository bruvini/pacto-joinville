export async function extrairTextoPdfCacon(file: Blob) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const worker = await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;

  const bytes = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdfjs.getDocument({ data: bytes });
  const documento = await loadingTask.promise;
  const totalPaginas = documento.numPages;
  const paginas: string[] = [];

  try {
    for (let n = 1; n <= totalPaginas; n++) {
      const pagina = await documento.getPage(n);
      const conteudo = await pagina.getTextContent();
      paginas.push(
        conteudo.items
          .map((item: any) => ("str" in item ? String(item.str) : ""))
          .filter(Boolean)
          .join(" "),
      );
      pagina.cleanup();
    }
  } finally {
    await loadingTask.destroy();
  }

  return {
    texto: paginas.join(" ").replace(/\s+/g, " ").trim(),
    paginas: totalPaginas,
  };
}
