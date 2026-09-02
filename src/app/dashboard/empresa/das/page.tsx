"use client";

import * as React from "react";
import { Plus, FileText, Trash2, ChevronLeft, ChevronRight, Info, Check } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { useAuth } from "@/lib/auth/AuthProvider";
import {
  listarContasPagar,
  criarContaPagar,
  marcarContaPagarPaga,
  deletarContaPagar,
  estaAtrasada,
} from "@/lib/data/contasEmpresa";
import { gerarResumoEmpresa, faturamentoAnualPorMes, calcularReservaSugerida } from "@/lib/data/empresa";
import { formatarMoeda } from "@/lib/format";
import type { ContaPagar } from "@/lib/data/tipos";

export default function DasPage() {
  const { user } = useAuth();
  const hoje = new Date();

  const [guias, setGuias] = React.useState<ContaPagar[]>([]);
  const [faturamentoDoMes, setFaturamentoDoMes] = React.useState(0);
  const [anoRelatorio, setAnoRelatorio] = React.useState(hoje.getFullYear());
  const [faturamentoAnual, setFaturamentoAnual] = React.useState<{ mes: string; faturamento: number }[]>([]);
  const [carregando, setCarregando] = React.useState(true);
  const [percentualReserva, setPercentualReserva] = React.useState("10");

  const [formAberto, setFormAberto] = React.useState(false);
  const [descricao, setDescricao] = React.useState("");
  const [valor, setValor] = React.useState("");
  const [vencimento, setVencimento] = React.useState(() => hoje.toISOString().slice(0, 10));
  const [salvando, setSalvando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  const [confirmandoExclusaoId, setConfirmandoExclusaoId] = React.useState<string | null>(null);

  const carregar = React.useCallback(async () => {
    if (!user) return;
    setCarregando(true);
    const [todasContas, resumoMes, anual] = await Promise.all([
      listarContasPagar(user.id),
      gerarResumoEmpresa(user.id, hoje.getFullYear(), hoje.getMonth() + 1),
      faturamentoAnualPorMes(user.id, anoRelatorio),
    ]);
    setGuias(todasContas.filter((c) => c.categoria === "das"));
    setFaturamentoDoMes(resumoMes.faturamento);
    setFaturamentoAnual(anual);
    setCarregando(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, anoRelatorio]);

  React.useEffect(() => {
    carregar();
  }, [carregar]);

  function abrirNovo() {
    setDescricao(`DAS ${hoje.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}`);
    setValor("");
    setVencimento(hoje.toISOString().slice(0, 10));
    setErro(null);
    setFormAberto(true);
  }

  async function handleSalvar(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    const valorNumero = Number(valor.replace(",", "."));
    if (!valorNumero || valorNumero <= 0) {
      setErro("Digite o valor da guia.");
      return;
    }
    setErro(null);
    setSalvando(true);
    const { error } = await criarContaPagar({
      usuario_id: user.id,
      fornecedor_id: null,
      categoria: "das",
      descricao: descricao.trim() || "DAS",
      valor: valorNumero,
      vencimento,
    });
    setSalvando(false);
    if (error) {
      setErro("Não foi possível salvar. Tente novamente.");
      return;
    }
    setFormAberto(false);
    carregar();
  }

  async function handleMarcarPaga(id: string, pago: boolean) {
    setSalvando(true);
    await marcarContaPagarPaga(id, pago);
    setSalvando(false);
    carregar();
  }

  async function handleExcluir(id: string) {
    setSalvando(true);
    await deletarContaPagar(id);
    setSalvando(false);
    setConfirmandoExclusaoId(null);
    carregar();
  }

  const percentual = Number(percentualReserva.replace(",", ".")) || 0;
  const reservaSugerida = calcularReservaSugerida(faturamentoDoMes, percentual);
  const totalFaturamentoAnual = faturamentoAnual.reduce((acc, p) => acc + p.faturamento, 0);
  const maiorMesAnual = Math.max(1, ...faturamentoAnual.map((p) => p.faturamento));

  return (
    <Container className="flex flex-col gap-8 py-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-h2 text-foreground">DAS e impostos</h1>
          <p className="text-body text-muted">Controle da guia mensal e uma reserva sugerida pra não ser pego de surpresa.</p>
        </div>
        <Button onClick={abrirNovo}>
          <Plus size={18} />
          Nova guia
        </Button>
      </div>

      <Card className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-small text-muted">Reserva sugerida pra esse mês</p>
            <p className="text-h2 text-accent-600">{formatarMoeda(reservaSugerida)}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-small text-muted">Reservar</span>
            <div className="w-20">
              <Input
                value={percentualReserva}
                onChange={(e) => setPercentualReserva(e.target.value)}
                inputMode="decimal"
              />
            </div>
            <span className="text-small text-muted">% do faturamento ({formatarMoeda(faturamentoDoMes)})</span>
          </div>
        </div>
        <div className="flex items-start gap-2 rounded-xl bg-muted/10 p-3">
          <Info size={16} className="mt-0.5 shrink-0 text-muted" />
          <p className="text-small text-muted">
            Isso é só uma sugestão pra te ajudar a guardar dinheiro pro DAS e outros impostos — não é um
            cálculo oficial de tributos, que varia por enquadramento. O percentual é seu, ajuste como fizer
            sentido, e conte com seu contador pra confirmar valores.
          </p>
        </div>
      </Card>

      {formAberto && (
        <Card padding="lg" className="flex flex-col gap-4">
          <h2 className="text-h3 text-foreground">Nova guia do DAS</h2>
          <form onSubmit={handleSalvar} className="flex flex-col gap-4">
            <Input label="Descrição" value={descricao} onChange={(e) => setDescricao(e.target.value)} />
            <div className="grid grid-cols-2 gap-4">
              <Input label="Valor" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" />
              <Input label="Vencimento" type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} />
            </div>
            {erro && <p className="text-small text-rose-600">{erro}</p>}
            <div className="flex gap-2">
              <Button type="submit" disabled={salvando} className="flex-1">
                {salvando ? "Salvando..." : "Salvar guia"}
              </Button>
              <Button type="button" variant="tertiary" onClick={() => setFormAberto(false)}>
                Cancelar
              </Button>
            </div>
          </form>
        </Card>
      )}

      <div className="flex flex-col gap-4">
        <h2 className="text-h3 text-foreground">Suas guias</h2>
        {carregando ? (
          <p className="py-8 text-center text-body text-muted">Carregando...</p>
        ) : guias.length === 0 ? (
          <Card className="flex flex-col items-center gap-3 py-10 text-center">
            <FileText size={28} className="text-accent-400" />
            <p className="text-body text-muted">Nenhuma guia registrada ainda.</p>
          </Card>
        ) : (
          <div className="flex flex-col gap-2">
            {guias.map((g) => {
              const atrasada = estaAtrasada(g);
              const pago = g.status === "pago";
              return (
                <Card key={g.id} padding="sm" className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span
                      className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                        pago ? "bg-primary-50 text-primary-600" : atrasada ? "bg-rose-50 text-red-500" : "bg-muted/10 text-muted"
                      }`}
                    >
                      {pago ? <Check size={18} /> : <FileText size={18} />}
                    </span>
                    <div>
                      <p className="text-body font-medium text-foreground">{g.descricao}</p>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-small text-muted">
                          Vence {new Date(g.vencimento + "T00:00:00").toLocaleDateString("pt-BR")}
                        </p>
                        {pago && (
                          <Badge variant="primary" size="sm">
                            Pago
                          </Badge>
                        )}
                        {!pago && atrasada && (
                          <Badge variant="danger" size="sm">
                            Atrasada
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="text-body font-semibold text-foreground">{formatarMoeda(Number(g.valor))}</p>
                    <Button size="sm" variant={pago ? "tertiary" : "secondary"} disabled={salvando} onClick={() => handleMarcarPaga(g.id, !pago)}>
                      {pago ? "Desfazer" : "Marcar paga"}
                    </Button>
                    {confirmandoExclusaoId === g.id ? (
                      <div className="flex items-center gap-1">
                        <Button size="sm" variant="tertiary" onClick={() => setConfirmandoExclusaoId(null)}>
                          Não
                        </Button>
                        <Button size="sm" disabled={salvando} onClick={() => handleExcluir(g.id)} className="bg-red-500 shadow-none hover:bg-red-600 active:bg-red-700">
                          Apagar
                        </Button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        aria-label="Apagar guia"
                        onClick={() => setConfirmandoExclusaoId(g.id)}
                        className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-rose-50 hover:text-red-500"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <Card padding="lg" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-h3 text-foreground">Faturamento anual (pra declaração)</h2>
          <div className="flex items-center gap-2 rounded-full border border-border bg-card px-2 py-1">
            <button onClick={() => setAnoRelatorio((a) => a - 1)} className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-muted/10">
              <ChevronLeft size={18} />
            </button>
            <span className="min-w-[64px] text-center text-small font-semibold text-foreground">{anoRelatorio}</span>
            <button onClick={() => setAnoRelatorio((a) => a + 1)} className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-muted/10">
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
        <p className="text-small text-muted">
          Total faturado em {anoRelatorio}: <strong className="text-foreground">{formatarMoeda(totalFaturamentoAnual)}</strong>
        </p>
        <div className="flex flex-col gap-2">
          {faturamentoAnual.map((p) => (
            <div key={p.mes} className="flex items-center gap-3">
              <span className="w-10 text-small text-muted">{p.mes}</span>
              <div className="h-2 flex-1 rounded-full bg-muted/15">
                <div
                  className="h-2 rounded-full bg-accent-500"
                  style={{ width: `${(p.faturamento / maiorMesAnual) * 100}%` }}
                />
              </div>
              <span className="w-24 shrink-0 text-right text-small text-muted">{formatarMoeda(p.faturamento)}</span>
            </div>
          ))}
        </div>
      </Card>
    </Container>
  );
}
