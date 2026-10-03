import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { enviarPushComDedupe } from "@/lib/push/enviarPush";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Rotina diária de notificações push (item 6.6 da especificação de
 * 03/out/2026), disparada pelo Cron da Vercel às 11:00 UTC (08:00 de
 * Brasília) — ver `vercel.json`.
 *
 * Segurança: a Vercel envia `Authorization: Bearer <CRON_SECRET>` nas
 * chamadas agendadas. Sem CRON_SECRET configurado, a rota recusa tudo.
 *
 * Para cada pessoa com push ativo, monta UM resumo do dia (o que vence
 * hoje: contas da empresa, parcelas de dívidas, parcelas a receber e
 * orçamentos parados há 3+ dias) e avisa separadamente as categorias do
 * orçamento que passaram de 85% do limite. Tudo com dedupe — rodar duas
 * vezes no mesmo dia não manda nada repetido.
 */
export async function GET(request: Request) {
  const segredo = process.env.CRON_SECRET;
  const cabecalho = request.headers.get("authorization") ?? "";
  if (!segredo || cabecalho !== `Bearer ${segredo}`) {
    return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  }

  const admin = supabaseAdmin();
  // "Hoje" no fuso de Brasília (UTC-3), independente do fuso do servidor.
  const agoraBr = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const hoje = agoraBr.toISOString().slice(0, 10);
  const ano = agoraBr.getUTCFullYear();
  const mes = agoraBr.getUTCMonth();
  const inicioMes = new Date(Date.UTC(ano, mes, 1)).toISOString().slice(0, 10);
  const fimMes = new Date(Date.UTC(ano, mes + 1, 0)).toISOString().slice(0, 10);
  const chaveMes = `${ano}-${String(mes + 1).padStart(2, "0")}`;
  const limiteFollowUp = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

  const { data: inscricoes } = await admin.from("push_subscriptions").select("usuario_id");
  const usuarios: string[] = Array.from(new Set(((inscricoes ?? []) as { usuario_id: string }[]).map((i) => i.usuario_id)));

  let resumosEnviados = 0;
  let alertasOrcamento = 0;

  for (const usuarioId of usuarios) {
    try {
      const [pagar, receber, parcelasInv, parcelasDiv, orcamentos, limites, despesasMes, categorias] = await Promise.all([
        admin.from("contas_pagar").select("valor").eq("usuario_id", usuarioId).eq("status", "pendente").eq("vencimento", hoje),
        admin.from("contas_receber").select("valor").eq("usuario_id", usuarioId).eq("status", "pendente").eq("vencimento", hoje),
        admin.from("investimento_parcelas").select("valor").eq("usuario_id", usuarioId).eq("pago", false).eq("data_vencimento", hoje),
        admin.from("divida_parcelas").select("divida_id, numero, valor, data_vencimento").eq("usuario_id", usuarioId),
        admin
          .from("orcamentos")
          .select("id")
          .eq("usuario_id", usuarioId)
          .in("status", ["orcado", "negociacao"])
          .lte("status_alterado_em", limiteFollowUp),
        admin.from("limites_categoria").select("categoria_id, limite_mensal").eq("usuario_id", usuarioId),
        admin
          .from("transacoes")
          .select("categoria_id, valor")
          .eq("usuario_id", usuarioId)
          .eq("tipo", "despesa")
          .eq("tipo_negocio", "pessoal")
          .gte("data", inicioMes)
          .lte("data", fimMes),
        admin.from("categorias").select("id, nome").or(`usuario_id.eq.${usuarioId},usuario_id.is.null`),
      ]);

      // Parcelas de dívida vencendo hoje e ainda não cobertas pelo valor pago
      // (mesma cascata de `calcularStatusParcelasDivida`).
      let dividasHoje = 0;
      const parcelasDivida = (parcelasDiv.data ?? []) as { divida_id: string; numero: number; valor: number; data_vencimento: string }[];
      const dividasComParcelaHoje = Array.from(new Set(parcelasDivida.filter((p) => p.data_vencimento === hoje).map((p) => p.divida_id)));
      if (dividasComParcelaHoje.length > 0) {
        const { data: pagos } = await admin
          .from("transacoes")
          .select("divida_id, valor")
          .eq("usuario_id", usuarioId)
          .in("divida_id", dividasComParcelaHoje);
        for (const dividaId of dividasComParcelaHoje) {
          let restante = (pagos ?? []).filter((t: { divida_id: string }) => t.divida_id === dividaId).reduce((a: number, t: { valor: number }) => a + Number(t.valor), 0);
          const ordenadas = parcelasDivida.filter((p) => p.divida_id === dividaId).sort((a, b) => a.numero - b.numero);
          for (const p of ordenadas) {
            const valor = Number(p.valor);
            const paga = restante >= valor - 0.005;
            if (paga) restante -= valor;
            if (!paga && p.data_vencimento === hoje) dividasHoje++;
          }
        }
      }

      const partes: string[] = [];
      const nPagar = pagar.data?.length ?? 0;
      const nReceber = receber.data?.length ?? 0;
      const nParcelasInv = parcelasInv.data?.length ?? 0;
      const nFollowUp = orcamentos.data?.length ?? 0;
      if (nPagar) partes.push(`${nPagar} conta(s) a pagar da empresa`);
      if (nReceber) partes.push(`${nReceber} conta(s) a receber da empresa`);
      if (dividasHoje) partes.push(`${dividasHoje} parcela(s) de dívida`);
      if (nParcelasInv) partes.push(`${nParcelasInv} parcela(s) a receber de empréstimo/revenda`);

      if (partes.length > 0 || nFollowUp > 0) {
        const corpo = [
          partes.length ? `Vence hoje: ${partes.join(", ")}.` : "",
          nFollowUp ? `${nFollowUp} orçamento(s) aguardando retorno há 3+ dias.` : "",
        ]
          .filter(Boolean)
          .join(" ");
        const enviado = await enviarPushComDedupe(admin, usuarioId, "resumo_diario", hoje, {
          titulo: "Seu dia financeiro",
          corpo,
          url: partes.length ? "/dashboard" : "/dashboard/empresa/orcamentos",
        });
        if (enviado) resumosEnviados++;
      }

      // Orçamento pessoal ≥ 85% do limite (dedupe por categoria + mês).
      const gasto = new Map<string, number>();
      for (const t of (despesasMes.data ?? []) as { categoria_id: string | null; valor: number }[]) {
        if (!t.categoria_id) continue;
        gasto.set(t.categoria_id, (gasto.get(t.categoria_id) ?? 0) + Number(t.valor));
      }
      for (const l of (limites.data ?? []) as { categoria_id: string; limite_mensal: number }[]) {
        const limite = Number(l.limite_mensal);
        if (limite <= 0) continue;
        const pct = ((gasto.get(l.categoria_id) ?? 0) / limite) * 100;
        if (pct < 85) continue;
        const nome = (categorias.data ?? []).find((c: { id: string }) => c.id === l.categoria_id)?.nome ?? "Uma categoria";
        const enviado = await enviarPushComDedupe(admin, usuarioId, "orcamento85", `${l.categoria_id}:${chaveMes}`, {
          titulo: pct >= 100 ? "Orçamento estourado" : "Orçamento quase no limite",
          corpo: `${nome} já está em ${Math.round(pct)}% do limite do mês.`,
          url: "/dashboard/orcamento",
        });
        if (enviado) alertasOrcamento++;
      }
    } catch (erro) {
      // Um usuário com problema não pode travar a rotina dos outros.
      console.error(`Cron de notificações falhou para ${usuarioId}:`, erro);
    }
  }

  return NextResponse.json({ ok: true, usuarios: usuarios.length, resumosEnviados, alertasOrcamento });
}
