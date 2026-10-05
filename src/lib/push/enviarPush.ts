import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Envio de Web Push (Bloco 5 do pacote de 36 itens / item 2 do lado SaaS em
 * `roadmap-melhorias.md`) -- VAPID via `web-push`, sem infraestrutura de cron
 * nova: quem chama isto e sempre uma rota ja disparada por outra coisa (o
 * carregamento do painel, o webhook do Asaas), nunca um job agendado.
 *
 * Cobre os dois gatilhos ja identificados: alerta de orcamento (80% do
 * limite, ver /api/notificacoes/orcamento) e falha de cobranca do Asaas (ver
 * /api/asaas/webhook, evento PAYMENT_OVERDUE).
 */

let vapidConfigurado = false;

function garantirVapidConfigurado() {
  if (vapidConfigurado) return;

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;

  if (!publicKey || !privateKey || !subject) {
    throw new Error(
      "VAPID nao configurado (defina NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY e VAPID_SUBJECT nas env vars da Vercel)."
    );
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidConfigurado = true;
}

export interface PayloadPush {
  titulo: string;
  corpo: string;
  /** Caminho pra abrir quando a pessoa clica na notificacao (ver sw.js). */
  url?: string;
  /** Agrupa avisos iguais na central de notificações (não duplica). */
  tag?: string;
}

export const TEXTO_PRIVADO = "Você tem uma notificação do Calixto";

/**
 * "Ocultar prévia das notificações" (Fase 1, item 3.1): com a chave ligada,
 * nenhum valor nem descrição sai do servidor — só o texto genérico. Feito
 * aqui, no único ponto de envio, pra valer pra todo tipo de aviso.
 */
export async function aplicarPrivacidade(admin: SupabaseClient, usuarioId: string, payload: PayloadPush): Promise<PayloadPush> {
  const { data } = await admin
    .from("preferencias_privacidade")
    .select("ocultar_previa_notificacoes")
    .eq("usuario_id", usuarioId)
    .maybeSingle();
  if ((data as { ocultar_previa_notificacoes?: boolean } | null)?.ocultar_previa_notificacoes) {
    return { titulo: "Calixto", corpo: TEXTO_PRIVADO, url: payload.url, tag: payload.tag };
  }
  return payload;
}

interface LinhaInscricaoPush {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

/**
 * Manda a notificacao pra todas as inscricoes (dispositivos/navegadores) do
 * usuario. Nunca lanca erro -- mesma filosofia do resto do projeto
 * (`iniciarTrial`, integracoes externas): uma falha de push nao pode
 * quebrar o fluxo principal que a disparou (carregamento do painel,
 * processamento de webhook).
 *
 * Uma inscricao expirada/revogada (410/404) e removida na hora, pra nao
 * tentar de novo pra sempre num dispositivo que nao existe mais.
 */
export async function enviarPushParaUsuario(
  admin: SupabaseClient,
  usuarioId: string,
  payload: PayloadPush
): Promise<number> {
  try {
    garantirVapidConfigurado();
  } catch (erro) {
    console.error("Erro ao configurar VAPID:", erro);
    return 0;
  }

  const { data: inscricoes } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("usuario_id", usuarioId);

  if (!inscricoes || inscricoes.length === 0) return 0;

  const final = await aplicarPrivacidade(admin, usuarioId, payload);

  let enviados = 0;
  for (const inscricao of inscricoes as LinhaInscricaoPush[]) {
    try {
      await webpush.sendNotification(
        {
          endpoint: inscricao.endpoint,
          keys: { p256dh: inscricao.p256dh, auth: inscricao.auth },
        },
        JSON.stringify(final),
        // urgency "high" + TTL de 1 dia: entrega imediata na tela de
        // bloqueio, e não insiste num aviso que já perdeu o sentido.
        { TTL: 24 * 60 * 60, urgency: "high" }
      );
      enviados++;
    } catch (erro) {
      const statusCode =
        erro && typeof erro === "object" && "statusCode" in erro
          ? (erro as { statusCode?: number }).statusCode
          : undefined;

      if (statusCode === 404 || statusCode === 410) {
        await admin.from("push_subscriptions").delete().eq("id", inscricao.id);
      } else {
        console.error(`Falha ao enviar push pro usuario ${usuarioId} (inscricao ${inscricao.id}):`, erro);
      }
    }
  }

  return enviados;
}

/**
 * Envia com dedupe: so manda (e so grava o registro de "ja enviado") se essa
 * combinacao `tipo`+`chave` ainda nao tiver sido notificada antes pra este
 * usuario -- evita mandar o mesmo alerta de novo a cada carregamento de tela
 * (ex: mesma categoria estourada, mesmo mes) ou a cada reentrega de webhook.
 *
 * `chave` deve identificar unicamente o evento dentro do `tipo` (ex:
 * `${categoriaId}:${anoMes}` pro alerta de orcamento, `${paymentId}` pra
 * falha de cobranca). A tabela `notificacoes_enviadas` tem UNIQUE em
 * (usuario_id, tipo, chave) -- e essa constraint que garante o dedupe mesmo
 * sob chamadas concorrentes, nao so a checagem abaixo.
 *
 * Devolve `true` se notificou agora, `false` se ja tinha sido notificado
 * antes (ou se o envio falhou ao configurar VAPID).
 */
export async function enviarPushComDedupe(
  admin: SupabaseClient,
  usuarioId: string,
  tipo: string,
  chave: string,
  payload: PayloadPush
): Promise<boolean> {
  const { error: erroInsert } = await admin
    .from("notificacoes_enviadas")
    .insert({ usuario_id: usuarioId, tipo, chave });

  if (erroInsert) {
    // 23505 = violacao de UNIQUE: ja foi notificado antes pra essa
    // combinacao -- nao e erro de verdade, e o dedupe funcionando. Qualquer
    // outro erro e real (ex: tabela nao existe ainda) e so e logado -- nunca
    // trava quem chamou.
    if (erroInsert.code !== "23505") {
      console.error(`Erro ao registrar dedupe de notificacao (${tipo}:${chave}):`, erroInsert.message);
    }
    return false;
  }

  await enviarPushParaUsuario(admin, usuarioId, payload);
  return true;
}

/**
 * Só o "registro de já avisado" (sem enviar): devolve true se esta é a
 * primeira vez de `tipo`+`chave` pra este usuário. Usado pelo cron diário,
 * que primeiro filtra o que é novo e depois decide como agrupar o envio.
 */
export async function marcarAvisoSeNovo(admin: SupabaseClient, usuarioId: string, tipo: string, chave: string): Promise<boolean> {
  const { error } = await admin.from("notificacoes_enviadas").insert({ usuario_id: usuarioId, tipo, chave });
  if (!error) return true;
  if (error.code !== "23505") console.error(`Erro ao registrar dedupe de notificacao (${tipo}:${chave}):`, error.message);
  return false;
}
