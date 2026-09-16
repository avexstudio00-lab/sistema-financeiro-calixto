import { supabase } from "@/lib/supabase/client";
import { criarTransacao } from "@/lib/data/transacoes";
import { listarFila, removerDaFila, atualizarItemFila } from "./fila";

export type ResultadoSincronizacao =
  | { status: "vazia" }
  | { status: "ja-em-andamento" }
  | { status: "sem-conexao" }
  | { status: "sessao-expirada" }
  | { status: "ok"; enviados: number }
  | { status: "parcial"; enviados: number; erro: string };

let sincronizando = false;

/**
 * Envia para o servidor, em ordem e um item por vez (nunca em paralelo), as
 * anotações guardadas offline (ver fila.ts). Um de cada vez é essencial:
 * `criarTransacao` sempre lê o saldo real da conta no servidor antes de
 * aplicar cada lançamento (ver src/lib/data/transacoes.ts), então processar
 * em série garante que o saldo final bate certo mesmo que várias anotações
 * da fila mexam na mesma conta.
 *
 * Para no primeiro erro em vez de pular para o próximo item -- assim a fila
 * nunca sai de ordem, e o item que falhou fica visível (com a mensagem do
 * erro) para a pessoa decidir se tenta de novo ou apaga essa anotação, em
 * vez de sumir silenciosamente ou travar os itens seguintes de forma
 * invisível.
 */
export async function sincronizarFila(): Promise<ResultadoSincronizacao> {
  if (sincronizando) return { status: "ja-em-andamento" };
  if (listarFila().length === 0) return { status: "vazia" };
  if (typeof navigator !== "undefined" && !navigator.onLine) return { status: "sem-conexao" };

  sincronizando = true;
  try {
    // Garante que o token de acesso ainda é válido antes de tentar enviar.
    // Se o aparelho ficou muito tempo sem internet, o token pode ter
    // vencido -- o próprio cliente do Supabase tenta renovar sozinho aqui
    // (autoRefreshToken, ver src/lib/supabase/client.ts). Se não conseguir,
    // não mexe na fila: fica tudo guardado esperando um novo login.
    const { data: sessaoAtual } = await supabase.auth.getSession();
    if (!sessaoAtual.session) return { status: "sessao-expirada" };

    let enviados = 0;
    for (const item of listarFila()) {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        return enviados > 0
          ? { status: "parcial", enviados, erro: "A conexão caiu no meio do envio." }
          : { status: "sem-conexao" };
      }

      const { error } = await criarTransacao(item.dados);
      if (error) {
        const mensagem = error.message || "Não foi possível enviar essa anotação.";
        atualizarItemFila(item.idLocal, { tentativas: item.tentativas + 1, ultimoErro: mensagem });
        return { status: "parcial", enviados, erro: mensagem };
      }

      removerDaFila(item.idLocal);
      enviados += 1;
    }

    return { status: "ok", enviados };
  } finally {
    sincronizando = false;
  }
}
