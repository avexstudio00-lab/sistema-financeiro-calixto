import { supabase } from "@/lib/supabase/client";

/**
 * Roda a checagem "preguicosa" de alerta de orcamento (Bloco 5) no
 * servidor -- mesmo padrao de `gerarLancamentosPendentes`
 * (`contasFixas.ts`) e `verificarTrialVencido` (`assinaturas.ts`): dispara
 * no carregamento do painel, sem cron nem infraestrutura nova.
 *
 * Chamar isto NAO manda notificacao garantida -- so avisa o servidor pra
 * reconferir e, se algo realmente bateu 80% do limite e ainda nao foi
 * notificado este mes (dedupe server-side), manda o push. Nunca lanca erro:
 * notificacao e um bonus, nunca pode atrapalhar o carregamento do painel.
 */
export async function verificarAlertaOrcamentoPush(): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return;

  try {
    await fetch("/api/notificacoes/orcamento", {
      method: "POST",
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
  } catch {
    // Silencioso de proposito -- ver comentario acima.
  }
}

function urlBase64ToUint8Array(base64Url: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const bruto = atob(base64);
  const bytes = new Uint8Array(bruto.length);
  for (let i = 0; i < bruto.length; i++) {
    bytes[i] = bruto.charCodeAt(i);
  }
  return bytes;
}

/** Verdadeiro se este navegador tem tudo que e preciso pra Web Push
 * (Service Worker + Push API + Notification API) -- alguns navegadores
 * (ex: Safari mais antigo, navegador embutido de alguns apps) nao tem. */
export function suportaPush(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** Inscricao push atual deste navegador, se houver (independente de ja
 * estar salva no servidor ou nao). */
export async function obterInscricaoPushAtual(): Promise<PushSubscription | null> {
  if (!suportaPush()) return null;
  const registro = await navigator.serviceWorker.ready;
  return registro.pushManager.getSubscription();
}

/**
 * Pede permissao de notificacao (se ainda nao concedida), inscreve este
 * navegador no Web Push do navegador e salva a inscricao no servidor (ver
 * /api/push/subscribe). Lanca erro se a pessoa negar a permissao ou se
 * faltar a chave publica VAPID (`NEXT_PUBLIC_VAPID_PUBLIC_KEY`) -- quem
 * chama (NotificacoesPush.tsx) mostra isso como mensagem de erro.
 */
export async function ativarNotificacoesPush(): Promise<void> {
  if (!suportaPush()) {
    throw new Error("Este navegador nao suporta notificacoes push.");
  }

  const chavePublica = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!chavePublica) {
    throw new Error("Notificacoes push ainda nao configuradas neste ambiente.");
  }

  const permissao = await Notification.requestPermission();
  if (permissao !== "granted") {
    throw new Error("Permissao de notificacao negada.");
  }

  const registro = await navigator.serviceWorker.ready;
  const inscricaoExistente = await registro.pushManager.getSubscription();
  const inscricao =
    inscricaoExistente ??
    (await registro.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(chavePublica),
    }));

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("Sessao expirada -- entre de novo pra ativar notificacoes.");

  const json = inscricao.toJSON();
  const resposta = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
  });

  if (!resposta.ok) {
    const corpo = await resposta.json().catch(() => null);
    throw new Error(corpo?.erro ?? "Erro ao salvar inscricao no servidor.");
  }
}

/** Desativa: cancela a inscricao neste navegador e avisa o servidor pra
 * apagar a linha correspondente (ver /api/push/unsubscribe). */
export async function desativarNotificacoesPush(): Promise<void> {
  const inscricao = await obterInscricaoPushAtual();
  if (!inscricao) return;

  const endpoint = inscricao.endpoint;
  await inscricao.unsubscribe();

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return;

  try {
    await fetch("/api/push/unsubscribe", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ endpoint }),
    });
  } catch {

    // A inscricao ja foi cancelada no navegador (o que importa pra parar de
    // receber) -- se o aviso ao servidor falhar, a linha orfa em
    // push_subscriptions so vai falhar silenciosamente no proximo envio
    // (ver enviarPushParaUsuario, que ignora erro de envio individual).
  }
}
