"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Receipt, Trash2, AlertTriangle, Check } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { useAuth } from "@/lib/auth/AuthProvider";
import { listarFornecedores } from "@/lib/data/fornecedores";
import { listarClientes } from "@/lib/data/clientes";
import {
  listarContasPagar,
  criarContaPagar,
  marcarContaPagarPaga,
  deletarContaPagar,
  listarContasReceber,
  criarContaReceber,
  marcarContaReceberRecebida,
  deletarContaReceber,
  estaAtrasada,
} from "@/lib/data/contasEmpresa";
import { formatarMoeda } from "@/lib/format";
import type { Fornecedor, Cliente, ContaPagar, ContaReceber } from "@/lib/data/tipos";

export default function ContasEmpresaPage() {
  const { papel, negocio } = useAuth();
  const router = useRouter();
  const [aba, setAba] = React.useState<"pagar" | "receber">("pagar");

  // Contas a pagar/receber ficam escondidas de funcionário (só dono/sócio
  // veem financeiro do negócio) — o RLS já bloqueia no banco, isso aqui só
  // evita que a pessoa fique numa tela quebrada se digitar a URL direto.
  React.useEffect(() => {
    if (papel === "funcionario") router.replace("/dashboard/empresa");
  }, [papel, router]);

  const [fornecedores, setFornecedores] = React.useState<Fornecedor[]>([]);
  const [clientes, setClientes] = React.useState<Cliente[]>([]);
  const [contasPagar, setContasPagar] = React.useState<ContaPagar[]>([]);
  const [contasReceber, setContasReceber] = React.useState<ContaReceber[]>([]);
  const [carregando, setCarregando] = React.useState(true);

  const [formAberto, setFormAberto] = React.useState(false);
  const [descricao, setDescricao] = React.useState("");
  const [valor, setValor] = React.useState("");
  const [vencimento, setVencimento] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [vinculoId, setVinculoId] = React.useState("");
  const [salvando, setSalvando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  const [confirmandoExclusaoId, setConfirmandoExclusaoId] = React.useState<string | null>(null);

  const carregar = React.useCallback(async () => {
    if (!negocio) return;
    setCarregando(true);
    const [f, c, pagar, receber] = await Promise.all([
      listarFornecedores(negocio.usuarioId),
      listarClientes(negocio.usuarioId),
      listarContasPagar(negocio.usuarioId),
      listarContasReceber(negocio.usuarioId),
    ]);
    setFornecedores(f);
    setClientes(c);
    setContasPagar(pagar.filter((cp) => cp.categoria !== "das"));
    setContasReceber(receber);
    setCarregando(false);
  }, [negocio]);

  React.useEffect(() => {
    carregar();
  }, [carregar]);

  function abrirNovo() {
    setDescricao("");
    setValor("");
    setVencimento(new Date().toISOString().slice(0, 10));
    setVinculoId("");
    setErro(null);
    setFormAberto(true);
  }

  async function handleSalvar(e: React.FormEvent) {
    e.preventDefault();
    if (!negocio) return;
    const valorNumero = Number(valor.replace(",", "."));
    if (descricao.trim().length < 2) {
      setErro("Digite uma descrição.");
      return;
    }
    if (!valorNumero || valorNumero <= 0) {
      setErro("Digite um valor válido.");
      return;
    }
    setErro(null);
    setSalvando(true);

    const { error } =
      aba === "pagar"
        ? await criarContaPagar({
            usuario_id: negocio.usuarioId,
            fornecedor_id: vinculoId || null,
            categoria: "fornecedor",
            descricao: descricao.trim(),
            valor: valorNumero,
            vencimento,
          })
        : await criarContaReceber({
            usuario_id: negocio.usuarioId,
            cliente_id: vinculoId || null,
            descricao: descricao.trim(),
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

  async function handleMarcar(id: string, marcado: boolean) {
    setSalvando(true);
    if (aba === "pagar") await marcarContaPagarPaga(id, marcado);
    else await marcarContaReceberRecebida(id, marcado);
    setSalvando(false);
    carregar();
  }

  async function handleExcluir(id: string) {
    setSalvando(true);
    if (aba === "pagar") await deletarContaPagar(id);
    else await deletarContaReceber(id);
    setSalvando(false);
    setConfirmandoExclusaoId(null);
    carregar();
  }

  const lista = aba === "pagar" ? contasPagar : contasReceber;
  const totalPendente = lista
    .filter((c) => c.status === "pendente")
    .reduce((acc, c) => acc + Number(c.valor), 0);
  const totalAtrasado = lista.filter((c) => estaAtrasada(c)).reduce((acc, c) => acc + Number(c.valor), 0);

  return (
    <Container full className="flex flex-col gap-8 py-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-h2 text-foreground">Contas a pagar e a receber</h1>
          <p className="text-body text-muted">Quem te deve e para quem você deve, com alerta de vencimento.</p>
        </div>
        <Button onClick={abrirNovo}>
          <Plus size={18} />
          {aba === "pagar" ? "Nova conta a pagar" : "Nova conta a receber"}
        </Button>
      </div>

      <div className="flex gap-1 rounded-full bg-muted/10 p-1 self-start">
        {(["pagar", "receber"] as const).map((a) => (
          <button
            key={a}
            type="button"
            onClick={() => {
              setAba(a);
              setConfirmandoExclusaoId(null);
              setFormAberto(false);
            }}
            className={`rounded-full px-4 py-2 text-small font-medium transition-colors ${
              aba === a ? "bg-card text-accent-700 shadow-sm" : "text-muted hover:text-foreground"
            }`}
          >
            {a === "pagar" ? "A pagar" : "A receber"}
          </button>
        ))}
      </div>

      {formAberto && (
        <Card padding="lg" className="flex flex-col gap-4">
          <h2 className="text-h3 text-foreground">
            {aba === "pagar" ? "Nova conta a pagar" : "Nova conta a receber"}
          </h2>
          <form onSubmit={handleSalvar} className="flex flex-col gap-4">
            <Input
              label="Descrição"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder={aba === "pagar" ? "Ex: Aluguel do ponto" : "Ex: Pedido de 20 unidades"}
              autoFocus
            />
            <div className="grid grid-cols-2 gap-4">
              <Input label="Valor" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" />
              <Input label="Vencimento" type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} />
            </div>
            {((aba === "pagar" && fornecedores.length > 0) || (aba === "receber" && clientes.length > 0)) && (
              <div className="flex flex-col gap-1.5">
                <span className="text-small font-medium text-foreground">
                  {aba === "pagar" ? "Fornecedor (opcional)" : "Cliente (opcional)"}
                </span>
                <select
                  value={vinculoId}
                  onChange={(e) => setVinculoId(e.target.value)}
                  className="h-11 rounded-xl border border-border bg-card px-3 text-body text-foreground focus:border-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-100"
                >
                  <option value="">Nenhum</option>
                  {(aba === "pagar" ? fornecedores : clientes).map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.nome}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {erro && <p className="text-small text-rose-600">{erro}</p>}
            <div className="flex gap-2">
              <Button type="submit" disabled={salvando} className="flex-1">
                {salvando ? "Salvando..." : "Salvar"}
              </Button>
              <Button type="button" variant="tertiary" onClick={() => setFormAberto(false)}>
                Cancelar
              </Button>
            </div>
          </form>
        </Card>
      )}

      {!carregando && lista.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="flex flex-col gap-2">
            <p className="text-small text-muted">Pendente</p>
            <p className="text-h3 text-foreground">{formatarMoeda(totalPendente)}</p>
          </Card>
          <Card className="flex flex-col gap-2 border-rose-200 bg-rose-50/60">
            <p className="text-small text-red-700">Atrasado</p>
            <p className="text-h3 text-red-600">{formatarMoeda(totalAtrasado)}</p>
          </Card>
        </div>
      )}

      {carregando ? (
        <p className="py-8 text-center text-body text-muted">Carregando...</p>
      ) : lista.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 py-12 text-center">
          <Receipt size={28} className="text-accent-400" />
          <p className="text-body text-muted">
            {aba === "pagar" ? "Nenhuma conta a pagar cadastrada." : "Nenhuma conta a receber cadastrada."}
          </p>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {lista.map((c) => {
            const atrasada = estaAtrasada(c);
            const pago = c.status !== "pendente";
            const nomeVinculo =
              aba === "pagar" ? (c as ContaPagar).fornecedores?.nome : (c as ContaReceber).clientes?.nome;
            return (
              <Card key={c.id} padding="sm" className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span
                    className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                      pago ? "bg-primary-50 text-primary-600" : atrasada ? "bg-rose-50 text-red-500" : "bg-muted/10 text-muted"
                    }`}
                  >
                    {pago ? <Check size={18} /> : atrasada ? <AlertTriangle size={18} /> : <Receipt size={18} />}
                  </span>
                  <div>
                    <p className="text-body font-medium text-foreground">{c.descricao}</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-small text-muted">
                        Vence {new Date(c.vencimento + "T00:00:00").toLocaleDateString("pt-BR")}
                      </p>
                      {nomeVinculo && (
                        <Badge variant="neutral" size="sm">
                          {nomeVinculo}
                        </Badge>
                      )}
                      {pago && (
                        <Badge variant="primary" size="sm">
                          {aba === "pagar" ? "Pago" : "Recebido"}
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
                  <p className="text-body font-semibold text-foreground">{formatarMoeda(Number(c.valor))}</p>
                  <Button
                    size="sm"
                    variant={pago ? "tertiary" : "secondary"}
                    disabled={salvando}
                    onClick={() => handleMarcar(c.id, !pago)}
                  >
                    {pago ? "Desfazer" : aba === "pagar" ? "Marcar pago" : "Marcar recebido"}
                  </Button>
                  {confirmandoExclusaoId === c.id ? (
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="tertiary" onClick={() => setConfirmandoExclusaoId(null)}>
                        Não
                      </Button>
                      <Button
                        size="sm"
                        disabled={salvando}
                        onClick={() => handleExcluir(c.id)}
                        className="bg-red-500 shadow-none hover:bg-red-600 active:bg-red-700"
                      >
                        Apagar
                      </Button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      aria-label="Apagar"
                      onClick={() => setConfirmandoExclusaoId(c.id)}
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
    </Container>
  );
}
