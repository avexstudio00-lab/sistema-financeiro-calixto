import { NextResponse } from "next/server";
import { usuarioAutenticadoDaRequisicao, supabaseAdmin } from "@/lib/supabase/admin";
import { limitarRequisicoes, RESPOSTA_RATE_LIMIT } from "@/lib/rateLimit";
import { enviarPushComDedupe } from "@/lib/push/enviarPush";

export const runtime = "nodejs";

/**
 * Checagem "preguicosa" (Bloco 5, notificacao push) do alerta de orcamento:
 * chamada pelo painel a cada carregamento (ver `verificarAlertaOrcamentoPush`
 * em `src/lib/data/notificacoesPush.ts`) quando o proprio painel ja calculou
 * que alguma categoria bateu 80% do limite mensal.
 *
 * O servidor NUNCA confia no percentual calculado no client -- recalcula tudo
 * de novo aqui com o mesmo criterio do painel (mesma janela de "mes atual"
 * de `limitesDoMesAtual()`, mesmas transacoes pessoais com categoria e
 * despesa). Chamar esta rota nao custa nada mesmo se nada tiver mudado: o
 * dedupe por categoria+mes em `enviarPushComDedupe` garante que a mesma
 * categoria so notifica uma vez por mes, nao importa quantas vezes o painel
 * carregar.
 */
export async function POST(request: Request) {
  const autenticado = await usuarioAutenticadoDaRequisicao(request);
  if (!autenticado) {
    return NextResponse.json({ erro: "Nao autenticado." }, { status: 401 });
  }
  const { user } = autenticado;
  const admin = supabaseAdmin();

  const { permitido } = await limitarRequisicoes("notificacoes-orcamento", {
    limite: 60,
    janelaSegundos: 3600,
    identificador: user.id,
  });
  if (!permitido) {
    return NextResponse.json(RESPOSTA_RATE_LIMIT, { status: 429 });
  }

  const agora = new Date();
  const inicio = new Date(agora.getFullYear(), agora.getMonth(), 1).toISOString().slice(0, 10);
  const fim = new Date(agora.getFullYear(), agora.getMonth() + 1, 0).toISOString().slice(0, 10);
  const chaveMes = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}`;

  const [{ data: limites }, { data: transacoesMes }, { data: categoriasUsuario }] = await Promise.all([
    admin.from("limites_categoria").select("categoria_id, limite_mensal").eq("usuario_id", user.id),
    admin
      .from("transacoes")
      .select("categoria_id, valor")
      .eq("usuario_id", user.id)
      .eq("tipo", "despesa")
      .eq("tipo_negocio", "pessoal")
      .gte("data", inicio)
      .lte("data", fim),
    admin.from("categorias").select("id, nome").eq("usuario_id", user.id),
  ]);

  if (!limites || limites.length === 0) {
    return NextResponse.json({ ok: true, notificados: 0 });
  }

  const gastoPorCategoria = new Map<string, number>();
  for (const t of transacoesMes ?? []) {
    if (!t.categoria_id) continue;
    gastoPorCategoria.set(t.categoria_id, (gastoPorCategoria.get(t.categoria_id) ?? 0) + Number(t.valor));
  }

  let notificados = 0;
  for (const limite of limites) {
    const limiteMensal = Number(limite.limite_mensal);
    if (limiteMensal <= 0) continue;

    const gasto = gastoPorCategoria.get(limite.categoria_id) ?? 0;
    const percentual = (gasto / limiteMensal) * 100;
    if (percentual < 80) continue;

    const nome = categoriasUsuario?.find((c) => c.id === limite.categoria_id)?.nome ?? "uma categoria";
    const notificouAgora = await enviarPushComDedupe(
      admin,
      user.id,
      "orcamento",
      `${limite.categoria_id}:${chaveMes}`,
      {
        titulo: percentual >= 100 ? "Orcamento estourado" : "Orcamento quase no limite",
        corpo: `${nome} ja esta em ${Math.round(percentual)}% do limite mensal.`,
        url: "/dashboard/orcamento",
      }
    );
    if (notificouAgora) notificados++;
  }

  return NextResponse.json({ ok: true, notificados });
}
