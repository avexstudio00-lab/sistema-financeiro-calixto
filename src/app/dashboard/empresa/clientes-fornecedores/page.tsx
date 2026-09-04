"use client";

import * as React from "react";
import { Plus, Users, Trash2, Pencil, Phone, Mail } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useAuth } from "@/lib/auth/AuthProvider";
import {
  listarClientes,
  criarCliente,
  atualizarCliente,
  deletarCliente,
} from "@/lib/data/clientes";
import {
  listarFornecedores,
  criarFornecedor,
  atualizarFornecedor,
  deletarFornecedor,
} from "@/lib/data/fornecedores";
import { listarVendas } from "@/lib/data/vendas";
import { listarContasPagar, listarContasReceber } from "@/lib/data/contasEmpresa";
import { formatarMoeda } from "@/lib/format";
import type { Cliente, Fornecedor, Venda, ContaPagar, ContaReceber } from "@/lib/data/tipos";

export default function ClientesFornecedoresPage() {
  const { papel, negocio } = useAuth();
  const ehFuncionario = papel === "funcionario";
  const [aba, setAba] = React.useState<"clientes" | "fornecedores">("clientes");

  // Fornecedores é financeiro do negócio (ligado a contas a pagar) —
  // escondido de funcionário, que só pode ver a aba de clientes. Se por
  // acaso a aba de fornecedores ficou selecionada antes do papel carregar,
  // volta pra clientes.
  React.useEffect(() => {
    if (ehFuncionario && aba === "fornecedores") setAba("clientes");
  }, [ehFuncionario, aba]);

  const [clientes, setClientes] = React.useState<Cliente[]>([]);
  const [fornecedores, setFornecedores] = React.useState<Fornecedor[]>([]);
  const [vendas, setVendas] = React.useState<Venda[]>([]);
  const [contasPagar, setContasPagar] = React.useState<ContaPagar[]>([]);
  const [contasReceber, setContasReceber] = React.useState<ContaReceber[]>([]);
  const [carregando, setCarregando] = React.useState(true);

  const [formAberto, setFormAberto] = React.useState(false);
  const [editandoId, setEditandoId] = React.useState<string | null>(null);
  const [nome, setNome] = React.useState("");
  const [telefone, setTelefone] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [salvando, setSalvando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  const [confirmandoExclusaoId, setConfirmandoExclusaoId] = React.useState<string | null>(null);

  const carregar = React.useCallback(async () => {
    if (!negocio) return;
    setCarregando(true);
    // Funcionário não tem acesso a fornecedores nem a contas a pagar/receber
    // (RLS bloqueia) — nem tenta buscar, pra não gerar erro à toa na tela.
    const [c, f, v, cp, cr] = await Promise.all([
      listarClientes(negocio.usuarioId),
      ehFuncionario ? Promise.resolve([]) : listarFornecedores(negocio.usuarioId),
      listarVendas(negocio.usuarioId),
      ehFuncionario ? Promise.resolve([]) : listarContasPagar(negocio.usuarioId),
      ehFuncionario ? Promise.resolve([]) : listarContasReceber(negocio.usuarioId),
    ]);
    setClientes(c);
    setFornecedores(f);
    setVendas(v);
    setContasPagar(cp.filter((c2) => c2.categoria !== "das"));
    setContasReceber(cr);
    setCarregando(false);
  }, [negocio, ehFuncionario]);

  React.useEffect(() => {
    carregar();
  }, [carregar]);

  function abrirNovo() {
    setEditandoId(null);
    setNome("");
    setTelefone("");
    setEmail("");
    setErro(null);
    setFormAberto(true);
  }

  function abrirEdicao(item: Cliente | Fornecedor) {
    setEditandoId(item.id);
    setNome(item.nome);
    setTelefone(item.telefone ?? "");
    setEmail(item.email ?? "");
    setErro(null);
    setFormAberto(true);
  }

  async function handleSalvar(e: React.FormEvent) {
    e.preventDefault();
    if (!negocio) return;
    if (nome.trim().length < 2) {
      setErro("Digite um nome.");
      return;
    }
    setErro(null);
    setSalvando(true);

    const { error } =
      aba === "clientes"
        ? editandoId
          ? await atualizarCliente(editandoId, nome.trim(), telefone.trim() || null, email.trim() || null)
          : await criarCliente(negocio.usuarioId, nome.trim(), telefone.trim() || null, email.trim() || null)
        : editandoId
        ? await atualizarFornecedor(editandoId, nome.trim(), telefone.trim() || null, email.trim() || null)
        : await criarFornecedor(negocio.usuarioId, nome.trim(), telefone.trim() || null, email.trim() || null);
    setSalvando(false);

    if (error) {
      setErro("Não foi possível salvar. Tente novamente.");
      return;
    }
    setFormAberto(false);
    carregar();
  }

  async function handleExcluir(id: string) {
    setSalvando(true);
    if (aba === "clientes") await deletarCliente(id);
    else await deletarFornecedor(id);
    setSalvando(false);
    setConfirmandoExclusaoId(null);
    carregar();
  }

  const lista = aba === "clientes" ? clientes : fornecedores;

  return (
    <Container full className="flex flex-col gap-8 py-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-h2 text-foreground">Clientes e fornecedores</h1>
          <p className="text-body text-muted">Cadastro simples, com histórico e valores pendentes.</p>
        </div>
        <Button onClick={abrirNovo}>
          <Plus size={18} />
          {aba === "clientes" ? "Novo cliente" : "Novo fornecedor"}
        </Button>
      </div>

      <div className="flex gap-1 rounded-full bg-muted/10 p-1 self-start">
        {(ehFuncionario ? (["clientes"] as const) : (["clientes", "fornecedores"] as const)).map((a) => (
          <button
            key={a}
            type="button"
            onClick={() => {
              setAba(a);
              setConfirmandoExclusaoId(null);
              setFormAberto(false);
            }}
            className={`rounded-full px-4 py-2 text-small font-medium capitalize transition-colors ${
              aba === a ? "bg-card text-accent-700 shadow-sm" : "text-muted hover:text-foreground"
            }`}
          >
            {a}
          </button>
        ))}
      </div>

      {formAberto && (
        <Card padding="lg" className="flex flex-col gap-4">
          <h2 className="text-h3 text-foreground">
            {editandoId ? "Editar" : "Novo"} {aba === "clientes" ? "cliente" : "fornecedor"}
          </h2>
          <form onSubmit={handleSalvar} className="flex flex-col gap-4 sm:flex-row sm:items-end sm:flex-wrap">
            <div className="flex-1 min-w-[160px]">
              <Input label="Nome" value={nome} onChange={(e) => setNome(e.target.value)} autoFocus />
            </div>
            <div className="flex-1 min-w-[140px]">
              <Input label="Telefone (opcional)" value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="(00) 00000-0000" />
            </div>
            <div className="flex-1 min-w-[160px]">
              <Input label="E-mail (opcional)" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={salvando}>
                {salvando ? "Salvando..." : "Salvar"}
              </Button>
              <Button type="button" variant="tertiary" onClick={() => setFormAberto(false)}>
                Cancelar
              </Button>
            </div>
          </form>
          {erro && <p className="text-small text-rose-600">{erro}</p>}
        </Card>
      )}

      {carregando ? (
        <p className="py-8 text-center text-body text-muted">Carregando...</p>
      ) : lista.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 py-12 text-center">
          <Users size={28} className="text-accent-400" />
          <p className="text-body text-muted">
            {aba === "clientes" ? "Nenhum cliente cadastrado ainda." : "Nenhum fornecedor cadastrado ainda."}
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {lista.map((item) => {
            const totalComprado =
              aba === "clientes"
                ? vendas.filter((v) => v.cliente_id === item.id).reduce((acc, v) => acc + Number(v.valor_total), 0)
                : contasPagar
                    .filter((c) => c.fornecedor_id === item.id && c.status === "pago")
                    .reduce((acc, c) => acc + Number(c.valor), 0);
            const pendente =
              aba === "clientes"
                ? contasReceber
                    .filter((c) => c.cliente_id === item.id && c.status === "pendente")
                    .reduce((acc, c) => acc + Number(c.valor), 0)
                : contasPagar
                    .filter((c) => c.fornecedor_id === item.id && c.status === "pendente")
                    .reduce((acc, c) => acc + Number(c.valor), 0);

            return (
              <Card key={item.id} className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-50 text-accent-600">
                      <Users size={18} />
                    </span>
                    <div>
                      <p className="text-body font-semibold text-foreground">{item.nome}</p>
                      <div className="flex flex-col text-xs text-muted">
                        {item.telefone && (
                          <span className="flex items-center gap-1">
                            <Phone size={11} /> {item.telefone}
                          </span>
                        )}
                        {item.email && (
                          <span className="flex items-center gap-1">
                            <Mail size={11} /> {item.email}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-small">
                  <div>
                    <p className="text-xs text-muted">{aba === "clientes" ? "Total comprado" : "Total pago"}</p>
                    <p className="font-semibold text-foreground">{formatarMoeda(totalComprado)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted">Pendente</p>
                    <p className={`font-semibold ${pendente > 0 ? "text-amber-600" : "text-foreground"}`}>
                      {formatarMoeda(pendente)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 border-t border-border pt-3">
                  <button
                    type="button"
                    onClick={() => abrirEdicao(item)}
                    className="flex items-center gap-1.5 rounded-full bg-muted/10 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/20"
                  >
                    <Pencil size={12} />
                    Editar
                  </button>
                  {confirmandoExclusaoId === item.id ? (
                    <div className="ml-auto flex items-center gap-2">
                      <span className="text-xs text-muted">Apagar?</span>
                      <Button size="sm" variant="tertiary" onClick={() => setConfirmandoExclusaoId(null)}>
                        Não
                      </Button>
                      <Button
                        size="sm"
                        disabled={salvando}
                        onClick={() => handleExcluir(item.id)}
                        className="bg-red-500 shadow-none hover:bg-red-600 active:bg-red-700"
                      >
                        Sim, apagar
                      </Button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      aria-label="Apagar"
                      onClick={() => setConfirmandoExclusaoId(item.id)}
                      className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-rose-50 hover:text-red-500"
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
