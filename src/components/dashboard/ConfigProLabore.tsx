"use client";

import * as React from "react";
import { HandCoins, Plus, Save } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils";
import { formatarMoeda } from "@/lib/format";
import { salvarConfigNegocio, type ConfigNegocio, type ModoSemProLabore } from "@/lib/data/configNegocio";

interface Props {
  config: ConfigNegocio;
  /** Total já lançado na categoria "Pró-labore" no mês exibido. */
  retiradoNoMes: number;
  /** "Sobrou no caixa" do mês, antes de descontar o pró-labore que falta. */
  sobrou: number;
  podeEditar: boolean;
  onSalvo: (config: ConfigNegocio) => void;
  onRegistrarRetirada: () => void;
}

const OPCOES_MODO: { valor: ModoSemProLabore; titulo: string; descricao: string }[] = [
  {
    valor: "esporadicas",
    titulo: "Retiradas esporádicas",
    descricao: "De vez em quando os sócios tiram um valor pra se manter, sem data nem valor fixo.",
  },
  {
    valor: "conciliacao_unificada",
    titulo: "Caixa unificado",
    descricao: "Os custos do dia a dia dos sócios são pagos direto pelo caixa da empresa.",
  },
];

/**
 * Item 4.4 da especificação de 03/out/2026 — "Retira pró-labore?" no Fluxo de
 * caixa. Com "Sim", o valor mensal vira uma saída prevista (o que falta
 * retirar é descontado da sobra projetada). Com "Não", o fluxo para de cobrar
 * essa linha e mostra as retiradas só como informação, sem apontar
 * "pró-labore não retirado" como se fosse uma inconsistência.
 */
