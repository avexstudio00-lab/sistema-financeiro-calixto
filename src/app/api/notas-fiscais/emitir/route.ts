import { NextResponse } from "next/server";
import { z } from "zod";
import { usuarioAutenticadoDaRequisicao } from "@/lib/supabase/admin";
import { limitarRequisicoes, RESPOSTA_RATE_LIMIT } from "@/lib/rateLimit";

export const runtime = "nodejs";

const corpoSchema = z.object({ id: z.string().uuid() }).strict();

/** Qual emissor está configurado nas variáveis de ambiente da Vercel. */
function emissorConfigurado(): "plugnotas" | "focusnfe" | null {
  if (process.env.PLUGNOTAS_API_KEY) return "plugnotas";
  if (process.env.FOCUS_NFE_TOKEN) return "focusnfe";
  return null;
}

/**
 * Emissão de nota fiscal (item 5.17 da especificação de 03/out/2026).
 *
 * A tela grava a nota como "pendente" e chama esta rota. Aqui a nota é lida
 * com o client DO PRÓPRIO USUÁRIO (RLS valida que ela é dele/da empresa dele)
 * e enviada ao emissor configurado. Enquanto nenhum emissor estiver
 * configurado (PLUGNOTAS_API_KEY ou FOCUS_NFE_TOKEN na Vercel, mais os dados
 * fiscais da empresa — CNPJ, inscrição municipal, certificado), a nota fica
 * pendente com uma mensagem clara, sem inventar autorização nenhuma.
 */
export async function POST(request: Request) {
  const autenticado = await usuarioAutenticadoDaRequisicao(request);
  if (!autenticado) return NextResponse.json({ mensagem: "Não autenticado." }, { status: 401 });
  const { supabase, user } = autenticado;

  const { permitido } = await limitarRequisicoes("nota-fiscal-emitir", { limite: 20, janelaSegundos: 300, identificador: user.id });
  if (!permitido) return NextResponse.json(RESPOSTA_RATE_LIMIT, { status: 429 });

  const corpo = corpoSchema.safeParse(await request.json().catch(() => null));
  if (!corpo.success) return NextResponse.json({ mensagem: "Requisição inválida." }, { status: 400 });

  const { data: nota, error } = await supabase.from("notas_fiscais").select("*").eq("id", corpo.data.id).maybeSingle();
  if (error || !nota) return NextResponse.json({ mensagem: "Nota não encontrada." }, { status: 404 });
  if (nota.status !== "pendente") {
    return NextResponse.json({ mensagem: "Só notas pendentes podem ser enviadas." }, { status: 409 });
  }

  const emissor = emissorConfigurado();
  if (!emissor) {
    const mensagem =
      "Emissor de notas ainda não configurado. A nota ficou salva como pendente e será enviada assim que a integração (PlugNotas ou Focus NFe) for ativada.";
    await supabase.from("notas_fiscais").update({ mensagem_status: mensagem }).eq("id", nota.id);
    console.error("[notas-fiscais] emissão solicitada sem emissor configurado", { nota: nota.id });
    return NextResponse.json({ mensagem, configurado: false }, { status: 200 });
  }

  // Ponto de integração: o envio real para o emissor entra aqui quando as
  // credenciais e o cadastro fiscal da empresa existirem. Até lá, registra
  // a tentativa sem alterar o status (nunca marcar "autorizada" sem retorno
  // real do emissor).
  const mensagem = `Integração ${emissor === "plugnotas" ? "PlugNotas" : "Focus NFe"} detectada, mas o cadastro fiscal da empresa ainda não foi concluído. Nota mantida como pendente.`;
  await supabase.from("notas_fiscais").update({ mensagem_status: mensagem, provedor: emissor }).eq("id", nota.id);
  console.error("[notas-fiscais] emissor configurado sem cadastro fiscal", { nota: nota.id, emissor });
  return NextResponse.json({ mensagem, configurado: true }, { status: 200 });
}
