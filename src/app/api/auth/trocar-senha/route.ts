import { NextResponse } from "next/server";
import { z } from "zod";
import { usuarioAutenticadoDaRequisicao, supabaseAdmin, supabaseAnonimoSemSessao } from "@/lib/supabase/admin";
import { limitarRequisicoes, RESPOSTA_RATE_LIMIT } from "@/lib/rateLimit";
import { registrarEventoSeguranca } from "@/lib/auditoria";
import { validarSenhaNova } from "@/lib/seguranca/senha";

export const runtime = "nodejs";

const esquema = z
  .object({
    senhaAtual: z.string().min(1).max(200),
    novaSenha: z.string().min(1).max(200),
  })
  .strict();

/**
 * "Trocar senha" do perfil, feito no SERVIDOR (item 6 da apuração de
 * 10/out/2026):
 *  - confere a senha atual com um login descartável (sem mexer na sessão do
 *    navegador);
 *  - aplica a força mínima e o bloqueio de senha vazada AQUI, onde não dá
 *    para pular pelo console do navegador;
 *  - derruba as sessões abertas nos outros aparelhos.
 */
export async function POST(request: Request) {
  const autenticado = await usuarioAutenticadoDaRequisicao(request);
  if (!autenticado) return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });
  const { user } = autenticado;

  const { permitido } = await limitarRequisicoes("auth-trocar-senha", { limite: 5, janelaSegundos: 900, identificador: user.id });
  if (!permitido) return NextResponse.json(RESPOSTA_RATE_LIMIT, { status: 429 });

  let bruto: unknown;
  try {
    bruto = await request.json();
  } catch {
    return NextResponse.json({ erro: "Dados inválidos." }, { status: 400 });
  }
  const dados = esquema.safeParse(bruto);
  if (!dados.success || !user.email) return NextResponse.json({ erro: "Dados inválidos." }, { status: 400 });

  const problema = await validarSenhaNova(dados.data.novaSenha, user.email);
  if (problema) return NextResponse.json({ erro: problema }, { status: 422 });

  const anon = supabaseAnonimoSemSessao();
  const { error: erroLogin } = await anon.auth.signInWithPassword({ email: user.email, password: dados.data.senhaAtual });
  if (erroLogin) {
    await registrarEventoSeguranca(user.id, "senha_troca_recusada", { motivo: "senha_atual_incorreta" });
    const credencial = erroLogin.message.toLowerCase().includes("invalid login credentials");
    return NextResponse.json(
      { erro: credencial ? "Senha atual incorreta." : "Não foi possível confirmar sua senha atual agora. Tente novamente em instantes." },
      { status: credencial ? 403 : 503 }
    );
  }
  // Encerra a sessão descartável criada só para conferir a senha.
  await anon.auth.signOut({ scope: "local" }).catch(() => null);

  const { error } = await supabaseAdmin().auth.admin.updateUserById(user.id, { password: dados.data.novaSenha });
  if (error) {
    console.error("[trocar-senha] erro ao atualizar:", error.message);
    return NextResponse.json({ erro: "Não foi possível trocar a senha. Tente novamente." }, { status: 500 });
  }
  // Senha nova = derruba as sessões abertas em OUTROS aparelhos (quem
  // eventualmente sabia a senha antiga perde o acesso); esta continua.
  const tokenAtual = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (tokenAtual) {
    const { error: erroSair } = await supabaseAdmin().auth.admin.signOut(tokenAtual, "others");
    if (erroSair) console.error("[trocar-senha] não revogou outras sessões:", erroSair.message);
  }
  await registrarEventoSeguranca(user.id, "senha_trocada", {});
  return NextResponse.json({ ok: true });
}
