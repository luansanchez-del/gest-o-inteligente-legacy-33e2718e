/**
 * Extração de texto de PDF no servidor (runtime Worker).
 * Reconstrói as linhas a partir da posição vertical dos itens de texto,
 * porque o parser do balancete depende da quebra de linha real.
 */

interface ItemTexto {
  str: string;
  transform: number[];
}

export interface PdfExtraido {
  paginas: string[];
  totalPaginas: number;
}

export async function extrairTextoPdf(bytes: Uint8Array): Promise<PdfExtraido> {
  const { getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(bytes);
  const paginas: string[] = [];

  for (let numero = 1; numero <= pdf.numPages; numero++) {
    const page = await pdf.getPage(numero);
    const conteudo = (await page.getTextContent()) as { items: unknown[] };
    const itens = (conteudo.items as ItemTexto[]).filter(
      (i) => typeof i?.str === "string" && Array.isArray(i.transform),
    );

    const porLinha = new Map<number, ItemTexto[]>();
    for (const item of itens) {
      const y = Math.round((item.transform[5] ?? 0) * 2) / 2;
      const lista = porLinha.get(y);
      if (lista) lista.push(item);
      else porLinha.set(y, [item]);
    }

    const linhas = [...porLinha.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([, itensDaLinha]) =>
        itensDaLinha
          .sort((a, b) => (a.transform[4] ?? 0) - (b.transform[4] ?? 0))
          .map((i) => i.str)
          .join(" ")
          .replace(/\s{2,}/g, " ")
          .trim(),
      )
      .filter(Boolean);

    paginas.push(linhas.join("\n"));
  }

  return { paginas, totalPaginas: pdf.numPages };
}
