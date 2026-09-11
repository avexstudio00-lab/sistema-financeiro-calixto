import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Rate limiting simples (item 7 do checklist de segurança revisado em
 * 10/set/2026 — "Implementar Rate Limiting nas APIs") pras rotas de API
 * sensíveis (`/api/asaas/checkout`, `/api/asaas/cancelar`,
 * `/api/trial/iniciar`). Sem depender de serviço externo tipo Upstash —
 * usa uma função no próprio Postgres (`verificar_e_incrementar_limite`,
 * ver SQL entregue ao usuário) pra contar requisições numa janela de
 * tempo, mesma filosofia de "sem infra extra" já usada no projeto (ver
 * contas fixas, seção 9 de contexto-projeto-completo.md).
 *
 * Por que banco e não memória: funções da Vercel são serverless — cada
 * instância tem sua própria memória, então um contador em memória não
 * conta direito entre instâncias diferentes. O Postgres já é compartilhado
 * por todas, então é o único lugar onde "quantas vezes o usuário X chamou
 * essa rota nos últimos N segundos" fica correto de verdade.
 *
 * Falha aberta de propósito: se a checagem em si der erro (rede, função
 * ainda não existir porque a migração não rodou etc.), a rota real não é
 * bloqueada por causa disso — só loga e deixa passar. Um rate limiter que
 * quebra o fluxo principal quando ele mesmo falha seria pior que não ter
 * rate limiting nenhum.
 */
export async function limitarRequisicoes(
  rota: string,
  opcoes: { limite: number; janelaSegundos: number; identificador: string }
): Promise<{ permitido: boolean }> {
  const chave = `${rota}:${opcoes.identificador}`;

  try {
    const { data, error } = await supabaseAdmin().rpc("verificar_e_incrementar_limite", {
      p_chave: chave,
      p_limite: opcoes.limite,
      p_janela_segundos: opcoes.janelaSegundos,
    });

    if (error) {
      console.error(`Erro ao checar rate limit (${rota}):`, error.message);
      return { permitido: true };
    }

    return { permitido: Boolean(data) };
  } catch (erro) {
    console.error(`Erro ao checar rate limit (${rota}):`, erro);
    return { permitido: true };
  }
}

/** Resposta padrão de "muitas tentativas" — mesmo formato de erro
 * (`{ erro: string }`) já usado em todas as outras respostas de erro
 * dessas rotas, pra não exigir tratamento especial no front-end. */
export const RESPOSTA_RATE_LIMIT = {
  erro: "Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente de novo.",
} as const;
