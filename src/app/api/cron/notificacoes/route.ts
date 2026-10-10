import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { subtrairDiasUteis } from "@/lib/util/diasUteis";
import { enviarPushParaUsuario, marcarAvisoSeNovo, aplicarPrivacidade, TEXTO_PRIVADO, type PayloadPush } from "@/lib/push/enviarPush";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Rotina diária de push REAL na tela de bloqueio (item 6.6 da especificação
 * de 03/out/2026), disparada pelo Cron da Vercel às 11:00 UTC (08:00 de
 * Brasília) — ver `vercel.json`.
 *
 * Segurança: a Vercel envia `Authorization: Bearer <CRON_SECRET>`. Sem
 * CRON_SECRET configurado, a rota recusa tudo.
 *
 * Para cada pessoa com push ativo, procura o que vence HOJE e AMANHÃ:
 * contas a pagar/receber da empresa (inclui venda fiada), contas fixas,
 * parcelas de dívida, parcelas e vencimentos de empréstimo/revenda a
 * receber, orçamentos sem resposta há 3+ dias e categorias do orçamento
 * acima de 85%, cobrança ativa de fiado vencido (a cada 3 dias), lançamentos
 * pessoais com vencimento, fatura de cartão e o lembrete da DASN-SIMEI em
 * maio. Cada aviso tem dedupe próprio (rodar duas vezes no mesmo
 * dia não repete nada). Até 4 avisos saem um por um, com valor e descrição;
 * o resto vira um resumo. Com "Ocultar prévia" ligado, sai uma única
 * notificação genérica.
 */

interface Aviso {
  tipo: string;
  chave: string;
  payload: PayloadPush;
}

const MAX_INDIVIDUAIS = 4;

