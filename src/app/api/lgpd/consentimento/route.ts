import { NextResponse } from "next/server";
import { z } from "zod";
import { usuarioAutenticadoDaRequisicao, supabaseAdmin } from "@/lib/supabase/admin";
import { limitarRequisicoes, RESPOSTA_RATE_LIMIT } from "@/lib/rateLimit";
import { registrarEventoSeguranca } from "@/lib/auditoria";
import { ipDaRequisicao } from "@/lib/seguranca/requisicao";
import { VERSAO_DOCUMENTOS_LEGAIS } from "@/lib/legal/versao";

export const runtime = "nodejs";

const esquema = z
  .object({
    versao: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    // automatico = aceite feito no cadastro (lido dos metadados do usuário);
    // aceite_manual = pessoa clicou "Li e aceito" dentro do app;
    // exportacao = só registra a auditoria da portabilidade.
    origem: z.enum(["automatico", "aceite_manual", "exportacao"]),
  })
  .strict();

/**
 * Registro formal do consentimento (item 2.4 da especificação de
 * 09/out/2026): identificador do usuário, versão dos documentos, IP de
 * origem e carimbo UTC, na tabela `user_consents`. Gravado só pelo servidor
 * (o RLS da tabela não deixa o navegador inserir), para o IP e a hora não
 * poderem ser forjados pelo cliente.
 */
export async function POST(request: Request) {
  const autenticado = await usuarioAutenticadoDaRequisicao(request);
  if (!autenticado) return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });
  const { user } = autenticado;

  const { permitido } = await limitarRequisicoes("lgpd-consentimento", { limite: 20, janelaSegundos: 3600, identificador: user.id });
  if (!permitido) return NextResponse.json(RESPOSTA_RATE_LIMIT, { status: 429 });

  let bruto: unknown;
  try {
    bruto = await request.json();
  } catch {
    return NextResponse.json({ erro: "Corpo inválido." }, { status: 400 });
  }
  const validado = esquema.safeParse(bruto);
  if (!validado.success) return NextResponse.json({ erro: "Dados inválidos." }, { status: 400 });
  const { versao, origem } = validado.data;
  // Só registra aceite de um documento que existe (a versão vigente).
  if (origem !== "exportacao" && versao !== VERSAO_DOCUMENTOS_LEGAIS) {
    return NextResponse.json({ erro: "Versão dos termos desatualizada. Recarregue a página." }, { status: 409 });
  }

  if (origem === "exportacao") {
    await registrarEventoSeguranca(user.id, "lgpd_exportacao_dados");
    return NextResponse.json({ ok: true });
  }

  // "automatico" só vale se a pessoa marcou o aceite no cadastro (o app
  // grava a versão aceita nos metadados da conta no signUp).
  const meta = (user.user_metadata ?? {}) as { consentimento_versao?: string };
  const versaoAceita = origem === "automatico" ? (meta.consentimento_versao === VERSAO_DOCUMENTOS_LEGAIS ? meta.consentimento_versao : undefined) : versao;
  if (!versaoAceita) return NextResponse.json({ ok: true, registrado: false });

  const admin = supabaseAdmin();
  const { data: existente } = await admin
    .from("user_consents")
    .select("id")
    .eq("user_id", user.id)
    .eq("versao_termos", versaoAceita)
    .maybeSingle();
  if (existente) return NextResponse.json({ ok: true, registrado: false });

  const { error } = await admin.from("user_consents").insert({
    user_id: user.id,
    versao_termos: versaoAceita,
    versao_privacidade: versaoAceita,
    ip: ipDaRequisicao(request),
    user_agent: (request.headers.get("user-agent") ?? "").slice(0, 300) || null,
  });
  if (error) {
    console.error("Erro ao gravar consentimento:", error.message);
    return NextResponse.json({ erro: "Não foi possível registrar." }, { status: 500 });
  }
  await registrarEventoSeguranca(user.id, "lgpd_consentimento_registrado", { versao: versaoAceita, origem });
  return NextResponse.json({ ok: true, registrado: true });
}
