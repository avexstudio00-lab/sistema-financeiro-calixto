"use client";

import * as React from "react";
import {
  X,
  Plus,
  Landmark,
  LineChart as LineChartIcon,
  Boxes,
  HandCoins,
  TrendingUp,
  ShoppingBag,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth/AuthProvider";
import { criarInvestimento, TAXA_CDI_SUGERIDA } from "@/lib/data/investimentos";

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
    id: "proprio",
    nome: "Investimento próprio",
    descricao: "Algo que você mesmo controla, sem cálculo automático.",
    icone: Boxes,
  },
  {
    id: "emprestimo",
    nome: "Empréstimo",
    descricao: "Dinheiro emprestado com um ganho combinado.",
    icone: HandCoins,
  },
  {
    id: "revenda",
    nome: "Compra e revenda",
    descricao: "Comprou pra revender (ex: celular)? Registre o custo e o valor de venda.",
    icone: ShoppingBag,
  },
] as const;

type TipoInvestimento = (typeof TIPOS_INVESTIMENTO)[number]["id"];

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
  const [tipoGanho, setTipoGanho] = React.useState<"fixo" | "mensal">("fixo");
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
      setTipoGanho("fixo");
      setErro(null);
    }
  }, [aberto]);

  React.useEffect(() => {
    if (!aberto) return;
    if (tipo === "cdi") {
      setTaxa(String(TAXA_CDI_SUGERIDA).replace(".", ","));
    } else if (tipo === "tesouro" || tipo === "emprestimo") {
      setTaxa("");
    }
  }, [tipo, aberto]);

  if (!aberto) return null;

  const precisaTaxa = tipo === "cdi" || tipo === "tesouro" || tipo === "emprestimo";
  const precisaDescricao = tipo === "tesouro" || tipo === "bolsa" || tipo === "proprio";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;

    const valorNumero = Number(valorInvestido.replace(",", "."));
    if (!valorNumero || valorNumero <= 0) {
      setErro("Digite um valor investido válido.");
      return;
    }
    if (nome.trim().length < 2) {
      setErro("Dê um nome para esse investimento.");
      return;
    }
    if (precisaDescricao && !descricao.trim()) {
      setErro(
        tipo === "tesouro"
          ? "Informe o título (ex: Tesouro Selic 2029)."
          : tipo === "bolsa"
            ? "Informe o ativo (ex: PETR4, HGLG11)."
            : "Descreva o que é esse investimento."
      );
      return;
    }
    const taxaNumero = precisaTaxa ? Number(taxa.replace(",", ".")) : null;
    if (precisaTaxa && (taxaNumero === null || Number.isNaN(taxaNumero))) {
      setErro("Digite uma taxa válida.");
      return;
    }

    setErro(null);
    setSalvando(true);
    const { error } = await criarInvestimento({
      usuario_id: user.id,
      nome: nome.trim(),
      tipo,
      valor_investido: valorNumero,
      valor_atual: valorNumero,
      taxa: taxaNumero,
      descricao: precisaDescricao ? descricao.trim() : null,
      tipo_ganho: tipo === "emprestimo" ? tipoGanho : null,
      data_inicio: dataInicio,
    });
    setSalvando(false);

    if (error) {
      setErro("Não foi possível salvar. Tente novamente.");
      return;
    }
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
            label={tipo === "revenda" ? "O que você comprou" : "Nome do investimento"}
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder={
              tipo === "revenda" ? 'Ex: "iPhone 11", "Tênis Nike 42"' : 'Ex: "Reserva CDI", "Empréstimo para João"'
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
          {tipo === "proprio" && (
            <Input
              label="Descrição"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Ex: Guardando para trocar de carro"
            />
          )}

          <div className="grid grid-cols-2 gap-4">
            <Input
              label={tipo === "revenda" ? "Valor de custo" : "Valor investido"}
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

          {tipo === "emprestimo" && (
            <div className="flex flex-col gap-1.5">
              <span className="text-small font-medium text-foreground">Ganho combinado é</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setTipoGanho("fixo")}
                  className={cn(
                    "flex-1 rounded-xl border px-3 py-2 text-small font-medium transition-all",
                    tipoGanho === "fixo"
                      ? "border-primary-500 bg-primary-50 text-primary-700"
                      : "border-border text-muted"
                  )}
                >
                  Fixo (%)
                </button>
                <button
                  type="button"
                  onClick={() => setTipoGanho("mensal")}
                  className={cn(
                    "flex-1 rounded-xl border px-3 py-2 text-small font-medium transition-all",
                    tipoGanho === "mensal"
                      ? "border-accent-500 bg-accent-50 text-accent-700"
                      : "border-border text-muted"
                  )}
                >
                  Ao mês (%)
                </button>
              </div>
            </div>
          )}

          {precisaTaxa && (
            <Input
              label={
                tipo === "cdi"
                  ? "Taxa do CDI (% ao ano)"
                  : tipo === "tesouro"
                    ? "Taxa (% ao ano)"
                    : tipoGanho === "mensal"
                      ? "Ganho mensal (%)"
                      : "Ganho fixo (%)"
              }
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
