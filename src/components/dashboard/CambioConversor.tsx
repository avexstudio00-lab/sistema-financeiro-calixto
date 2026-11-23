"use client";

import * as React from "react";
import { Globe, ArrowRightLeft, RefreshCw } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { formatarMoeda } from "@/lib/format";
import { obterCambioAoVivo, type ResultadoCambioAoVivo } from "@/lib/data/mercado";

type Moeda = "USD" | "EUR";

/** Cotação com 4 casas (R$ 5,3412) — 2 casas escondem a variação do dia. */
const cotacao4 = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 4, maximumFractionDigits: 4 });

function parsearValor(texto: string): number {
  const limpo = texto.trim().replace(/\./g, "").replace(",", ".");
  const numero = Number(limpo);
  return Number.isFinite(numero) ? numero : 0;
}

/**
 * Widget de câmbio pra tela da Empresa -- pra quem importa ou compra
 * produtos em dólar/euro e precisa saber na hora quanto isso dá em reais.
 * Cotação comercial AO VIVO (23/nov/2026): antes era a PTAX do Banco
 * Central (fechamento do dia anterior, guardada 6h) — o usuário notou que
 * ficava atrás do Google. Agora vem de /api/mercado/cambio e o widget
 * pergunta de novo a cada minuto enquanto a tela está visível.
 *
 * Decisão de escopo: isso é só um widget informativo (cotação + conversor
 * simples) -- não mexe na tabela `produtos` nem guarda o câmbio junto de
 * cada item. Se no futuro fizer sentido rastrear o custo em dólar de cada
 * produto importado individualmente, isso vira mudança de schema à parte.
 */
export function CambioConversor() {
  const [carregando, setCarregando] = React.useState(true);
  const [atualizando, setAtualizando] = React.useState(false);
  const [cambio, setCambio] = React.useState<ResultadoCambioAoVivo | null>(null);
  const [moeda, setMoeda] = React.useState<Moeda>("USD");
  const [valorDigitado, setValorDigitado] = React.useState("");
  const usd = cambio?.usd ?? null;
  const eur = cambio?.eur ?? null;

  const buscar = React.useCallback(async () => {
    setAtualizando(true);
    const r = await obterCambioAoVivo();
    // Mantém o último valor bom se a busca falhar no meio.
    if (r && (r.usd != null || r.eur != null)) setCambio(r);
    setAtualizando(false);
    setCarregando(false);
  }, []);

  React.useEffect(() => {
    buscar();
    // A cada minuto, só com a tela visível (não gasta bateria em segundo plano).
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") buscar();
    }, 60_000);
    const aoVoltar = () => {
      if (document.visibilityState === "visible") buscar();
    };
    document.addEventListener("visibilitychange", aoVoltar);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, [buscar]);

  const horario = cambio?.cotadoEm
    ? new Date(cambio.cotadoEm).toLocaleString("pt-BR", { hour: "2-digit", minute: "2-digit", ...(cambio.fonte === "ptax" ? { day: "2-digit", month: "2-digit" } : {}) })
    : null;
  const variacao = (v: number | null | undefined) =>
    v == null ? null : (
      <span className={v > 0 ? "text-xs text-rose-600" : v < 0 ? "text-xs text-accent-700" : "text-xs text-muted"}>
        {v > 0 ? "▲" : v < 0 ? "▼" : "•"} {Math.abs(v).toFixed(2).replace(".", ",")}%
      </span>
    );

  const taxaAtual = moeda === "USD" ? usd : eur;
  const valorNumero = parsearValor(valorDigitado);
  const resultado = taxaAtual != null ? valorNumero * taxaAtual : null;

  // Sem cotação (API fora do ar e sem cache ainda) -- não faz sentido
  // mostrar um conversor quebrado, então o widget inteiro só aparece
  // quando pelo menos uma das duas moedas carregou.
  if (!carregando && usd == null && eur == null) return null;

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-50 text-accent-600">
          <Globe size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-body font-semibold text-foreground">Câmbio agora</p>
          <p className="text-xs text-muted">
            {cambio?.fonte === "ptax"
              ? `Cotação ao vivo fora do ar — mostrando o fechamento oficial${horario ? ` (${horario})` : ""}`
              : horario
                ? `Dólar e euro comercial · atualizado às ${horario} · atualiza sozinho a cada minuto`
                : "Pra quem compra ou importa produtos em dólar ou euro"}
          </p>
        </div>
        <button
          type="button"
          onClick={buscar}
          disabled={atualizando}
          aria-label="Atualizar cotação"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted hover:bg-muted/10 disabled:opacity-50"
        >
          <RefreshCw size={16} className={atualizando ? "animate-spin" : ""} />
        </button>
      </div>

      {carregando ? (
        <p className="text-small text-muted">Buscando cotações...</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-border bg-muted/5 px-4 py-3">
              <p className="text-xs text-muted">Dólar (USD)</p>
              <p className="text-body font-semibold text-foreground">
                {usd != null ? cotacao4(usd) : "indisponível"}
              </p>
              {variacao(cambio?.usdVariacao)}
            </div>
            <div className="rounded-xl border border-border bg-muted/5 px-4 py-3">
              <p className="text-xs text-muted">Euro (EUR)</p>
              <p className="text-body font-semibold text-foreground">
                {eur != null ? cotacao4(eur) : "indisponível"}
              </p>
              {variacao(cambio?.eurVariacao)}
            </div>
          </div>

          <div className="flex flex-col gap-2 border-t border-border pt-3">
            <p className="text-small font-medium text-foreground">Converter pra real</p>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex gap-1.5 rounded-xl bg-muted/10 p-1">
                {(["USD", "EUR"] as const).map((op) => (
                  <button
                    key={op}
                    type="button"
                    disabled={op === "USD" ? usd == null : eur == null}
                    onClick={() => setMoeda(op)}
                    className={`rounded-lg px-3 py-1.5 text-small font-medium transition-all disabled:cursor-not-allowed disabled:opacity-40 ${
                      moeda === op ? "bg-card text-primary-700 shadow-sm" : "text-muted"
                    }`}
                  >
                    {op}
                  </button>
                ))}
              </div>
              <div className="w-32">
                <Input
                  value={valorDigitado}
                  onChange={(e) => setValorDigitado(e.target.value)}
                  inputMode="decimal"
                  placeholder={`Valor em ${moeda}`}
                />
              </div>
              <ArrowRightLeft size={16} className="shrink-0 text-muted" />
              <p className="font-semibold text-secondary">
                {resultado != null ? formatarMoeda(resultado) : "—"}
              </p>
            </div>
          </div>
        </>
      )}
    </Card>
  );
}
