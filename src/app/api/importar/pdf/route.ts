import { NextResponse } from "next/server";
import { usuarioAutenticadoDaRequisicao } from "@/lib/supabase/admin";
import { limitarRequisicoes, RESPOSTA_RATE_LIMIT } from "@/lib/rateLimit";
import { extrairComPdfjs, parecePdf, type PdfjsMinimo } from "@/lib/util/pdfExtrato";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Leitura de extrato em PDF pelo SERVIDOR (10/nov/2026) — só quando o
 * navegador da pessoa não consegue (ex.: app do iPhone com Safari que não
 * roda o pdf.js). Recebe o PDF, extrai as LINHAS de texto e devolve; o
 * arquivo não é gravado em lugar nenhum e nada é logado do conteúdo.
 * A interpretação (datas, valores, conferência) continua no aparelho.
 */
const TAMANHO_MAXIMO = 4 * 1024 * 1024;

let workerCarregado: Promise<void> | null = null;
async function carregarPdfjs(): Promise<PdfjsMinimo> {
  // No servidor o pdf.js roda "sem worker": o módulo do worker carregado no
  // mesmo processo (import estático pra entrar no pacote da função).
  if (!workerCarregado) {
    workerCarregado = import("pdfjs-dist/legacy/build/pdf.worker.mjs").then((w) => {
      (globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = w;
    });
  }
  await workerCarregado;
  return (await import("pdfjs-dist/legacy/build/pdf.mjs")) as unknown as PdfjsMinimo;
}

export async function POST(request: Request) {
  const autenticado = await usuarioAutenticadoDaRequisicao(request);
  if (!autenticado) return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });
  const { user } = autenticado;

  const { permitido } = await limitarRequisicoes("importar-pdf", { limite: 30, janelaSegundos: 3600, identificador: user.id });
  if (!permitido) return NextResponse.json(RESPOSTA_RATE_LIMIT, { status: 429 });

  if (Number(request.headers.get("content-length") ?? "0") > TAMANHO_MAXIMO + 64 * 1024) {
    return NextResponse.json({ erro: "GRANDE_DEMAIS" }, { status: 413 });
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ erro: "PDF_INVALIDO" }, { status: 400 });
  }
  const arquivo = form.get("arquivo");
  const senhaBruta = form.get("senha");
  const senha = typeof senhaBruta === "string" && senhaBruta.length > 0 && senhaBruta.length <= 128 ? senhaBruta : undefined;
  if (!(arquivo instanceof Blob) || arquivo.size === 0) return NextResponse.json({ erro: "PDF_INVALIDO" }, { status: 400 });
  if (arquivo.size > TAMANHO_MAXIMO) return NextResponse.json({ erro: "GRANDE_DEMAIS" }, { status: 413 });

  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  if (!parecePdf(bytes)) return NextResponse.json({ erro: "PDF_INVALIDO" }, { status: 400 });

  try {
    const pdfjs = await carregarPdfjs();
    const resultado = await extrairComPdfjs(pdfjs, bytes, senha);
    return NextResponse.json(resultado, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const motivo = e instanceof Error ? e.message : "";
    if (motivo === "SENHA" || motivo === "SENHA_ERRADA") return NextResponse.json({ erro: motivo }, { status: 422 });
    console.error("importar/pdf: falha ao ler o PDF:", e instanceof Error ? `${e.name}: ${e.message.slice(0, 200)}` : "erro");
    return NextResponse.json({ erro: "PDF_INVALIDO" }, { status: 422 });
  }
}
