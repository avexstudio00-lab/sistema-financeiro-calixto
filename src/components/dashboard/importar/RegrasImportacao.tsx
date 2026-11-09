"use client";

import * as React from "react";
import { ChevronDown, Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * "Antes de importar" (10/nov/2026): as regrinhas do importador em
 * linguagem simples — o que o app faz sozinho, o que cada opção do "O que é
 * isso?" faz e como deixar as caixinhas/empréstimos prontos pra serem
 * reconhecidos. Aberto na primeira vez; depois fica lembrado fechado.
 */
const CHAVE = "calixto:importar-regras-fechado";

export function RegrasImportacao({ compacto = false }: { compacto?: boolean }) {
  const [aberto, setAberto] = React.useState(!compacto);
  React.useEffect(() => {
    if (compacto) return;
    try {
      if (localStorage.getItem(CHAVE) === "1") setAberto(false);
    } catch {
      /* sem armazenamento: fica aberto */
    }
  }, [compacto]);

  function alternar() {
    setAberto((v) => {
      const novo = !v;
      if (!compacto) {
        try {
          localStorage.setItem(CHAVE, novo ? "0" : "1");
        } catch {
          /* ok */
        }
      }
      return novo;
    });
  }

  return (
    <div className="rounded-2xl border border-primary-200 bg-primary-50/50 dark:border-primary-800 dark:bg-primary-900/10">
      <button type="button" onClick={alternar} className="flex w-full items-center gap-2 px-4 py-3 text-left" aria-expanded={aberto}>
        <Lightbulb size={18} className="shrink-0 text-primary-700 dark:text-primary-300" />
        <span className="flex-1 text-small font-semibold text-foreground">
          {compacto ? "Como funciona o \"O que é isso?\"" : "Antes de importar: como deixar tudo certinho"}
        </span>
        <ChevronDown size={18} className={cn("shrink-0 text-muted transition-transform", aberto && "rotate-180")} />
      </button>
      {aberto && (
        <div className="flex flex-col gap-3 px-4 pb-4 text-small text-foreground">
          {!compacto && (
            <ul className="flex list-disc flex-col gap-1.5 pl-5">
              <li>
                <strong>Nada do que você já lançou é alterado.</strong> A importação só adiciona. O que parecer com algo que você já lançou
                (mesmo valor, até 3 dias de diferença) vem <strong>desmarcado</strong> — confira antes de confirmar.
              </li>
              <li>
                <strong>Caixinhas e reservas:</strong> crie uma carteira no app com o <strong>mesmo nome</strong> da caixinha do banco (ex.: uma
                caixinha &quot;Pouco ego&quot; no Mercado Pago → carteira &quot;Pouco ego&quot; aqui). Aí &quot;Dinheiro reservado Pouco ego&quot; já entra
                como transferência pra ela, sem contar como gasto.
              </li>
              <li>
                <strong>Empréstimos:</strong> cadastre o empréstimo com o nome da pessoa como aparece no banco (ex.: &quot;Ingrid Souza&quot;). Quando chegar
                um PIX dela, o app já sugere dar baixa na parcela certa. Cada empréstimo tem um código (E1, E2...) e cada revenda (R1, R2...) pra
                diferenciar quando a mesma pessoa tem mais de um.
              </li>
              <li>
                <strong>Cartão:</strong> o pagamento da fatura no extrato da conta vira transferência pro cartão (as compras já estão na fatura).
              </li>
            </ul>
          )}
          <div className="flex flex-col gap-1.5">
            {!compacto && <p className="font-semibold">Em cada linha, &quot;O que é isso?&quot;:</p>}
            <ul className="flex flex-col gap-1 text-xs sm:text-small">
              <li>
                <strong>Gasto / Receita normal</strong> — entra no extrato com a categoria escolhida.
              </li>
              <li>
                <strong>Emprestei dinheiro</strong> / <strong>Comprei para revenda</strong> — abre o formulário de sempre já com valor e data; a saída é
                lançada por ele (a linha não entra duas vezes).
              </li>
              <li>
                <strong>Recebi de um empréstimo</strong> — escolha o empréstimo (pelo código) e se foi parcela, quitação ou só os juros. A baixa e a
                entrada na carteira são feitas juntas.
              </li>
              <li>
                <strong>Recebi de uma revenda</strong> — escolha a revenda; o valor entra como recebido dela.
              </li>
              <li>
                <strong>Paguei uma dívida</strong> — liga o pagamento à dívida (ela vai sendo abatida).
              </li>
              <li>
                <strong>Carteira/caixinha</strong> — dinheiro que só mudou de lugar entre as suas carteiras. Não conta como gasto nem receita.
              </li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
