import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { z } from "zod";
import { usuarioAutenticadoDaRequisicao, supabaseAdmin } from "@/lib/supabase/admin";
import { criarCheckout, AsaasError } from "@/lib/asaas/client";
import { adicionarUmMes, cancelarOutrasAssinaturasAtivas } from "@/lib/asaas/ativarAssinatura";
import type { Plano } from "@/lib/planos";
import { limitarRequisicoes, RESPOSTA_RATE_LIMIT } from "@/lib/rateLimit";
import { registrarEventoSeguranca } from "@/lib/auditoria";

export const runtime = "nodejs";

const PLANOS_PAGOS = ["mensal", "clt", "avancado", "grupo"] as const satisfies readonly Exclude<
  Plano,
  "gratis"
>[];

// Corpo esperado da requisição: só o campo `plano`, sendo um dos 4 valores
// pagos válidos. `.strict()` faz o schema recusar qualquer campo a mais que
// a rota não espera (checklist de segurança, item 6 — toda rota com corpo
// usa um schema de validação em vez de checar campo a campo na mão).
const corpoSchema = z.object({ plano: z.enum(PLANOS_PAGOS) }).strict();

/**
 * BYPASS TEMPORÁRIO DO ASAAS (21/set/2026) — enquanto a integração real não
 * está configurada de verdade (só Sandbox, que nem confirma pagamento
 * sozinho — ver contexto do projeto, sessão de 21/set/2026), esta rota pode
 * ativar o plano DIRETO, sem passar pelo checkout do Asaas, quando a env var
 * `ASAAS_CHECKOUT_BYPASS` estiver definida como "true" na Vercel.
 *
 * Pra reverter (voltar a cobrar de verdade pelo Asaas, inclusive já indo
 * direto pra produção, sem passar pelo Sandbox de novo): apagar essa env
 * var (ou pôr qualquer valor diferente de "true") nas Environment Variables
 * do projeto na Vercel e fazer um novo deploy. Nenhuma mudança de código é
 * necessária — a rota volta sozinha a chamar `criarCheckout()` de verdade.
 *
 * Assinaturas concedidas por aqui usam `gateway: "simulado"` — valor que já
 * existe na constraint `assinaturas_gateway_check` do banco (não precisa de
 * migração nenhuma) e deixa essas linhas claramente identificáveis como
 * "não é uma cobrança real do Asaas", nunca confundidas com `"asaas"` nem
 * com o trial grátis (`"trial"`).
 */
function bypassAsaasAtivo(): boolean {
  return process.env.ASAAS_CHECKOUT_BYPASS === "true";
}

/**
 * Inicia a assinatura de um plano pago: cria um checkout hospedado no
 * Asaas e uma linha "pendente" em `assinaturas` já ligada a ele (mesmo id
 * usado como externalReference do checkout — é assim que o webhook acha a
 * linha certa quando o pagamento confirmar). Devolve a URL do checkout para
 * o front-end redirecionar o usuário.
 *
 * Exceção: com o bypass temporário ativo (ver `bypassAsaasAtivo` acima), em
 * vez de tudo isso a rota ativa o plano na hora e devolve `{ ativadoDireto:
 * true }` — sem tocar no Asaas.
 */
export async function POST(request: Request) {
  const autenticado = await usuarioAutenticadoDaRequisicao(request);
  if (!autenticado) {
    return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });
  }
  const { supabase, user } = autenticado;

  // Rate limit: no máximo 8 tentativas de checkout por usuário a cada 5
  // minutos — dá espaço de sobra pra alguém testar planos diferentes, mas
  // barra um script martelando a rota (cada chamada bem-sucedida cria um
  // checkout de verdade no Asaas, então isso também evita gerar lixo lá).
  const { permitido } = await limitarRequisicoes("checkout", {
    limite: 8,
    janelaSegundos: 300,
    identificador: user.id,
  });
  if (!permitido) {
    await registrarEventoSeguranca(user.id, "checkout_rate_limitado");
    return NextResponse.json(RESPOSTA_RATE_LIMIT, { status: 429 });
  }

  const corpoBruto = await request.json().catch(() => null);
  const resultado = corpoSchema.safeParse(corpoBruto);
  if (!resultado.success) {
    return NextResponse.json({ erro: "Plano inválido." }, { status: 400 });
  }
  const { plano } = resultado.data;

  const id = randomUUID();

  if (bypassAsaasAtivo()) {
    // Ativa direto, sem Asaas — ver o aviso em `bypassAsaasAtivo` acima.
    // Usa a service role (supabaseAdmin), nunca o client comum: só código
    // de servidor pode gravar `status: "ativa"` (mesmo motivo do trial,
    // Finding #1 — o client comum nem consegue, a policy de RLS barra).
    const admin = supabaseAdmin();

    await admin.from("assinaturas").update({ status: "expirada" }).eq("usuario_id", user.id).eq("status", "pendente");

    const proximoPagamento = adicionarUmMes(new Date());

    const { error: erroInsercao } = await admin.from("assinaturas").insert({
      id,
      usuario_id: user.id,
      plano,
      status: "ativa",
      data_inicio: new Date().toISOString(),
      data_proximo_pagamento: proximoPagamento.toISOString(),
      gateway: "simulado",
    });
    if (erroInsercao) {
      return NextResponse.json({ erro: erroInsercao.message }, { status: 500 });
    }

    const { error: erroPerfil } = await admin.from("usuarios").update({ plano }).eq("id", user.id);
    if (erroPerfil) {
      return NextResponse.json({ erro: erroPerfil.message }, { status: 500 });
    }

    // Mesma regra do fluxo real: nunca duas assinaturas "ativa" ao mesmo
    // tempo (cancela a anterior — inclusive no Asaas de verdade, se for o
    // caso — e revoga o trial se a pessoa estava nele).
    await cancelarOutrasAssinaturasAtivas(admin, user.id, id);

    await registrarEventoSeguranca(user.id, "checkout_bypass_ativado", { plano, assinaturaId: id });

    return NextResponse.json({ ativadoDireto: true });
  }

  const origem = new URL(request.url).origin;

  try {
    const checkout = await criarCheckout({
      plano,
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

    await registrarEventoSeguranca(user.id, "checkout_criado", {
      plano,
      assinaturaId: id,
      asaasCheckoutId: checkout.id,
    });

    return NextResponse.json({ checkoutUrl: checkout.link });
  } catch (erro) {
    if (erro instanceof AsaasError) {
      // Loga a mensagem de validação/erro que o Asaas devolveu — sem isso,
      // um 502 aqui fica invisível nos logs da Vercel (o corpo de resposta
      // de APIs externas só aparece com o add-on pago Observability Plus).
      console.error(`Erro do Asaas ao criar checkout (status ${erro.status}):`, erro.message);
      return NextResponse.json({ erro: erro.message }, { status: 502 });
    }
    console.error("Erro ao criar checkout Asaas:", erro);
    return NextResponse.json({ erro: "Não foi possível iniciar o checkout." }, { status: 500 });
  }
}
