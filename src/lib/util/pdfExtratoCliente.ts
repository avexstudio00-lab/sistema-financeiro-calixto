import { supabase } from "@/lib/supabase/client";
import { extrairComPdfjs, type LinhasDoPdf, type PdfjsMinimo } from "./pdfExtrato";

/**
 * Leitura do extrato em PDF no navegador (10/nov/2026).
 *
 * 1) Tenta ler AQUI no aparelho com o pdf.js (build legacy + worker em
 *    /public/pdf.worker.min.mjs).
 * 2) Se o navegador não conseguir (achado do usuário: no app do iPhone o
 *    PDF não abria nem com a build legacy — o Safari dele não roda esse
 *    código), manda o arquivo pra /api/importar/pdf, que lê o mesmo texto no
 *    servidor e devolve só as linhas. Nada é gravado lá.
 *
 * Erros lançados: "SENHA", "SENHA_ERRADA", "GRANDE_DEMAIS" ou "PDF_INVALIDO".
 */
export const LIMITE_SERVIDOR_BYTES = 4 * 1024 * 1024; // limite de corpo da Vercel ~4,5 MB

export async function lerLinhasPdf(bytes: Uint8Array, senha?: string): Promise<LinhasDoPdf> {
  try {
    const pdfjs = (await import("pdfjs-dist/legacy/build/pdf.mjs")) as unknown as PdfjsMinimo & { GlobalWorkerOptions: { workerSrc: string } };
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    return await comLimiteDeTempo(extrairComPdfjs(pdfjs, bytes, senha), 15000);
  } catch (e) {
    const motivo = e instanceof Error ? e.message : "";
    if (motivo === "SENHA" || motivo === "SENHA_ERRADA") throw e;
    console.error("[pdfExtrato] o navegador não abriu o PDF, tentando pelo servidor:", e);
  }
  return lerNoServidor(bytes, senha);
}

function comLimiteDeTempo<T>(promessa: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("TEMPO_ESGOTADO")), ms);
    promessa.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

async function lerNoServidor(bytes: Uint8Array, senha?: string): Promise<LinhasDoPdf> {
  if (bytes.byteLength > LIMITE_SERVIDOR_BYTES) throw new Error("GRANDE_DEMAIS");
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("PDF_INVALIDO");
  const form = new FormData();
  const copia = new Uint8Array(bytes.byteLength);
  copia.set(bytes);
  form.append("arquivo", new Blob([copia.buffer], { type: "application/pdf" }), "extrato.pdf");
  if (senha) form.append("senha", senha);
  let resposta: Response;
  try {
    resposta = await fetch("/api/importar/pdf", { method: "POST", headers: { Authorization: `Bearer ${session.access_token}` }, body: form });
  } catch (e) {
    console.error("[pdfExtrato] servidor fora do ar:", e);
    throw new Error("PDF_INVALIDO");
  }
  const json = (await resposta.json().catch(() => null)) as (Partial<LinhasDoPdf> & { erro?: string }) | null;
  if (!resposta.ok || !json || !Array.isArray(json.linhas)) {
    const codigo = json?.erro;
    if (codigo === "SENHA" || codigo === "SENHA_ERRADA" || codigo === "GRANDE_DEMAIS") throw new Error(codigo);
    console.error("[pdfExtrato] servidor não leu o PDF:", resposta.status, codigo);
    throw new Error("PDF_INVALIDO");
  }
  return { linhas: json.linhas, posicoes: Array.isArray(json.posicoes) ? json.posicoes : [], ehCartao: !!json.ehCartao };
}
