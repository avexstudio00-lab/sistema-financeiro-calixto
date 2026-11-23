import { supabaseAdmin } from "@/lib/supabase/admin";
import { limitarRequisicoes } from "@/lib/rateLimit";
import { hashCodigoVoz, pareceCodigoVoz } from "@/lib/voz/token";
import { interpretarFrase, resumoFalado } from "@/lib/voz/interpretar";

export const runtime = "nodejs";

/** Resposta em texto puro: o atalho da Siri só precisa "Falar" isso. */
function falar(texto: string, status = 200) {
  return new Response(texto, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}

/**
 * Atalho da Siri (23/nov/2026): "E aí Siri, anotar no Meu Controle" → a
 * pessoa fala → o atalho manda o texto aqui com o código pessoal no header
 * `Authorization: Bearer mc_...`.
 *
 * Decisão de segurança: a Siri NÃO grava direto no saldo. A frase entra em
 * `anotacoes_voz` como "pendente" e a pessoa confere e salva com um toque
 * quando abrir o app (o ditado erra número — "35" vira "45" — e dinheiro
 * errado no saldo é pior que um toque a mais). Assim o servidor não precisa
 * reescrever a lógica de venda/estoque/carteira: o app salva com o mesmo
 * código da tela de sempre.
 */
/**
 * GET (23/nov/2026): o jeito mais fácil de montar no iPhone, sem escolher
 * variável — Ditar Texto → Codificar URL → Obter conteúdo de
 * `…/api/voz/siri?c=mc_…&t=` + [Texto Codificado] (o Atalhos liga a saída de
 * uma ação na próxima sozinho). O texto vem no parâmetro `t`.
 */
export async function GET(request: Request) {
  return POST(request);
}

export async function POST(request: Request) {
  // O código pode vir no cabeçalho (Authorization: Bearer mc_...) ou no
  // próprio endereço (?c=mc_...) — o endereço pronto é bem mais fácil de
  // montar no Atalhos (23/nov/2026: o usuário se perdeu no cabeçalho). O
  // código só serve pra deixar uma anotação pendente (não lê nem mexe em
  // saldo), então aparecer num log de endereço é um risco pequeno.
  // O código tem tamanho fixo ("mc_" + 32). Se a pessoa colar o endereço e o
  // texto ditado cair grudado logo depois (sem "&t="), separa os dois.
  const cBruto = (new URL(request.url).searchParams.get("c") ?? "").trim();
  const daUrl = cBruto.slice(0, 35);
  const textoGrudado = cBruto.length > 35 ? cBruto.slice(35) : "";
  const doCabecalho = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  // Se o cabeçalho estiver preenchido errado (ex.: com o link), vale o do endereço.
  const codigo = pareceCodigoVoz(doCabecalho) ? doCabecalho : daUrl.trim();
  if (!pareceCodigoVoz(codigo)) return falar("O atalho está sem o código pessoal. Gere um código no app, em Voz e Siri.", 401);

  let texto = "";
  const tipoConteudo = request.headers.get("content-type") ?? "";
  try {
    if (tipoConteudo.includes("application/json")) {
      const corpo = (await request.json()) as { texto?: unknown };
      texto = typeof corpo.texto === "string" ? corpo.texto : "";
    } else if (tipoConteudo.includes("form")) {
      const form = await request.formData();
      const v = form.get("texto");
      texto = typeof v === "string" ? v : "";
    } else {
      texto = await request.text();
    }
  } catch {
    texto = "";
  }
  // Texto também pode vir no endereço (?t=...), no GET ou no POST.
  if (!texto.trim()) texto = new URL(request.url).searchParams.get("t") ?? "";
  if (!texto.trim()) texto = textoGrudado;
  texto = texto.replace(/\s+/g, " ").trim().slice(0, 500);
  if (!texto) return falar("Não ouvi nada. Tente de novo falando devagar.", 400);

  const admin = supabaseAdmin();
  const { data: dono, error: erroDono } = await admin.from("voz_tokens").select("usuario_id").eq("token_hash", hashCodigoVoz(codigo)).maybeSingle();
  if (erroDono) {
    console.error("voz/siri token:", erroDono);
    return falar("O comando de voz ainda não foi ativado no app. Tente mais tarde.", 503);
  }
  const usuarioId = (dono as { usuario_id: string } | null)?.usuario_id;
  if (!usuarioId) return falar("Esse código não vale mais. Gere um novo no app, em Voz e Siri, e atualize o atalho.", 401);

  const { permitido } = await limitarRequisicoes("voz-siri", { limite: 60, janelaSegundos: 3600, identificador: usuarioId });
  if (!permitido) return falar("Muitas anotações em pouco tempo. Espere uns minutos.", 429);

  const { error } = await admin.from("anotacoes_voz").insert({ usuario_id: usuarioId, origem: "siri", texto, status: "pendente" });
  if (error) {
    console.error("voz/siri insert:", error);
    return falar("Não consegui guardar agora. Tente de novo.", 500);
  }
  await admin.from("voz_tokens").update({ ultimo_uso: new Date().toISOString() }).eq("usuario_id", usuarioId);

  const entendido = interpretarFrase(texto);
  if (entendido.valor == null) return falar("Guardei, mas não entendi o valor. Confira quando abrir o app.");
  return falar(`Anotado. ${resumoFalado(entendido)} Confirme quando abrir o app.`);
}
