"use client";

import * as React from "react";
import Link from "next/link";
import { HeartHandshake, MessageCircle } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { MensagemWhatsAppDialog } from "@/components/dashboard/MensagemWhatsAppDialog";
import { listarClientesSumidos, mensagemClienteSumido, type ClienteSumido } from "@/lib/data/clientesSumidos";
import { formatarMoeda } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Clientes sumidos (13/nov/2026): quem comprava e parou de vir, com 1 toque
 * pra mandar uma mensagem de retorno no WhatsApp. Quem já foi chamado some
 * da lista por 15 dias (guardado neste aparelho), pra não insistir.
 */

const OPCOES_DIAS = [30, 60, 90] as const;
const CHAVE = "meucontrole:sumidos-contatados:";
const DIAS_ESCONDIDO = 15;

/** Quem foi chamado nos últimos 15 dias (os mais antigos voltam pra lista). */
function lerContatados(conta: string): Record<string, string> {
  try {
    const todos = JSON.parse(window.localStorage.getItem(CHAVE + conta) ?? "{}") as Record<string, string>;
    const limite = Date.now() - DIAS_ESCONDIDO * 86400000;
    return Object.fromEntries(Object.entries(todos).filter(([, quando]) => new Date(quando).getTime() >= limite));
  } catch {
    return {};
  }
}

function salvarContatado(conta: string, clienteId: string) {
  try {
    const atual = lerContatados(conta);
    atual[clienteId] = new Date().toISOString();
    window.localStorage.setItem(CHAVE + conta, JSON.stringify(atual));
  } catch {
    // Sem armazenamento (aba anônima): só não lembra.
  }
}

export function ClientesSumidos({
  contaMestreId,
  nomeEmpresa,
  limite = 3,
}: {
  contaMestreId: string;
  nomeEmpresa: string;
  /** Quantos mostrar antes do "ver todos". */
  limite?: number;
}) {
  const [dias, setDias] = React.useState<(typeof OPCOES_DIAS)[number]>(60);
  const [lista, setLista] = React.useState<ClienteSumido[] | null>(null);
  const [contatados, setContatados] = React.useState<Record<string, string>>({});
  const [verTodos, setVerTodos] = React.useState(false);
  const [chamando, setChamando] = React.useState<ClienteSumido | null>(null);

  React.useEffect(() => {
    let ativo = true;
    listarClientesSumidos(contaMestreId, dias).then((r) => {
      if (!ativo) return;
      setLista(r);
      setContatados(lerContatados(contaMestreId));
    });
    return () => {
      ativo = false;
    };
  }, [contaMestreId, dias]);

  const visiveis = (lista ?? []).filter((s) => !contatados[s.cliente.id]);

  if (lista === null) return null;

  const mostrados = verTodos ? visiveis : visiveis.slice(0, limite);
  const valorParado = visiveis.reduce((acc, s) => acc + s.ticketMedio, 0);

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <HeartHandshake size={20} className="mt-0.5 shrink-0 text-accent-700" />
          <div className="min-w-0">
            <h2 className="text-body font-semibold text-foreground">Clientes sumidos</h2>
            <p className="text-small text-muted">
              {visiveis.length === 0
                ? `Ninguém sem comprar há ${dias}+ dias. 👏`
                : `${visiveis.length} ${visiveis.length === 1 ? "cliente não compra" : "clientes não compram"} há ${dias}+ dias. Se cada um voltar 1 vez: ~${formatarMoeda(valorParado)}.`}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 gap-1 rounded-full bg-muted/10 p-1" role="group" aria-label="Dias sem comprar">
          {OPCOES_DIAS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDias(d)}
              className={cn("rounded-full px-2.5 py-1 text-xs font-medium", dias === d ? "bg-card text-foreground shadow-sm" : "text-muted")}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {mostrados.length > 0 && (
        <div className="flex flex-col gap-2">
          {mostrados.map((s) => (
            <div key={s.cliente.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3">
              <div className="min-w-0 flex-1">
                <Link href={`/dashboard/empresa/clientes/${s.cliente.id}`} className="block truncate text-small font-semibold text-foreground hover:underline">
                  {s.cliente.nome}
                </Link>
                <p className="text-xs text-muted">
                  Última compra há {s.diasSemComprar} dias · {s.compras} {s.compras === 1 ? "compra" : "compras"} · ticket {formatarMoeda(s.ticketMedio)}
                </p>
              </div>
              <Button size="sm" variant="secondary" onClick={() => setChamando(s)} className="shrink-0">
                <MessageCircle size={14} />
                Chamar
              </Button>
            </div>
          ))}
        </div>
      )}

      {visiveis.length > limite && (
        <button type="button" onClick={() => setVerTodos((v) => !v)} className="self-start text-small font-semibold text-accent-700 hover:underline dark:text-accent-300">
          {verTodos ? "Mostrar menos" : `Ver todos (${visiveis.length})`}
        </button>
      )}

      {chamando && (
        <MensagemWhatsAppDialog
          titulo={`Chamar ${chamando.cliente.nome.split(" ")[0]} de volta`}
          subtitulo="Mensagem pronta e leve, sem cara de cobrança. Mude o que quiser (uma novidade, um presente, um desconto)."
          textoInicial={mensagemClienteSumido(chamando.cliente.nome, nomeEmpresa)}
          telefone={chamando.cliente.telefone}
          onFechar={() => setChamando(null)}
          onEnviado={() => {
            salvarContatado(contaMestreId, chamando.cliente.id);
            setContatados(lerContatados(contaMestreId));
          }}
        />
      )}
    </Card>
  );
}
