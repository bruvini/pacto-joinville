/** Fallback local para PDFs textuais quando o gateway recusa anexo binário. */
export async function extrairTextoAuditoriaPdf(bytes: Uint8Array): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({ data: bytes.slice(), useSystemFonts: true });
  const pdf = await task.promise;
  try {
    const paginas: string[] = [];
    for (let i = 1; i <= Math.min(pdf.numPages, 70); i++) {
      const pagina = await pdf.getPage(i);
      const conteudo = await pagina.getTextContent();
      paginas.push("Página " + i + ": " + conteudo.items
        .map((item: any) => "str" in item ? String(item.str) : "")
        .join(" "));
      pagina.cleanup();
    }
    return paginas.join("\n").slice(0, 100_000);
  } finally {
    await task.destroy();
  }
}
