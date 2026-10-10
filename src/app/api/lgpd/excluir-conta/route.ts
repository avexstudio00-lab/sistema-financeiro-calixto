import { NextResponse } from "next/server";
import { z } from "zod";
import { usuarioAutenticadoDaRequisicao, supabaseAdmin, supabaseAnonimoSemSessao } from "@/lib/supabase/admin";
import { limitarRequisicoes, RESPOSTA_RATE_LIMIT } from "@/lib/rateLimit";
import { registrarEventoSeguranca } from "@/lib/auditoria";

export const runtime = "nodejs";
export const maxDuration = 60;

const FRASE = "EXCLUIR MINHA CONTA";

const esquema = z
  .object({
    senha: z.string().min(1).max(200),
    confirmacao: z.literal(FRASE),
  })
  .strict();

/** Ordem pensada para respeitar as chaves estrangeiras (filhos antes dos
 * pais). Toda tabela aqui tem `usuario_id`. */
const TABELAS_EM_ORDEM = [
  "vendas",
  "contas_receber",
  "contas_pagar",
  "notas_fiscais",
  "orcamentos",
  "servicos",
  "produtos",
  "clientes",
  "fornecedores",
  "investimento_pagamentos",
  "investimento_parcelas",
  "metas",
  "investimentos",
  "divida_parcelas",
  "transacoes",
  "dividas",
  "contas_fixas",
  "limites_categoria",
  "modelos_lancamento",
  "analises_ia",
  "categorias",
  "contas",
  "config_negocio",
  "preferencias_privacidade",
  "push_subscriptions",
  "notificacoes_enviadas",
  "assinaturas",
  "empresas",
  "eventos_seguranca",
] as const;

async function apagarPasta(admin: ReturnType<typeof supabaseAdmin>, bucket: string, pasta: string) {
  for (let i = 0; i < 50; i++) {
    const { data } = await admin.storage.from(bucket).list(pasta, { limit: 100 });
    const arquivos = ((data ?? []) as { name: string }[]).map((f) => `${pasta}/${f.name}`);
    if (arquivos.length === 0) return;
    await admin.storage.from(bucket).remove(arquivos);
  }
}

/**
 * Direito ao esquecimento (LGPD art. 18, VI — item 2.4 da especificação de
 * 09/out/2026). Dupla confirmação: a tela pede a frase digitada e a senha
 * atual; aqui o servidor confere as duas de novo (a senha por um login
 * real, sem guardar nada). Depois apaga de vez (hard delete) todas as linhas
 * do titular, os arquivos dele no Storage e, por fim, o próprio login.
 *
 * Contas de pagamento já assinadas no Asaas não são canceladas aqui: a tela
 * avisa para cancelar a assinatura antes (o cancelamento passa pelo gateway).
 */
export async function POST(request: Request) {
  const autenticado = await usuarioAutenticadoDaRequisicao(request);
  if (!autenticado) return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });
  const { user } = autenticado;

  const { permitido } = await limitarRequisicoes("lgpd-excluir-conta", { limite: 5, janelaSegundos: 3600, identificador: user.id });
  if (!permitido) return NextResponse.json(RESPOSTA_RATE_LIMIT, { status: 429 });

  let bruto: unknown;
  try {
    bruto = await request.json();
  } catch {
    return NextResponse.json({ erro: "Corpo inválido." }, { status: 400 });
  }
  const validado = esquema.safeParse(bruto);
  if (!validado.success) {
    return NextResponse.json({ erro: `Digite exatamente "${FRASE}" e a sua senha.` }, { status: 400 });
  }
  if (!user.email) return NextResponse.json({ erro: "Conta sem e-mail cadastrado." }, { status: 400 });

  // Reautenticação: confere a senha com um login descartável (sem sessão).
  const verificador = supabaseAnonimoSemSessao();
  const { error: erroSenha } = await verificador.auth.signInWithPassword({ email: user.email, password: validado.data.senha });
  if (erroSenha) {
    await registrarEventoSeguranca(user.id, "lgpd_exclusao_recusada", { motivo: "senha" });
    return NextResponse.json({ erro: "Senha incorreta." }, { status: 403 });
  }
  await verificador.auth.signOut({ scope: "local" }).catch(() => {});

  const admin = supabaseAdmin();

  // Assinatura paga ativa no Asaas: apagar a linha deixaria a cobrança
  // recorrente viva sem ninguém conseguir cancelar. Exige cancelar antes.
  const { data: ativas, error: erroAssinatura } = await admin
    .from("assinaturas")
    .select("id")
    .eq("usuario_id", user.id)
    .in("status", ["ativa", "pendente"])
    .eq("gateway", "asaas")
    .limit(1);
  if (erroAssinatura) {
    console.error("Exclusão de conta: falha ao conferir assinaturas:", erroAssinatura.message);
    return NextResponse.json({ erro: "Não foi possível conferir sua assinatura agora. Tente de novo." }, { status: 500 });
  }
  if ((ativas ?? []).length > 0) {
    return NextResponse.json(
      { erro: "Você tem uma assinatura paga ativa ou um pagamento em aberto no Asaas. Cancele em Meu plano antes de excluir a conta, para não ser cobrado depois." },
      { status: 409 }
    );
  }

  // Cada passo é idempotente: se algo falhar no meio, a pessoa continua
  // conseguindo entrar e, ao tentar de novo, a exclusão segue de onde parou
  // (o login só é apagado no fim, depois de todo o resto).
  try {
    await apagarPasta(admin, "comprovantes-documentos", user.id);
    await admin.storage.from("avatars").remove([`${user.id}/avatar`]);

    for (const tabela of TABELAS_EM_ORDEM) {
      const { error } = await admin.from(tabela).delete().eq("usuario_id", user.id);
      if (error) throw new Error(`${tabela}: ${error.message}`);
    }
    const passos: [string, string][] = [
      ["membros", "conta_mestre_id"],
      ["membros", "membro_usuario_id"],
      ["user_authenticators", "user_id"],
      ["webauthn_challenges", "user_id"],
      ["user_consents", "user_id"],
      ["usuarios", "id"],
    ];
    for (const [tabela, coluna] of passos) {
      const { error } = await admin.from(tabela).delete().eq(coluna, user.id);
      if (error) throw new Error(`${tabela}: ${error.message}`);
    }
    const { error: erroAuth } = await admin.auth.admin.deleteUser(user.id);
    if (erroAuth) throw new Error(`auth: ${erroAuth.message}`);
  } catch (erro) {
    console.error("Falha na exclusão de conta (LGPD):", erro);
    return NextResponse.json(
      { erro: "A exclusão não terminou por uma falha temporária. Parte dos dados já foi apagada; tente de novo em alguns minutos que ela continua de onde parou." },
      { status: 500 }
    );
  }

  // Registro mínimo e anônimo (sem o id): só que uma exclusão aconteceu.
  await registrarEventoSeguranca(null, "lgpd_conta_excluida", { em: new Date().toISOString() });
  return NextResponse.json({ ok: true });
}
