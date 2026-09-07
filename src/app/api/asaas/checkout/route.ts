import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { usuarioAutenticadoDaRequisicao } from "@/lib/supabase/admin";
import { criarCheckout, AsaasError } from "@/lib/asaas/client";
import type { Plano } from "@/lib/planos";

export const runtime = "nodejs";

const PLANOS_PAGOS: Exclude<Plano, "gratis">[] = ["mensal", "clt", "avancado", "grupo"];

/**
 * Inicia a assinatura de um plano pago: cria um checkout hospedado no
 * Asaas e uma linha "pendente" em `assinaturas` já ligada a ele (mesmo id
 * usado como externalReference do checkout — é assim que o webhook acha a
 * linha certa quando o pagamento confirmar). Devolve a URL do checkout para
 * o front-end redirecionar o usuário.
 */
export async function POST(request: Request) {
  const autenticado = await usuarioAutenticadoDaRequisicao(request);
  if (!autenticado) {
    return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });
  }
  const { supabase, user } = autenticado;

  let plano: Plano | undefined;
  try {
    const corpo = await request.json();
    plano = corpo?.plano;
  } catch {
    return NextResponse.json({ erro: "Corpo da requisição inválido." }, { status: 400 });
  }

  if (!plano || !PLANOS_PAGOS.includes(plano as Exclude<Plano, "gratis">)) {
    return NextResponse.json({ erro: "Plano inválido." }, { status: 400 });
  }

  const origem = new URL(request.url).origin;
  const id = randomUUID();

  try {
    const checkout = await criarCheckout({
      plano: plano as Exclude<Plano, "gratis">,
      externalReference: id,
      successUrl: `${origem}/dashboard/plano?asaas=sucesso`,
      cancelUrl: `${origem}/dashboard/plano?asaas=cancelado`,
      expiredUrl: `${origem}/dashboard/plano?asaas=expirado`,
    });

    // Higiene: tentativas de checkout "pendente" antigas do mesmo usuário,
    // que nunca chegaram a ser pagas, não servem mais pra nada — marca como
    // expiradas para não acumular lixo em `assinaturas` (não falha o fluxo
    // se isso der erro, é só limpeza).
    await supabase
      .from("assinaturas")
      .update({ status: "expirada" })
      .eq("usuario_id", user.id)
      .eq("status", "pendente")
      .eq("gateway", "asaas");

    const { error: erroInsercao } = await supabase.from("assinaturas").insert({
      id,
      usuario_id: user.id,
      plano,
      status: "pendente",
      data_inicio: new Date().toISOString(),
      gateway: "asaas",
      asaas_checkout_id: checkout.id,
    });

    if (erroInsercao) {
      return NextResponse.json({ erro: erroInsercao.message }, { status: 500 });
    }

    return NextResponse.json({ checkoutUrl: checkout.link });
  } catch (erro) {
    if (erro instanceof AsaasError) {
      return NextResponse.json({ erro: erro.message }, { status: 502 });
    }
    console.error("Erro ao criar checkout Asaas:", erro);
    return NextResponse.json({ erro: "Não foi possível iniciar o checkout." }, { status: 500 });
  }
}
