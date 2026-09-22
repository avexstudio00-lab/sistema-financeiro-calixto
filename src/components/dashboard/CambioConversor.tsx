"use client";

import * as React from "react";
import { Globe, ArrowRightLeft } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { formatarMoeda } from "@/lib/format";
import { obterCotacoesMercado } from "@/lib/data/mercado";

type Moeda = "USD" | "EUR";

function parsearValor(texto: string): number {
  const limpo = texto.trim().replace(/\./g, "").replace(",", ".");
  const numero = Number(limpo);
  return Number.isFinite(numero) ? numero : 0;
}

/**
 * Widget de câmbio pra tela da Empresa -- pra quem importa ou compra
 * produtos em dólar/euro e precisa saber na hora quanto isso dá em reais.
 * Cotações vêm da mesma fonte ao vivo usada em Investimentos
 * (`obterCotacoesMercado`, AwesomeAPI cacheada 6h em `cotacoes_mercado`),
 * então não é preciso ficar checando o câmbio em outro site.
 *
 * Decisão de escopo: isso é só um widget informativo (cotação + conversor
 * simples) -- não mexe na tabela `produtos` nem guarda o câmbio junto de
 * cada item. Se no futuro fizer sentido rastrear o custo em dólar de cada
 * produto importado individualmente, isso vira mudança de schema à parte.
 */
export function CambioConversor() {
  const [carregando, setCarregando] = React.useState(true);
  const [usd, setUsd] = React.useState<number | null>(null);
  const [eur, setEur] = React.useState<number | null>(null);
  const [moeda, setMoeda] = React.useState<Moeda>("USD");
  const [valorDigitado, setValorDigitado] = React.useState("");

  React.useEffect(() => {
    let ativo = true;
    obterCotacoesMercado().then((cotacoes) => {
      if (!ativo) return;
      setUsd(cotacoes.usd);
      setEur(cotacoes.eur);
      setCarregando(false);
    });
    return () => {
      ativo = false;
    };
  }, []);

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
        <div>
          <p className="text-body font-semibold text-foreground">Câmbio hoje</p>
          <p className="text-xs text-muted">Pra quem compra ou importa produtos em dólar ou euro</p>
        </div>
      </div>

      {carregando ? (
        <p className="text-small text-muted">Buscando cotações...</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-border bg-muted/5 px-4 py-3">
              <p className="text-xs text-muted">Dólar (USD)</p>
              <p className="text-body font-semibold text-foreground">
                {usd != null ? formatarMoeda(usd) : "indisponível"}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-muted/5 px-4 py-3">
              <p className="text-xs text-muted">Euro (EUR)</p>
              <p className="text-body font-semibold text-foreground">
                {eur != null ? formatarMoeda(eur) : "indisponível"}
              </p>
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
