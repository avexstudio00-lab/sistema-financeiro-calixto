import { PLANOS, type Plano } from "@/lib/planos";

/**
 * Wrapper fino da API do Asaas (checkout hospedado + assinaturas). Só é
 * importado por Route Handlers (server-side) — a ASAAS_API_KEY nunca pode
 * chegar ao navegador.
 *
 * A URL base é escolhida sozinha a partir do formato da própria chave
 * (chaves de sandbox/homologação do Asaas trazem o trecho "_hmlg_"). Assim,
 * quando o usuário trocar a env var ASAAS_API_KEY pela chave de produção
 * (ver contexto do projeto, seção 6, item 8), o app passa a chamar a API de
 * produção automaticamente, sem precisar mexer em código.
 */
function chaveApi(): string {
  const chave = process.env.ASAAS_API_KEY;
  if (!chave) {
    throw new Error("ASAAS_API_KEY não configurada (defina nas env vars da Vercel).");
  }
  return chave;
}

function baseUrl(): string {
  return chaveApi().includes("_hmlg_") ? "https://api-sandbox.asaas.com/v3" : "https://api.asaas.com/v3";
}

class AsaasError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "AsaasError";
  }
}

async function asaasFetch<T>(caminho: string, init?: RequestInit): Promise<T> {
  const resposta = await fetch(`${baseUrl()}${caminho}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "AvexStudio-SistemaFinanceiroCalixto",
      access_token: chaveApi(),
      ...(init?.headers ?? {}),
    },
  });

  const texto = await resposta.text();
  const corpo = texto ? JSON.parse(texto) : null;

  if (!resposta.ok) {
    const mensagem =
      corpo?.errors?.[0]?.description ?? corpo?.message ?? `Erro ${resposta.status} na API do Asaas`;
    throw new AsaasError(mensagem, resposta.status);
  }

  return corpo as T;
}

interface CheckoutAsaasResposta {
  id: string;
  link: string;
  status: string;
}

/**
 * Imagem do item mostrada na tela do checkout hospedado do Asaas — campo
 * `imageBase64` é OBRIGATÓRIO no schema da API (`POST /v3/checkouts`,
 * `items[].imageBase64`), mesmo não aparecendo em todo exemplo da
 * documentação. Sem ele, o Asaas rejeita a requisição com erro de validação
 * e o app nunca chega a abrir o checkout (ver histórico no contexto do
 * projeto). Quadrado azul liso 48x48 (~120 bytes) — deliberadamente minúsculo
 * e sem texto pra ficar curto/simples de manter aqui hardcoded (evita
 * depender de asset externo) sem arriscar corromper uma string base64 gigante
 * ao editar. Só precisa satisfazer o schema; não afeta nenhuma outra tela.
 */
const IMAGEM_ITEM_CHECKOUT_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAIAAADYYG7QAAAAPElEQVR42u3OAQ0AMAgAIH0XkxnfEq/hHCQgqyc2ebGMkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQ0OXQB5moAdNbwfLNAAAAAElFTkSuQmCC";

/**
 * Cria um checkout hospedado do Asaas para uma assinatura mensal recorrente
 * (Pix ou cartão de crédito). O pagador preenche os próprios dados (nome,
 * e-mail, CPF/CNPJ) na página do Asaas — o app não coleta nem armazena CPF,
 * então não precisamos de um `customer` pré-cadastrado nem de `customerData`.
 *
 * `externalReference` carrega o id da linha de `assinaturas` já criada no
 * nosso banco (status "pendente") — o Asaas devolve esse mesmo valor nos
 * eventos de pagamento do webhook, o que permite achar a linha certa direto
 * por id, sem depender de "bater o valor pago" (ver processarPagamentoConfirmado
 * no webhook, que ainda mantém o casamento por valor como plano B).
 */
export async function criarCheckout(params: {
  plano: Exclude<Plano, "gratis">;
  externalReference: string;
  successUrl: string;
  cancelUrl: string;
  expiredUrl: string;
}): Promise<{ id: string; link: string }> {
  const dadosPlano = PLANOS[params.plano];
  const amanha = new Date();
  amanha.setDate(amanha.getDate() + 1);
  const nextDueDate = amanha.toISOString().slice(0, 10);

  const resposta = await asaasFetch<CheckoutAsaasResposta>("/checkouts", {
    method: "POST",
    body: JSON.stringify({
      billingTypes: ["PIX", "CREDIT_CARD"],
      chargeTypes: ["RECURRENT"],
      minutesToExpire: 60,
      externalReference: params.externalReference,
      items: [
        {
          name: `Plano ${dadosPlano.nome}`,
          description: `Assinatura mensal — Sistema Financeiro Calixto (Avex Studio)`,
          quantity: 1,
          value: dadosPlano.preco,
          imageBase64: IMAGEM_ITEM_CHECKOUT_BASE64,
        },
      ],
      subscription: {
        cycle: "MONTHLY",
        nextDueDate,
      },
      callback: {
        successUrl: params.successUrl,
        cancelUrl: params.cancelUrl,
        expiredUrl: params.expiredUrl,
      },
    }),
  });

  // Valida o formato da resposta antes de confiar nela — uma resposta 2xx
  // com corpo vazio ou sem os campos esperados (ex: mudança futura na API
  // do Asaas) não pode virar um TypeError obscuro lá na frente quando
  // `checkout.link` for usado pro redirect.
  if (!resposta?.id || !resposta?.link) {
    throw new AsaasError("Resposta do Asaas ao criar checkout veio sem id/link.", 502);
  }

  return { id: resposta.id, link: resposta.link };
}

/**
 * Cancela de verdade uma assinatura no Asaas (encerra a recorrência; para
 * de gerar novas cobranças). Se a assinatura já não existir mais do lado do
 * Asaas (ex: já tinha sido cancelada por lá), trata como sucesso — não faz
 * sentido a operação falhar por algo que já está no estado desejado.
 */
export async function cancelarAssinaturaAsaas(asaasSubscriptionId: string): Promise<void> {
  try {
    await asaasFetch(`/subscriptions/${asaasSubscriptionId}`, { method: "DELETE" });
  } catch (erro) {
    if (erro instanceof AsaasError && erro.status === 404) return;
    throw erro;
  }
}

export { AsaasError };
