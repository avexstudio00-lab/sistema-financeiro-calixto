"use client";

import * as React from "react";
import {
  X,
  Plus,
  Landmark,
  LineChart as LineChartIcon,
  HandCoins,
  TrendingUp,
  ShoppingBag,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { DateMaskInput } from "@/components/ui/DateMaskInput";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth/AuthProvider";
import {
  criarInvestimento,
  criarParcelasDoInvestimento,
  gerarDatasSugeridasParcelas,
  TAXA_CDI_SUGERIDA,
} from "@/lib/data/investimentos";

const TIPOS_INVESTIMENTO = [
  {
    id: "cdi",
    nome: "CDI",
    descricao: "Renda fixa atrelada ao CDI. O ganho é calculado pela taxa.",
    icone: TrendingUp,
  },
  {
    id: "tesouro",
    nome: "Tesouro Direto",
    descricao: "Título público, ex: Tesouro Selic. Você informa o título e a taxa.",
    icone: Landmark,
  },
  {
    id: "bolsa",
    nome: "Bolsa de Valores",
    descricao: "Ações, FIIs e outros ativos. Você atualiza o valor manualmente.",
    icone: LineChartIcon,
  },
  {
    id: "emprestimo",
    nome: "Empréstimo",
    descricao: "Dinheiro emprestado pra alguém, com um valor combinado de volta.",
    icone: HandCoins,
  },
  {
    id: "revenda",
    nome: "Compra e revenda",
    descricao:
      "Algo que você comprou — pra revender (ex: celular) ou só seu, sem cálculo automático. Registre o custo e, se vender, o valor de venda.",
    icone: ShoppingBag,
  },
] as const;

type TipoInvestimento = (typeof TIPOS_INVESTIMENTO)[number]["id"];

const PERIODICIDADES = [
  { id: "mensal", label: "Mensal" },
  { id: "quinzenal", label: "Quinzenal" },
  { id: "semanal", label: "Semanal" },
] as const;

type Periodicidade = (typeof PERIODICIDADES)[number]["id"];

/** Converte um valor digitado em texto pra número, aceitando tanto "1000.5"
 * (ponto como decimal, sem separador de milhar) quanto o formato brasileiro
 * "10.000,50" (ponto como milhar, vírgula como decimal) — antes só o segundo
 * caso com vírgula era tratado (e de forma incompleta: só a vírgula virava
 * ponto, sem remover os pontos de milhar, o que quebrava valores como
 * "10.000,00" pra NaN). Sem vírgula no texto, assume que não há separador
 * de milhar e o número já está pronto pra `Number()`. */
function parsearValorDigitado(texto: string): number {
  const valor = texto.trim();
  if (valor.includes(",")) {
    return Number(valor.replace(/\./g, "").replace(",", "."));
  }
  return Number(valor);
}

function formatarMoedaSimples(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export interface NovoInvestimentoModalProps {
  aberto: boolean;
  onFechar: () => void;
  onSalvo: () => void;
}

export function NovoInvestimentoModal({ aberto, onFechar, onSalvo }: NovoInvestimentoModalProps) {
  const { user } = useAuth();

  const [tipo, setTipo] = React.useState<TipoInvestimento>("cdi");
  const [nome, setNome] = React.useState("");
  const [valorInvestido, setValorInvestido] = React.useState("");
  const [dataInicio, setDataInicio] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [taxa, setTaxa] = React.useState(String(TAXA_CDI_SUGERIDA).replace(".", ","));
  const [descricao, setDescricao] = React.useState("");
  const [formaPagamento, setFormaPagamento] = React.useState<"vista" | "parcelado">("vista");
  const [numeroParcelas, setNumeroParcelas] = React.useState("");
  const [valorRetornavel, setValorRetornavel] = React.useState("");
  const [dataVencimentoFinal, setDataVencimentoFinal] = React.useState("");
  const [periodicidade, setPeriodicidade] = React.useState<Periodicidade>("mensal");
  const [datasParcelas, setDatasParcelas] = React.useState<string[]>([]);
  const [datasEditadasManualmente, setDatasEditadasManualmente] = React.useState<boolean[]>([]);
  const [salvando, setSalvando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!aberto) {
      setTipo("cdi");
      setNome("");
      setValorInvestido("");
      setDataInicio(new Date().toISOString().slice(0, 10));
      setTaxa(String(TAXA_CDI_SUGERIDA).replace(".", ","));
      setDescricao("");
      setFormaPagamento("vista");
      setNumeroParcelas("");
      setValorRetornavel("");
      setDataVencimentoFinal("");
      setPeriodicidade("mensal");
      setDatasParcelas([]);
      setDatasEditadasManualmente([]);
      setErro(null);
    }
  }, [aberto]);

  React.useEffect(() => {
    if (!aberto) return;
    if (tipo === "cdi") {
      setTaxa(String(TAXA_CDI_SUGERIDA).replace(".", ","));
    } else if (tipo === "tesouro") {
      setTaxa("");
    }
  }, [tipo, aberto]);

  React.useEffect(() => {
    if (!aberto) return;
    if (tipo !== "emprestimo" && tipo !== "revenda") {
      setFormaPagamento("vista");
      setNumeroParcelas("");
      setValorRetornavel("");
      setDataVencimentoFinal("");
      setPeriodicidade("mensal");
      setDatasParcelas([]);
      setDatasEditadasManualmente([]);
    }
  }, [tipo, aberto]);

  const precisaTaxa = tipo === "cdi" || tipo === "tesouro";
  const precisaDescricao = tipo === "tesouro" || tipo === "bolsa";
  const podeParcelar = tipo === "emprestimo" || tipo === "revenda";
  const parcelando = podeParcelar && formaPagamento === "parcelado";
  const ehEmprestimo = tipo === "emprestimo";
  // Empréstimo (à vista ou parcelado): a pessoa diz direto quanto volta no
  // total (já com o combinado), em vez de a gente calcular a partir de uma
  // taxa — o app calcula o juros sozinho como a diferença. Compra e revenda
  // parcelada continua dividindo o próprio valor investido (sem juros).
  const numeroParcelasNumero = Number(numeroParcelas);
  const valorInvestidoNumero = parsearValorDigitado(valorInvestido);
  const valorRetornavelNumero = parsearValorDigitado(valorRetornavel);
  const valorParaParcelas = ehEmprestimo ? valorRetornavelNumero : valorInvestidoNumero;
  const valorParcelaCalculado =
    parcelando && valorParaParcelas > 0 && numeroParcelasNumero >= 2
      ? valorParaParcelas / numeroParcelasNumero
      : null;
  const jurosCombinado =
    ehEmprestimo && valorInvestidoNumero > 0 && valorRetornavelNumero > 0
      ? valorRetornavelNumero - valorInvestidoNumero
      : null;
  const jurosCombinadoPercentual =
    jurosCombinado != null && valorInvestidoNumero > 0 ? (jurosCombinado / valorInvestidoNumero) * 100 : null;

  // Gera (ou re-sincroniza) as N datas de parcela sempre que o número de
  // parcelas, a periodicidade ou a data de início mudam — mas sem nunca
  // sobrescrever uma data que a própria pessoa já editou à mão (pra permitir
  // frequência combinada mista: ex. 3 parcelas mensais + 2 quinzenais).
  React.useEffect(() => {
    if (!aberto || !parcelando || !numeroParcelasNumero || numeroParcelasNumero < 2) {
      setDatasParcelas([]);
      setDatasEditadasManualmente([]);
      return;
    }
    const sugeridas = gerarDatasSugeridasParcelas(dataInicio, numeroParcelasNumero, periodicidade);
    setDatasParcelas((atual) => sugeridas.map((s, i) => (datasEditadasManualmente[i] && atual[i] ? atual[i] : s)));
    setDatasEditadasManualmente((atual) => {
      const novo = Array(numeroParcelasNumero).fill(false);
      for (let i = 0; i < Math.min(atual.length, numeroParcelasNumero); i++) novo[i] = atual[i];
      return novo;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, parcelando, numeroParcelasNumero, periodicidade, dataInicio]);

  function handleEditarDataParcela(indice: number, novoIso: string) {
    setDatasParcelas((atual) => {
      const novo = [...atual];
      novo[indice] = novoIso;
      return novo;
    });
    setDatasEditadasManualmente((atual) => {
      const novo = [...atual];
      novo[indice] = true;
      return novo;
    });
  }

  if (!aberto) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;

    const valorNumero = valorInvestidoNumero;
    if (!valorNumero || valorNumero <= 0) {
      setErro(ehEmprestimo ? "Digite um valor emprestado válido." : "Digite um valor investido válido.");
      return;
    }
    if (nome.trim().length < 2) {
      setErro(ehEmprestimo ? "Digite o nome da pessoa." : "Dê um nome para esse investimento.");
      return;
    }
    if (precisaDescricao && !descricao.trim()) {
      setErro(tipo === "tesouro" ? "Informe o título (ex: Tesouro Selic 2029)." : "Informe o ativo (ex: PETR4, HGLG11).");
      return;
    }
    const taxaNumero = precisaTaxa ? Number(taxa.replace(",", ".")) : null;
    if (precisaTaxa && (taxaNumero === null || Number.isNaN(taxaNumero))) {
      setErro("Digite uma taxa válida.");
      return;
    }
    if (ehEmprestimo && (!valorRetornavelNumero || valorRetornavelNumero <= 0)) {
      setErro("Digite quanto a pessoa vai devolver no total (com o combinado já embutido).");
      return;
    }
    if (ehEmprestimo && valorRetornavelNumero < valorNumero) {
      setErro(`O valor com juros precisa ser pelo menos o valor emprestado (${formatarMoedaSimples(valorNumero)}).`);
      return;
    }
    if (parcelando && (!numeroParcelasNumero || numeroParcelasNumero < 2)) {
      setErro("Digite em quantas parcelas (mínimo 2).");
      return;
    }
    if (parcelando && (datasParcelas.length !== numeroParcelasNumero || datasParcelas.some((d) => !d))) {
      setErro(`Preencha as ${numeroParcelasNumero} datas de parcela.`);
      return;
    }
    if (parcelando && datasParcelas.some((d) => d <= dataInicio)) {
      setErro("Todas as datas de parcela precisam ser depois da data de início.");
      return;
    }
    if (ehEmprestimo && !parcelando && !dataVencimentoFinal) {
      setErro("Digite a data combinada de pagamento.");
      return;
    }
    if (ehEmprestimo && !parcelando && dataVencimentoFinal <= dataInicio) {
      setErro("A data de pagamento precisa ser depois da data de início.");
      return;
    }

    // Data em que o valor combinado (valor_retornavel) é atingido por
    // completo: pra empréstimo parcelado é sempre o vencimento da última
    // parcela (mesmo se as datas foram editadas manualmente e ficaram fora
    // de ordem); pra empréstimo à vista é a própria data de pagamento.
    const dataVencimentoFinalCalculada = !ehEmprestimo
      ? null
      : parcelando
        ? datasParcelas.reduce((maisTarde, d) => (d > maisTarde ? d : maisTarde), datasParcelas[0])
        : dataVencimentoFinal;

    setErro(null);
    setSalvando(true);
    const { data, error } = await criarInvestimento({
      usuario_id: user.id,
      nome: nome.trim(),
      tipo,
      valor_investido: valorNumero,
      valor_atual: valorNumero,
      taxa: taxaNumero,
      descricao: precisaDescricao ? descricao.trim() : null,
      tipo_ganho: null,
      data_inicio: dataInicio,
      forma_pagamento: podeParcelar ? formaPagamento : null,
      numero_parcelas: parcelando ? numeroParcelasNumero : null,
      valor_parcela: parcelando && valorParcelaCalculado ? Number(valorParcelaCalculado.toFixed(2)) : null,
      periodicidade_parcelas: parcelando ? periodicidade : null,
      valor_retornavel: ehEmprestimo ? valorRetornavelNumero : null,
      data_vencimento_final: dataVencimentoFinalCalculada,
    });

    if (error || !data) {
      setSalvando(false);
      setErro("Não foi possível salvar. Tente novamente.");
      return;
    }

    if (parcelando && valorParcelaCalculado) {
      const { error: erroParcelas } = await criarParcelasDoInvestimento(
        data.id,
        user.id,
        numeroParcelasNumero,
        valorParaParcelas,
        datasParcelas
      );
      if (erroParcelas) {
        setSalvando(false);
        setErro("Investimento salvo, mas não deu pra criar as parcelas. Tente editar depois.");
        return;
      }
    }

    setSalvando(false);
    onSalvo();
    onFechar();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 backdrop-blur-sm sm:items-center">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-y-auto rounded-t-3xl bg-card p-6 shadow-card-hover sm:rounded-3xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-h3 text-foreground">Novo investimento</h2>
          <button
            type="button"
            onClick={onFechar}
            aria-label="Fechar"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-muted/10"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <span className="text-small font-medium text-foreground">Tipo de investimento</span>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {TIPOS_INVESTIMENTO.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTipo(t.id)}
                  className={cn(
                    "flex flex-col gap-1 rounded-xl border-2 p-3 text-left transition-all",
                    tipo === t.id ? "border-primary-500 bg-primary-50" : "border-border hover:bg-muted/5"
                  )}
                >
                  <span className="flex items-center gap-2">
                    <t.icone
                      size={16}
                      className={tipo === t.id ? "text-primary-600" : "text-muted"}
                    />
                    <span
                      className={cn(
                        "text-small font-semibold",
                        tipo === t.id ? "text-primary-700" : "text-foreground"
                      )}
                    >
                      {t.nome}
                    </span>
                  </span>
                  <span className="text-xs text-muted">{t.descricao}</span>
                </button>
              ))}
            </div>
          </div>

          <Input
            label={ehEmprestimo ? "Nome da pessoa" : tipo === "revenda" ? "O que você comprou" : "Nome do investimento"}
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder={
              ehEmprestimo
                ? 'Ex: "Aline", "João"'
                : tipo === "revenda"
                  ? 'Ex: "iPhone 11", "Tênis Nike 42"'
                  : 'Ex: "Reserva CDI"'
            }
          />

          {tipo === "tesouro" && (
            <Input
              label="Título"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Ex: Tesouro Selic 2029"
            />
          )}
          {tipo === "bolsa" && (
            <Input
              label="Ativo"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Ex: PETR4, HGLG11"
            />
          )}
          <div className="grid grid-cols-2 gap-4">
            <Input
              label={ehEmprestimo ? "Valor emprestado" : tipo === "revenda" ? "Valor de custo" : "Valor investido"}
              inputMode="decimal"
              value={valorInvestido}
              onChange={(e) => setValorInvestido(e.target.value)}
              placeholder="0,00"
            />
            <Input
              label={tipo === "revenda" ? "Data da compra" : "Data de início"}
              type="date"
              value={dataInicio}
              onChange={(e) => setDataInicio(e.target.value)}
            />
          </div>

          {ehEmprestimo && (
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Valor com juros"
                inputMode="decimal"
                value={valorRetornavel}
                onChange={(e) => setValorRetornavel(e.target.value)}
                placeholder="0,00"
                helperText="Quanto ela devolve no total, já com o combinado."
              />
              <div className="flex flex-col gap-1.5">
                <span className="text-small font-medium text-foreground">Juros combinado</span>
                <div className="flex h-11 items-center rounded-xl border border-border bg-muted/5 px-4 text-small text-foreground">
                  {jurosCombinado != null && jurosCombinado >= 0
                    ? `${formatarMoedaSimples(jurosCombinado)} (+${jurosCombinadoPercentual?.toFixed(1)}%)`
                    : "—"}
                </div>
              </div>
            </div>
          )}

          {podeParcelar && (
            <div className="flex flex-col gap-1.5">
              <span className="text-small font-medium text-foreground">Pagamento</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setFormaPagamento("vista")}
                  className={cn(
                    "flex-1 rounded-xl border px-3 py-2 text-small font-medium transition-all",
                    formaPagamento === "vista"
                      ? "border-primary-500 bg-primary-50 text-primary-700"
                      : "border-border text-muted"
                  )}
                >
                  À vista
                </button>
                <button
                  type="button"
                  onClick={() => setFormaPagamento("parcelado")}
                  className={cn(
                    "flex-1 rounded-xl border px-3 py-2 text-small font-medium transition-all",
                    formaPagamento === "parcelado"
                      ? "border-primary-500 bg-primary-50 text-primary-700"
                      : "border-border text-muted"
                  )}
                >
                  Parcelado
                </button>
              </div>

             { ehEmprestimo && formaPagamento === "vista" && (
                <div className="pt-1">
                  <DateMaskInput
                    label="Data de pagamento"
                    value={dataVencimentoFinal}
                    onChange={setDataVencimentoFinal}
                    helperText="A data combinada pra receber o valor com juros de volta."
                  />
                </div>
              )}

              {parcelando && (
                <div className="grid grid-cols-2 gap-4 pt-1">
                  <Input
                    label="Número de parcelas"
                    inputMode="numeric"
                    value={numeroParcelas}
                    onChange={(e) => setNumeroParcelas(e.target.value.replace(/\D/g, ""))}
                    placeholder="Ex: 10"
                  />
                  <div className="flex flex-col gap-1.5">
                    <span className="text-small font-medium text-foreground">Valor de cada parcela</span>
                    <div className="flex h-11 items-center rounded-xl border border-border bg-muted/5 px-3 text-small text-foreground">
                      {valorParcelaCalculado ? formatarMoedaSimples(valorParcelaCalculado) : "—"}
                    </div>
                  </div>
                </div>
              )}
              {parcelando && (
                <div className="flex flex-col gap-1.5 pt-1">
                  <span className="text-small font-medium text-foreground">Periodicidade</span>
                  <div className="flex gap-2">
                    {PERIODICIDADES.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setPeriodicidade(p.id)}
                        className={cn(
                          "flex-1 rounded-xl border px-3 py-2 text-small font-medium transition-all",
                          periodicidade === p.id
                            ? "border-primary-500 bg-primary-50 text-primary-700"
                            : "border-border text-muted"
                        )}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                  <span className="text-xs text-muted">
                    O app já preenche as datas abaixo pra você. Se as parcelas combinadas tiverem frequência
                    diferente entre si (ex: uma quinzenal, outra mensal), edite a data de cada uma à mão.
                  </span>
                </div>
              )}
              {parcelando && datasParcelas.length > 0 && (
                <div className="flex flex-col gap-2 pt-1">
                  <span className="text-small font-medium text-foreground">Datas de pagamento</span>
                  <div className="grid grid-cols-2 gap-3">
                    {datasParcelas.map((data, i) => (
                      <DateMaskInput
                        key={i}
                        label={`Parcela ${i + 1}`}
                        value={data}
                        onChange={(iso) => handleEditarDataParcela(i, iso)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {precisaTaxa && (
            <Input
              label={tipo === "cdi" ? "Taxa do CDI (% ao ano)" : "Taxa (% ao ano)"}
              inputMode="decimal"
              value={taxa}
              onChange={(e) => setTaxa(e.target.value)}
              placeholder="0,0"
              helperText={tipo === "cdi" ? "Valor de referência do mercado — você pode ajustar." : undefined}
            />
          )}

          {erro && <p className="text-small text-rose-600">{erro}</p>}

          <Button type="submit" size="lg" disabled={salvando} className="mt-1 w-full">
            {salvando ? "Salvando..." : "Salvar investimento"}
            {!salvando && <Plus size={18} />}
          </Button>
        </form>
      </div>
    </div>
  );
}