function moeda(v: number): string {
  return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function quando(data: string, hoje: string): string {
  return data === hoje ? "hoje" : "amanhã";
}

function ultimoDiaDoMes(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
}

export async function GET(request: Request) {
  const segredo = process.env.CRON_SECRET;
  const cabecalho = request.headers.get("authorization") ?? "";
  if (!segredo || cabecalho !== `Bearer ${segredo}`) {
    return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  }

  const admin = supabaseAdmin();
  // "Hoje" e "amanhã" no fuso de Brasília (UTC-3), independente do servidor.
  const agoraBr = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const hoje = agoraBr.toISOString().slice(0, 10);
  const amanhaData = new Date(agoraBr.getTime() + 24 * 60 * 60 * 1000);
  const amanha = amanhaData.toISOString().slice(0, 10);
  const datas = [hoje, amanha];
  const ano = agoraBr.getUTCFullYear();
  const mes = agoraBr.getUTCMonth();
  const inicioMes = new Date(Date.UTC(ano, mes, 1)).toISOString().slice(0, 10);
  const fimMes = new Date(Date.UTC(ano, mes + 1, 0)).toISOString().slice(0, 10);
  const chaveMes = `${ano}-${String(mes + 1).padStart(2, "0")}`;
  // Follow-up de orçamento: 3 DIAS ÚTEIS sem interação (item 4.6).
  const limiteFollowUp = new Date(subtrairDiasUteis(agoraBr, 3).getTime() + 24 * 60 * 60 * 1000 - 1).toISOString();

  const { data: inscricoes } = await admin.from("push_subscriptions").select("usuario_id");
  const usuarios: string[] = Array.from(new Set(((inscricoes ?? []) as { usuario_id: string }[]).map((i) => i.usuario_id)));

  let notificacoesEnviadas = 0;

  for (const usuarioId of usuarios) {
    try {
      const [pagar, receber, fixas, dividas, parcelasDiv, parcelasInv, emprestimosVista, orcamentos, limites, despesasMes, categorias] =
        await Promise.all([
          admin.from("contas_pagar").select("id, descricao, valor, vencimento").eq("usuario_id", usuarioId).eq("status", "pendente").in("vencimento", datas),
          admin
            .from("contas_receber")
            .select("id, descricao, valor, vencimento, origem, parcela_numero, parcela_total, clientes(nome)")
            .eq("usuario_id", usuarioId)
            .eq("status", "pendente")
            .in("vencimento", datas),
          admin.from("contas_fixas").select("id, descricao, valor, tipo, dia_vencimento, data_inicio, data_fim").eq("usuario_id", usuarioId).eq("ativa", true),
          admin.from("dividas").select("id, nome, quitada").eq("usuario_id", usuarioId),
          admin.from("divida_parcelas").select("id, divida_id, numero, valor, data_vencimento, status_manual").eq("usuario_id", usuarioId),
          admin
            .from("investimento_parcelas")
            .select("id, numero, valor, data_vencimento, investimentos(nome, tipo, numero_parcelas)")
            .eq("usuario_id", usuarioId)
            .eq("pago", false)
            .in("data_vencimento", datas),
          admin
            .from("investimentos")
            .select("id, nome, valor_retornavel, valor_investido, data_vencimento_final, forma_pagamento")
            .eq("usuario_id", usuarioId)
            .eq("tipo", "emprestimo")
            .eq("quitado", false)
            .in("data_vencimento_final", datas),
          admin
            .from("orcamentos")
            .select("id, titulo, status_alterado_em, clientes(nome)")
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

      const avisos: Aviso[] = [];
      const titulo = "Calixto — Vencimento Próximo";

      for (const c of (pagar.data ?? []) as { id: string; descricao: string | null; valor: number; vencimento: string }[]) {
        avisos.push({
          tipo: "venc_pagar",
          chave: `${c.id}:${c.vencimento}:${quando(c.vencimento, hoje)}`,
          payload: {
            titulo,
            corpo: `${c.descricao || "Conta a pagar"} vence ${quando(c.vencimento, hoje)} — ${moeda(c.valor)}`,
            url: "/dashboard/empresa/contas",
            tag: `pagar-${c.id}`,
          },
        });
      }

      for (const c of (receber.data ?? []) as {
        id: string;
        descricao: string | null;
        valor: number;
        vencimento: string;
        origem: string | null;
        parcela_numero: number | null;
        parcela_total: number | null;
        clientes: { nome: string } | { nome: string }[] | null;
      }[]) {
        const cliente = Array.isArray(c.clientes) ? c.clientes[0]?.nome : c.clientes?.nome;
        const parcela = c.parcela_numero && c.parcela_total ? ` (parcela ${c.parcela_numero}/${c.parcela_total})` : "";
        const rotulo = c.origem === "fiado" ? `Venda fiada${cliente ? ` de ${cliente}` : ""}` : c.descricao || (cliente ? `Recebimento de ${cliente}` : "Conta a receber");
        avisos.push({
          tipo: "venc_receber",
          chave: `${c.id}:${c.vencimento}:${quando(c.vencimento, hoje)}`,
          payload: {
            titulo: "Calixto — A receber",
            corpo: `${rotulo}${parcela} vence ${quando(c.vencimento, hoje)} — ${moeda(c.valor)}`,
            url: "/dashboard/empresa/contas",
            tag: `receber-${c.id}`,
          },
        });
      }

      // Item 6.4 / 12.4 (09/out/2026): cobrança ATIVA de venda fiada vencida
      // (não só o aviso do dia do vencimento): lembra a cada 3 dias de atraso.
      const { data: fiadosVencidos } = await admin
        .from("contas_receber")
        .select("id, valor, vencimento, clientes(nome)")
        .eq("usuario_id", usuarioId)
        .eq("status", "pendente")
        .eq("origem", "fiado")
        .lt("vencimento", hoje)
        .limit(20);
      for (const c of (fiadosVencidos ?? []) as { id: string; valor: number; vencimento: string; clientes: { nome: string } | { nome: string }[] | null }[]) {
        const cliente = Array.isArray(c.clientes) ? c.clientes[0]?.nome : c.clientes?.nome;
        const atraso = Math.round((Date.parse(hoje) - Date.parse(c.vencimento)) / 86400000);
        avisos.push({
          tipo: "cobranca_fiado",
          chave: `${c.id}:${Math.floor(atraso / 3)}`,
          payload: {
            titulo: "Calixto — Cobrar venda fiada",
            corpo: `${cliente ?? "Cliente"} está devendo ${moeda(c.valor)} há ${atraso} dia(s). Toque para cobrar no WhatsApp.`,
            url: "/dashboard/empresa",
            tag: `cobranca-${c.id}`,
          },
        });
      }

      // Checklist (10/out/2026) — alertas de vencimento PESSOAIS: lançamentos
      // com data de vencimento hoje/amanhã e fatura de cartão que vence.
      const [{ data: lancamentosVencendo }, { data: cartoes }] = await Promise.all([
        admin
          .from("transacoes")
          .select("id, descricao, valor, data_vencimento")
          .eq("usuario_id", usuarioId)
          .eq("tipo", "despesa")
          .in("data_vencimento", datas)
          .limit(20),
        admin.from("contas").select("id, nome, dia_vencimento").eq("usuario_id", usuarioId).eq("tipo", "cartao_credito").not("dia_vencimento", "is", null),
      ]);
      for (const t of (lancamentosVencendo ?? []) as { id: string; descricao: string | null; valor: number; data_vencimento: string }[]) {
        avisos.push({
          tipo: "venc_lancamento",
          chave: `${t.id}:${t.data_vencimento}:${quando(t.data_vencimento, hoje)}`,
          payload: {
            titulo,
            corpo: `${t.descricao || "Conta"} vence ${quando(t.data_vencimento, hoje)} — ${moeda(t.valor)}`,
            url: "/dashboard/extrato",
            tag: `lanc-${t.id}`,
          },
        });
      }
      for (const c of (cartoes ?? []) as { id: string; nome: string; dia_vencimento: number }[]) {
        for (const d of datas) {
          const [a, m, dd] = d.split("-").map(Number);
          const diaEfetivo = Math.min(c.dia_vencimento, ultimoDiaDoMes(a, m - 1));
          if (dd !== diaEfetivo) continue;
          avisos.push({
            tipo: "venc_fatura",
            chave: `${c.id}:${d}:${quando(d, hoje)}`,
            payload: {
              titulo,
              corpo: `Fatura do cartão ${c.nome} vence ${quando(d, hoje)}.`,
              url: `/dashboard/cartao/${c.id}`,
              tag: `fatura-${c.id}`,
            },
          });
        }
      }

      // Checklist — DASN-SIMEI (declaração anual do MEI, prazo 31/05): um
      // lembrete por semana entre 1º/maio e 31/maio para quem é MEI.
      if (mes === 4) {
        const { data: perfilUsuario } = await admin.from("usuarios").select("tipo_perfil").eq("id", usuarioId).maybeSingle();
        if ((perfilUsuario as { tipo_perfil: string | null } | null)?.tipo_perfil === "mei") {
          const semana = Math.floor((agoraBr.getUTCDate() - 1) / 7);
          avisos.push({
            tipo: "dasn_anual",
            chave: `${ano}:${semana}`,
            payload: {
              titulo: "Calixto — DASN-SIMEI",
              corpo: `A declaração anual do MEI (faturamento de ${ano - 1}) vence em 31/05. O total do ano está pronto na tela DAS/Impostos.`,
              url: "/dashboard/empresa/das",
              tag: `dasn-${ano}`,
            },
          });
        }
      }

      // Contas fixas: o dia de vencimento vale todo mês (dia 31 em mês curto
      // cai no último dia, mesma regra de contasFixas.ts).
      for (const f of (fixas.data ?? []) as {
        id: string;
        descricao: string;
        valor: number;
        tipo: string;
        dia_vencimento: number;
        data_inicio: string;
        data_fim: string | null;
      }[]) {
        for (const d of datas) {
          const [a, m, dia] = d.split("-").map(Number);
          const diaReal = Math.min(f.dia_vencimento, ultimoDiaDoMes(a, m - 1));
          if (dia !== diaReal || d < f.data_inicio || (f.data_fim && d > f.data_fim)) continue;
          const verbo = f.tipo === "receita" ? "entra" : "vence";
          avisos.push({
            tipo: "venc_fixa",
            chave: `${f.id}:${d}:${quando(d, hoje)}`,
            payload: {
              titulo: f.tipo === "receita" ? "Calixto — Entrada prevista" : titulo,
              corpo: `${f.descricao} ${verbo} ${quando(d, hoje)} — ${moeda(f.valor)}`,
              url: "/dashboard/contas-fixas",
              tag: `fixa-${f.id}`,
            },
          });
        }
      }

      // Parcelas de dívida ainda não pagas (status manual primeiro; sem
      // ele, a mesma cascata de `calcularStatusParcelasDivida`).
      const listaDividas = ((dividas.data ?? []) as { id: string; nome: string; quitada: boolean }[]).filter((d) => !d.quitada);
      const todasParcelasDiv = (parcelasDiv.data ?? []) as {
        id: string;
        divida_id: string;
        numero: number;
        valor: number;
        data_vencimento: string;
        status_manual: string | null;
      }[];
      const dividasComVencimento = listaDividas.filter((d) =>
        todasParcelasDiv.some((p) => p.divida_id === d.id && datas.includes(p.data_vencimento))
      );
      if (dividasComVencimento.length > 0) {
        const { data: pagos } = await admin
          .from("transacoes")
          .select("divida_id, valor")
          .eq("usuario_id", usuarioId)
          .in(
            "divida_id",
            dividasComVencimento.map((d) => d.id)
          );
        for (const divida of dividasComVencimento) {
          let restante = ((pagos ?? []) as { divida_id: string; valor: number }[])
            .filter((t) => t.divida_id === divida.id)
            .reduce((acc, t) => acc + Number(t.valor), 0);
          const ordenadas = todasParcelasDiv.filter((p) => p.divida_id === divida.id).sort((a, b) => a.numero - b.numero);
          for (const p of ordenadas) {
            const valor = Number(p.valor);
            let paga: boolean;
            if (p.status_manual === "pago") paga = true;
            else if (p.status_manual === "pendente" || p.status_manual === "vencido") paga = false;
            else {
              paga = restante >= valor - 0.005;
              if (paga) restante -= valor;
            }
            if (paga || !datas.includes(p.data_vencimento)) continue;
            avisos.push({
              tipo: "venc_divida",
              chave: `${p.id}:${p.data_vencimento}:${quando(p.data_vencimento, hoje)}`,
              payload: {
                titulo,
                corpo: `Parcela ${p.numero}/${ordenadas.length} da dívida ${divida.nome} vence ${quando(p.data_vencimento, hoje)} — ${moeda(valor)}`,
                url: "/dashboard/dividas",
                tag: `divida-${p.id}`,
              },
            });
          }
        }
      }

      for (const p of (parcelasInv.data ?? []) as {
        id: string;
        numero: number;
        valor: number;
        data_vencimento: string;
        investimentos: { nome: string; tipo: string; numero_parcelas: number | null } | { nome: string; tipo: string; numero_parcelas: number | null }[] | null;
      }[]) {
        const inv = Array.isArray(p.investimentos) ? p.investimentos[0] : p.investimentos;
        const total = inv?.numero_parcelas ? `/${inv.numero_parcelas}` : "";
        const oque = inv?.tipo === "revenda" ? `da revenda ${inv?.nome ?? ""}` : `do empréstimo de ${inv?.nome ?? ""}`;
        avisos.push({
          tipo: "venc_parcela_inv",
          chave: `${p.id}:${p.data_vencimento}:${quando(p.data_vencimento, hoje)}`,
          payload: {
            titulo: "Calixto — A receber",
            corpo: `Parcela ${p.numero}${total} ${oque.trim()} vence ${quando(p.data_vencimento, hoje)} — ${moeda(p.valor)}`,
            url: "/dashboard/investimentos",
            tag: `parcela-inv-${p.id}`,
          },
        });
      }

      for (const e of (emprestimosVista.data ?? []) as {
        id: string;
        nome: string;
        valor_retornavel: number | null;
        valor_investido: number;
        data_vencimento_final: string;
        forma_pagamento: string | null;
      }[]) {
        if (e.forma_pagamento === "parcelado") continue; // já avisado parcela a parcela
        avisos.push({
          tipo: "venc_emprestimo",
          chave: `${e.id}:${e.data_vencimento_final}:${quando(e.data_vencimento_final, hoje)}`,
          payload: {
            titulo: "Calixto — A receber",
            corpo: `Empréstimo de ${e.nome} vence ${quando(e.data_vencimento_final, hoje)} — ${moeda(Number(e.valor_retornavel ?? e.valor_investido))}`,
            url: "/dashboard/investimentos",
            tag: `emprestimo-${e.id}`,
          },
        });
      }

      for (const o of (orcamentos.data ?? []) as {
        id: string;
        titulo: string | null;
        status_alterado_em: string;
        clientes: { nome: string } | { nome: string }[] | null;
      }[]) {
        const cliente = Array.isArray(o.clientes) ? o.clientes[0]?.nome : o.clientes?.nome;
        avisos.push({
          tipo: "followup_orcamento",
          // Um aviso por "parada": se o status mudar e parar de novo, avisa outra vez.
          chave: `${o.id}:${o.status_alterado_em.slice(0, 10)}`,
          payload: {
            titulo: "Calixto — Orçamento sem resposta",
            corpo: `${o.titulo || "Orçamento"}${cliente ? ` para ${cliente}` : ""} está sem retorno há 3 dias úteis ou mais. Que tal chamar no WhatsApp?`,
            url: "/dashboard/empresa/orcamentos",
            tag: `orcamento-${o.id}`,
          },
        });
      }

      // Orçamento pessoal ≥ 85% do limite (um aviso por categoria por mês).
      const gasto = new Map<string, number>();
      for (const t of (despesasMes.data ?? []) as { categoria_id: string | null; valor: number }[]) {
        if (!t.categoria_id) continue;
        gasto.set(t.categoria_id, (gasto.get(t.categoria_id) ?? 0) + Number(t.valor));
      }
      for (const l of (limites.data ?? []) as { categoria_id: string; limite_mensal: number }[]) {
        const limite = Number(l.limite_mensal);
        if (limite <= 0) continue;
        const usado = gasto.get(l.categoria_id) ?? 0;
        const pct = (usado / limite) * 100;
        if (pct < 85) continue;
        const nome = ((categorias.data ?? []) as { id: string; nome: string }[]).find((c) => c.id === l.categoria_id)?.nome ?? "Uma categoria";
        avisos.push({
          tipo: "orcamento85",
          chave: `${l.categoria_id}:${chaveMes}`,
          payload: {
            titulo: pct >= 100 ? "Calixto — Orçamento estourado" : "Calixto — Orçamento quase no limite",
            corpo: `${nome} já está em ${Math.round(pct)}% do limite do mês (${moeda(usado)} de ${moeda(limite)})`,
            url: "/dashboard/orcamento",
            tag: `orcamento85-${l.categoria_id}`,
          },
        });
      }

      // Dedupe: só o que ainda não foi avisado.
      const novos: Aviso[] = [];
      for (const a of avisos) {
        if (await marcarAvisoSeNovo(admin, usuarioId, a.tipo, a.chave)) novos.push(a);
      }
      if (novos.length === 0) continue;

      // Modo privado: uma única notificação genérica.
      const teste = await aplicarPrivacidade(admin, usuarioId, novos[0].payload);
      if (teste.corpo === TEXTO_PRIVADO) {
        notificacoesEnviadas += Math.min(1, await enviarPushParaUsuario(admin, usuarioId, { titulo: "Calixto", corpo: TEXTO_PRIVADO, url: "/dashboard", tag: `resumo-${hoje}` }));
        continue;
      }

      // Hoje primeiro, depois amanhã.
      novos.sort((a, b) => Number(b.chave.endsWith(":hoje")) - Number(a.chave.endsWith(":hoje")));
      const individuais = novos.length > MAX_INDIVIDUAIS + 1 ? novos.slice(0, MAX_INDIVIDUAIS) : novos;
      for (const a of individuais) {
        if ((await enviarPushParaUsuario(admin, usuarioId, a.payload)) > 0) notificacoesEnviadas++;
      }
      const resto = novos.length - individuais.length;
      if (resto > 0) {
        if (
          (await enviarPushParaUsuario(admin, usuarioId, {
            titulo: "Calixto — Mais avisos",
            corpo: `E mais ${resto} vencimento(s) entre hoje e amanhã. Toque para ver.`,
            url: "/dashboard",
            tag: `resumo-${hoje}`,
          })) > 0
        )
          notificacoesEnviadas++;
      }
    } catch (erro) {
      // Um usuário com problema não pode travar a rotina dos outros.
      console.error(`Cron de notificações falhou para ${usuarioId}:`, erro);
    }
  }

  return NextResponse.json({ ok: true, usuarios: usuarios.length, notificacoesEnviadas });
}
