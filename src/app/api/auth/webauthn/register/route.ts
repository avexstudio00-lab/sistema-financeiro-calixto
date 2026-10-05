import { NextResponse } from "next/server";
import { z } from "zod";
import { usuarioAutenticadoDaRequisicao, supabaseAdmin } from "@/lib/supabase/admin";
import { limitarRequisicoes, RESPOSTA_RATE_LIMIT } from "@/lib/rateLimit";
import { registrarEventoSeguranca } from "@/lib/auditoria";
import { contextoRp, b64url, verificarRegistro, ALG_ES256, ALG_RS256 } from "@/lib/seguranca/webauthnServidor";
import { criarDesafio, consumirDesafio } from "@/lib/seguranca/desafiosWebauthn";

export const runtime = "nodejs";

/**
 * Cadastro de biometria (WebAuthn) — Fase 1, item 3.2.
 *  - { etapa: "opcoes" } → devolve as opções pro `navigator.credentials.create()`
 *  - { etapa: "verificar", credencial } → confere e grava em `user_authenticators`
 * O dono da credencial é SEMPRE o usuário do JWT, nunca um campo do corpo.
 */
const esquema = z.discriminatedUnion("etapa", [
  z.object({ etapa: z.literal("opcoes") }).strict(),
  z
    .object({
      etapa: z.literal("verificar"),
      apelido: z.string().max(60).optional(),
      credencial: z
        .object({
          id: z.string().min(10).max(1024),
          clientDataJSON: z.string().min(10).max(8192),
          attestationObject: z.string().min(10).max(16384),
          transports: z.array(z.string().max(20)).max(8).optional(),
        })
        .strict(),
    })
    .strict(),
]);

export async function POST(request: Request) {
  const autenticado = await usuarioAutenticadoDaRequisicao(request);
  if (!autenticado) return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });
  const { user } = autenticado;

  const { permitido } = await limitarRequisicoes("webauthn-registro", { limite: 20, janelaSegundos: 3600, identificador: user.id });
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
    const desafio = await criarDesafio(admin, { userId: user.id, tipo: "registro", rpId, origem });
    if (!desafio) return NextResponse.json({ erro: "Não foi possível iniciar o cadastro." }, { status: 500 });
    const { data: existentes } = await admin.from("user_authenticators").select("credential_id").eq("user_id", user.id);
    return NextResponse.json({
      challenge: desafio,
      rp: { name: "Calixto", id: rpId },
      user: { id: b64url(Buffer.from(user.id, "utf8")), name: user.email ?? user.id, displayName: user.email ?? "Calixto" },
      pubKeyCredParams: [
        { type: "public-key", alg: ALG_ES256 },
        { type: "public-key", alg: ALG_RS256 },
      ],
      timeout: 60000,
      attestation: "none",
      authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "preferred" },
      excludeCredentials: ((existentes ?? []) as { credential_id: string }[]).map((c) => ({ type: "public-key", id: c.credential_id })),
    });
  }

  const desafio = await consumirDesafio(admin, { userId: user.id, tipo: "registro" });
  if (!desafio) return NextResponse.json({ erro: "O pedido expirou. Tente de novo." }, { status: 400 });
  if (desafio.rp_id !== rpId || desafio.origem !== origem) {
    return NextResponse.json({ erro: "Domínio diferente do que iniciou o cadastro." }, { status: 400 });
  }

  try {
    const cred = verificarRegistro({
      clientDataJSON: corpo.credencial.clientDataJSON,
      attestationObject: corpo.credencial.attestationObject,
      desafio: desafio.challenge,
      origem,
      rpId,
    });
    if (cred.credentialId !== corpo.credencial.id) throw new Error("Identificador da credencial não confere");

    const { error } = await admin.from("user_authenticators").insert({
      user_id: user.id,
      credential_id: cred.credentialId,
      public_key_spki: cred.spki,
      algoritmo: cred.alg,
      contador: cred.contador,
      transports: corpo.credencial.transports ?? null,
      apelido: corpo.apelido?.trim() || null,
    });
    if (error) {
      console.error("Erro ao salvar credencial WebAuthn:", error.message);
      return NextResponse.json({ erro: "Não foi possível salvar a biometria." }, { status: 500 });
    }
    await registrarEventoSeguranca(user.id, "biometria_cadastrada");
    return NextResponse.json({ ok: true, credentialId: cred.credentialId });
  } catch (erro) {
    console.error("Falha na verificação do cadastro WebAuthn:", erro instanceof Error ? erro.message : erro);
    return NextResponse.json({ erro: "Não foi possível confirmar a biometria deste aparelho." }, { status: 400 });
  }
}