export function ConfigProLabore({ config, retiradoNoMes, sobrou, podeEditar, onSalvo, onRegistrarRetirada }: Props) {
  const [retira, setRetira] = React.useState(config.retira_pro_labore);
  const [valorTexto, setValorTexto] = React.useState(
    config.valor_pro_labore !== null ? String(config.valor_pro_labore).replace(".", ",") : ""
  );
  const [modo, setModo] = React.useState<ModoSemProLabore | null>(config.modo_sem_pro_labore);
  const [diaTexto, setDiaTexto] = React.useState(config.dia_pro_labore != null ? String(config.dia_pro_labore) : "");
  const [observacao, setObservacao] = React.useState(config.observacao_retiradas ?? "");
  const [salvando, setSalvando] = React.useState(false);
  const [mensagem, setMensagem] = React.useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  // Se a config mudar por fora (ex: recarregou a tela), reflete aqui.
  React.useEffect(() => {
    setRetira(config.retira_pro_labore);
    setValorTexto(config.valor_pro_labore !== null ? String(config.valor_pro_labore).replace(".", ",") : "");
    setModo(config.modo_sem_pro_labore);
    setDiaTexto(config.dia_pro_labore != null ? String(config.dia_pro_labore) : "");
    setObservacao(config.observacao_retiradas ?? "");
  }, [config]);

  const valorDigitado = valorTexto.trim() === "" ? null : Number(valorTexto.replace(/\./g, "").replace(",", "."));
  const valorInvalido = valorDigitado !== null && (!Number.isFinite(valorDigitado) || valorDigitado < 0);
  const diaDigitado = diaTexto.trim() === "" ? null : Number(diaTexto);
  const diaInvalido = diaDigitado !== null && (!Number.isInteger(diaDigitado) || diaDigitado < 1 || diaDigitado > 31);

  const alterado =
    retira !== config.retira_pro_labore ||
    (retira && (valorInvalido ? true : valorDigitado) !== config.valor_pro_labore) ||
    (retira && diaDigitado !== (config.dia_pro_labore ?? null)) ||
    (!retira && (modo !== config.modo_sem_pro_labore || (observacao.trim() || null) !== config.observacao_retiradas));

  async function salvar() {
    if (valorInvalido) {
      setMensagem({ tipo: "erro", texto: "Valor do pró-labore inválido." });
      return;
    }
    if (diaInvalido) {
      setMensagem({ tipo: "erro", texto: "Dia de competência: um número de 1 a 31." });
      return;
    }
    setSalvando(true);
    setMensagem(null);
    const nova: ConfigNegocio = {
      usuario_id: config.usuario_id,
      retira_pro_labore: retira,
      valor_pro_labore: retira ? valorDigitado : null,
      modo_sem_pro_labore: retira ? null : modo,
      observacao_retiradas: retira ? null : observacao.trim() || null,
      dia_pro_labore: retira ? diaDigitado : null,
    };
    const { error } = await salvarConfigNegocio(nova);
    setSalvando(false);
    if (error) {
      console.error("Erro ao salvar config de pró-labore:", error.message);
      setMensagem({ tipo: "erro", texto: "Não deu pra salvar agora. Tente de novo." });
      return;
    }
    setMensagem({ tipo: "ok", texto: "Configuração salva." });
    onSalvo(nova);
  }

  // Projeção só usa o que está SALVO (não o que está sendo digitado).
  const previsto = config.retira_pro_labore ? config.valor_pro_labore ?? 0 : 0;
  const falta = Math.max(previsto - retiradoNoMes, 0);
  const sobraProjetada = sobrou - falta;

  return (
    <Card padding="lg" className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-700">
          <HandCoins size={20} />
        </span>
        <div className="min-w-0">
          <h2 className="text-h3 text-foreground">Remuneração dos sócios</h2>
          <p className="text-small text-muted">Define como o fluxo de caixa trata o dinheiro que os sócios tiram.</p>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-small font-medium text-foreground">A administração realiza retirada mensal de Pró-labore?</span>
        <div className="flex gap-2" role="radiogroup" aria-label="Retira pró-labore?">
          {[true, false].map((opcao) => (
            <button
              key={String(opcao)}
              type="button"
              role="radio"
              aria-checked={retira === opcao}
              disabled={!podeEditar}
              onClick={() => setRetira(opcao)}
              className={cn(
                "h-10 min-w-[88px] rounded-xl border px-4 text-small font-semibold transition-colors disabled:opacity-60",
                retira === opcao
                  ? "border-primary-500 bg-primary-50 text-primary-700"
                  : "border-border text-foreground hover:bg-muted/10"
              )}
            >
              {opcao ? "Sim" : "Não"}
            </button>
          ))}
        </div>
      </div>

      {retira ? (
        <Input
          label="Valor fixo por mês"
          inputMode="decimal"
          placeholder="0,00"
          value={valorTexto}
          disabled={!podeEditar}
          onChange={(e) => setValorTexto(e.target.value)}
          error={valorInvalido ? "Digite um valor válido." : undefined}
          helperText="Entra como saída prevista todo mês no fluxo de caixa."
        />
      ) : null}
      {retira ? (
        <Input
          label="Dia padrão da retirada (competência)"
          inputMode="numeric"
          placeholder="Ex: 5"
          value={diaTexto}
          disabled={!podeEditar}
          onChange={(e) => setDiaTexto(e.target.value.replace(/\D/g, "").slice(0, 2))}
          error={diaInvalido ? "Dia de 1 a 31." : undefined}
          helperText="Usado para lembrar e prever a saída no dia certo de cada mês."
        />
      ) : (
        <div className="flex flex-col gap-3">
          <span className="text-small font-medium text-foreground">Como os sócios tiram dinheiro? (opcional)</span>
          <div className="grid gap-2 sm:grid-cols-2">
            {OPCOES_MODO.map((opcao) => (
              <button
                key={opcao.valor}
                type="button"
                disabled={!podeEditar}
                onClick={() => setModo((atual) => (atual === opcao.valor ? null : opcao.valor))}
                className={cn(
                  "flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-colors disabled:opacity-60",
                  modo === opcao.valor ? "border-primary-500 bg-primary-50" : "border-border hover:bg-muted/10"
                )}
              >
                <span className="text-small font-semibold text-foreground">{opcao.titulo}</span>
                <span className="text-small text-muted">{opcao.descricao}</span>
              </button>
            ))}
          </div>
          <Input
            label="Anotação (opcional)"
            placeholder="Ex: retiro quando o mês fecha positivo"
            value={observacao}
            maxLength={500}
            disabled={!podeEditar}
            onChange={(e) => setObservacao(e.target.value)}
          />
        </div>
      )}

      {podeEditar && (
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm" onClick={salvar} disabled={salvando || !alterado}>
            <Save size={16} />
            {salvando ? "Salvando..." : "Salvar"}
          </Button>
          {mensagem && (
            <span className={cn("text-small", mensagem.tipo === "ok" ? "text-primary-700" : "text-rose-700")}>
              {mensagem.texto}
            </span>
          )}
        </div>
      )}

      <div className="flex flex-col gap-3 rounded-xl border border-border p-4">
        {config.retira_pro_labore ? (
          previsto > 0 ? (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <p className="text-small text-muted">Previsto no mês</p>
                  <p className="text-body font-semibold text-foreground">{formatarMoeda(previsto)}</p>
                </div>
                <div>
                  <p className="text-small text-muted">Já retirado</p>
                  <p className="text-body font-semibold text-foreground">{formatarMoeda(retiradoNoMes)}</p>
                </div>
                <div>
                  <p className="text-small text-muted">Falta retirar</p>
                  <p className="text-body font-semibold text-foreground">{formatarMoeda(falta)}</p>
                </div>
              </div>
              <p className="text-small text-foreground">
                Sobra projetada depois do pró-labore:{" "}
                <strong className={sobraProjetada >= 0 ? "text-primary-700" : "text-rose-700"}>
                  {formatarMoeda(sobraProjetada)}
                </strong>
              </p>
            </>
          ) : (
            <p className="text-small text-foreground">
              Informe o valor fixo mensal pra o fluxo de caixa prever essa saída.
            </p>
          )
        ) : (
          <p className="text-small text-foreground">
            Sem pró-labore fixo: o fluxo de caixa não cobra essa linha.
            {retiradoNoMes > 0 && (
              <>
                {" "}
                Retiradas dos sócios lançadas neste mês: <strong>{formatarMoeda(retiradoNoMes)}</strong>.
              </>
            )}
          </p>
        )}
        <div>
          <Button variant="secondary" size="sm" onClick={onRegistrarRetirada}>
            <Plus size={16} />
            Registrar retirada
          </Button>
        </div>
      </div>
    </Card>
  );
}
