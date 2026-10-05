import { NextResponse } from "next/server";
import { z } from "zod";
import { usuarioAutenticadoDaRequisicao, supabaseAdmin } from "@/lib/supabase/admin";
import { limitarRequisicoes, RESPOSTA_RATE_LIMIT } from "@/lib/rateLimit";
import { registrarEventoSeguranca } from "@/lib/auditoria";
import { contextoRp, verificarAutenticacao } from "@/lib/seguranca/webauthnServidor";
import { criarDesafio, consumirDesafio } from "@/lib/seguranca/desafiosWebauthn";

export const runtime = "nodejs";

/**
 * Desbloqueio com biometria (WebAuthn) — Fase 1, item 3.2.
 *  - { etapa: "opcoes", credenciais? } → desafio pro `navigator.credentials.get()`
 *  - { etapa: "verificar", credencial } → confere a assinatura
 * A credencial só é aceita se pertencer ao usuário do JWT: a biometria de
 * uma conta nunca libera outra conta aberta no mesmo navegador.
 */
const esquema = z.discriminatedUnion("etapa", [
  z.object({ etapa: z.literal("opcoes"), credenciais: z.array(z.string().max(1024)).max(10).optional() }).strict(),
  z
    .object({
      etapa: z.literal("verificar"),
      credencial: z
        .object({
          id: z.string().min(10).max(1024),
          clientDataJSON: z.string().min(10).max(8192),
          authenticatorData: z.string().min(10).max(8192),
          signature: z.string().min(10).max(2048),
        })
        .strict(),
    })
    .strict(),
]);

export async function POST(request: Request) {
  const autenticado = await usuarioAutenticadoDaRequisicao(request);
  if (!autenticado) return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });
  const { user } = autenticado;

  const { permitido } = await limitarRequisicoes("webauthn-verificar", { limite: 30, janelaSegundos: 600, identificador: user.id });
  if (!permitido) return NextResponse.json(RESPOSTA_RATE_LIMIT, { status: 429 });

  let corpo: z.infer<typeof esquema>;
  try {
    corpo = esquema.parse(await request.json());
  } catch {
    return NextResponse.json({ erro: "Requisição inválida." }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const { rpId, origem } = contextoRp(request);

  if (corpo.etapa === "opcoes") {
    const { data } = await admin.from("user_authenticators").select("credential_id, transports").eq("user_id", user.id);
    const minhas = (data ?? []) as { credential_id: string; transports: string[] | null }[];
    const filtro = corpo.credenciais && corpo.credenciais.length > 0 ? new Set(corpo.credenciais) : null;
    const permitidas = minhas.filter((c) => !filtro || filtro.has(c.credential_id));
    if (permitidas.length === 0) return NextResponse.json({ erro: "Nenhuma biometria cadastrada." }, { status: 404 });

    const desafio = await criarDesafio(admin, { userId: user.id, tipo: "autenticacao", rpId, origem });
    if (!desafio) return NextResponse.json({ erro: "Não foi possível iniciar." }, { status: 500 });
    return NextResponse.json({
      challenge: desafio,
      rpId,
      timeout: 60000,
      userVerification: "required",
      allowCredentials: permitidas.map((c) => ({ type: "public-key", id: c.credential_id, transports: c.transports ?? undefined })),
    });
  }

  const desafio = await consumirDesafio(admin, { userId: user.id, tipo: "autenticacao" });
  if (!desafio || desafio.rp_id !== rpId || desafio.origem !== origem) {
    return NextResponse.json({ erro: "O pedido expirou. Tente de novo." }, { status: 400 });
  }

  // Busca a credencial já filtrando pelo dono — de outra conta não serve.
  const { data: linha } = await admin
    .from("user_authenticators")
    .select("id, public_key_spki, contador")
    .eq("user_id", user.id)
    .eq("credential_id", corpo.credencial.id)
    .maybeSingle();
  const cred = linha as { id: string; public_key_spki: string; contador: number } | null;
  if (!cred) {
    await registrarEventoSeguranca(user.id, "biometria_recusada", { motivo: "credencial_de_outra_conta_ou_removida" });
    return NextResponse.json({ erro: "Esta biometria não pertence a esta conta." }, { status: 403 });
  }

  try {
    const { contador } = verificarAutenticacao({
      clientDataJSON: corpo.credencial.clientDataJSON,
      authenticatorData: corpo.credencial.authenticatorData,
      signature: corpo.credencial.signature,
      desafio: desafio.challenge,
      origem,
      rpId,
      spki: cred.public_key_spki,
      contadorAnterior: Number(cred.contador),
    });
    await admin.from("user_authenticators").update({ contador, ultimo_uso_em: new Date().toISOString() }).eq("id", cred.id);
    return NextResponse.json({ ok: true });
  } catch (erro) {
    console.error("Falha na verificação WebAuthn:", erro instanceof Error ? erro.message : erro);
    await registrarEventoSeguranca(user.id, "biometria_recusada", { motivo: "verificacao_falhou" });
    return NextResponse.json({ erro: "Não foi possível confirmar a biometria." }, { status: 401 });
  }
}
