import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { z } from "zod";
import { usuarioAutenticadoDaRequisicao, supabaseAdmin } from "@/lib/supabase/admin";
import { limitarRequisicoes, RESPOSTA_RATE_LIMIT } from "@/lib/rateLimit";
import { registrarEventoSeguranca } from "@/lib/auditoria";
import { caminhoSeguro, detectarTipoImagem, TAMANHO_MAXIMO_COMPROVANTE } from "@/lib/seguranca/arquivos";

export const runtime = "nodejs";

const BUCKET = "comprovantes-documentos";
const VALIDADE_URL_SEGUNDOS = 60 * 60; // máximo de 60 minutos (item 2.6)
const idValido = z.string().uuid();
const CAMINHO_VALIDO = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp)$/i;

/** Só aceita caminho gerado pelo próprio servidor e dentro da pasta do dono
 * do lançamento (defesa extra além da trava no banco). */
function caminhoDoDono(caminho: string | null, donoId: string): string | null {
  if (!caminho || !CAMINHO_VALIDO.test(caminho) || !caminho.startsWith(`${donoId}/`)) return null;
  return caminho;
}

/**
 * Comprovantes de lançamentos (item 2.6 da especificação de 09/out/2026).
 * - Nada de base64 no banco: o arquivo vai para o bucket PRIVADO
 *   `comprovantes-documentos`; a linha do lançamento guarda só o caminho.
 * - O acesso ao lançamento é conferido com o login do próprio usuário (RLS),
 *   então sócio só anexa/vê comprovante de lançamento que ele já pode ver.
 * - Tipo real conferido pelos magic bytes (JPEG/PNG/WEBP), até 5 MB, nome
 *   trocado por UUID v4 no servidor.
 * - Visualização só por URL assinada de até 60 min.
 */
async function transacaoAcessivel(request: Request, transacaoId: string) {
  const autenticado = await usuarioAutenticadoDaRequisicao(request);
  if (!autenticado) return { erro: NextResponse.json({ erro: "Não autenticado." }, { status: 401 }) } as const;
  const { data, error } = await autenticado.supabase
    .from("transacoes")
    .select("id, usuario_id, comprovante_path")
    .eq("id", transacaoId)
    .maybeSingle();
  if (error || !data) return { erro: NextResponse.json({ erro: "Lançamento não encontrado." }, { status: 404 }) } as const;
  return { user: autenticado.user, transacao: data as { id: string; usuario_id: string; comprovante_path: string | null } } as const;
}

export async function POST(request: Request) {
  // Autentica ANTES de ler o corpo (não processa upload de quem não está logado).
  const autenticado = await usuarioAutenticadoDaRequisicao(request);
  if (!autenticado) return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });
  const tamanhoDeclarado = Number(request.headers.get("content-length") ?? "0");
  if (tamanhoDeclarado > TAMANHO_MAXIMO_COMPROVANTE + 64 * 1024) {
    return NextResponse.json({ erro: "A imagem precisa ter até 4 MB." }, { status: 413 });
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ erro: "Envio inválido." }, { status: 400 });
  }
  const transacaoId = form.get("transacao_id");
  const arquivo = form.get("arquivo");
  if (typeof transacaoId !== "string" || !idValido.safeParse(transacaoId).success || !(arquivo instanceof Blob)) {
    return NextResponse.json({ erro: "Envio inválido." }, { status: 400 });
  }
  const acesso = await transacaoAcessivel(request, transacaoId);
  if ("erro" in acesso) return acesso.erro;
  const { user, transacao } = acesso;

  const { permitido } = await limitarRequisicoes("comprovante-upload", { limite: 40, janelaSegundos: 3600, identificador: user.id });
  if (!permitido) return NextResponse.json(RESPOSTA_RATE_LIMIT, { status: 429 });

  if (arquivo.size === 0 || arquivo.size > TAMANHO_MAXIMO_COMPROVANTE) {
    return NextResponse.json({ erro: "A imagem precisa ter até 4 MB." }, { status: 400 });
  }
  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  const tipo = detectarTipoImagem(bytes);
  if (!tipo) {
    await registrarEventoSeguranca(user.id, "comprovante_recusado", { motivo: "tipo_real_invalido", declarado: arquivo.type?.slice(0, 50) });
    return NextResponse.json({ erro: "Envie uma foto JPG, PNG ou WEBP." }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const caminho = caminhoSeguro(transacao.usuario_id, tipo, randomUUID());
  const { error: erroUpload } = await admin.storage.from(BUCKET).upload(caminho, bytes, { contentType: tipo, upsert: false });
  if (erroUpload) {
    console.error("Upload de comprovante falhou:", erroUpload.message);
    return NextResponse.json({ erro: "Não foi possível guardar o arquivo." }, { status: 502 });
  }
  const { error: erroUpdate } = await admin.from("transacoes").update({ comprovante_path: caminho }).eq("id", transacao.id);
  if (erroUpdate) {
    await admin.storage.from(BUCKET).remove([caminho]);
    console.error("Falha ao ligar comprovante ao lançamento:", erroUpdate.message);
    return NextResponse.json({ erro: "Não foi possível salvar." }, { status: 500 });
  }
  const antigo = caminhoDoDono(transacao.comprovante_path, transacao.usuario_id);
  if (antigo) await admin.storage.from(BUCKET).remove([antigo]);
  await registrarEventoSeguranca(user.id, "comprovante_enviado", { transacao_id: transacao.id });
  return NextResponse.json({ ok: true });
}

export async function GET(request: Request) {
  const transacaoId = new URL(request.url).searchParams.get("transacao_id") ?? "";
  if (!idValido.safeParse(transacaoId).success) return NextResponse.json({ erro: "Pedido inválido." }, { status: 400 });
  const acesso = await transacaoAcessivel(request, transacaoId);
  if ("erro" in acesso) return acesso.erro;
  const caminhoGet = caminhoDoDono(acesso.transacao.comprovante_path, acesso.transacao.usuario_id);
  if (!caminhoGet) return NextResponse.json({ erro: "Sem comprovante." }, { status: 404 });
  const { data, error } = await supabaseAdmin().storage.from(BUCKET).createSignedUrl(caminhoGet, VALIDADE_URL_SEGUNDOS);
  if (error || !data) return NextResponse.json({ erro: "Não foi possível abrir." }, { status: 502 });
  return NextResponse.json({ url: data.signedUrl, expiraEmSegundos: VALIDADE_URL_SEGUNDOS });
}

export async function DELETE(request: Request) {
  const transacaoId = new URL(request.url).searchParams.get("transacao_id") ?? "";
  if (!idValido.safeParse(transacaoId).success) return NextResponse.json({ erro: "Pedido inválido." }, { status: 400 });
  const acesso = await transacaoAcessivel(request, transacaoId);
  if ("erro" in acesso) return acesso.erro;
  const caminho = caminhoDoDono(acesso.transacao.comprovante_path, acesso.transacao.usuario_id);
  const admin = supabaseAdmin();
  if (caminho) await admin.storage.from(BUCKET).remove([caminho]);
  await admin.from("transacoes").update({ comprovante_path: null }).eq("id", acesso.transacao.id);
  return NextResponse.json({ ok: true });
}
