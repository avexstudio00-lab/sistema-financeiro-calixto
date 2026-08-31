"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Briefcase, Building2, User, ArrowRight, SkipForward, Check } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth/AuthProvider";
import { atualizarTipoPerfil } from "@/lib/data/usuarios";
import { criarConta } from "@/lib/data/contas";
import { criarTransacao } from "@/lib/data/transacoes";
import { listarCategorias } from "@/lib/data/categorias";
import type { Categoria, Conta } from "@/lib/data/tipos";

type TipoPerfil = "clt" | "mei" | "me";

const PERFIS: { id: TipoPerfil; icon: typeof User; titulo: string; texto: string }[] = [
  { id: "clt", icon: User, titulo: "CLT", texto: "Trabalho com carteira assinada." },
  { id: "mei", icon: Briefcase, titulo: "MEI", texto: "Sou microempreendedor individual." },
  { id: "me", icon: Building2, titulo: "ME", texto: "Tenho uma pequena empresa." },
];

const TIPOS_CONTA: { id: Conta["tipo"]; label: string }[] = [
  { id: "corrente", label: "Conta corrente" },
  { id: "poupanca", label: "Poupança" },
  { id: "dinheiro", label: "Dinheiro" },
  { id: "cartao_credito", label: "Cartão de crédito" },
  { id: "carteira_digital", label: "Carteira digital" },
];

export default function OnboardingPage() {
  const router = useRouter();
  const { user, perfil, carregando, recarregarPerfil } = useAuth();

  const [etapa, setEtapa] = React.useState(1);
  const [salvando, setSalvando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);

  // Etapa 1
  const [tipoPerfil, setTipoPerfil] = React.useState<TipoPerfil | null>(null);

  // Etapa 2
  const [nomeConta, setNomeConta] = React.useState("Minha conta");
  const [tipoConta, setTipoConta] = React.useState<Conta["tipo"]>("corrente");
  const [saldoInicial, setSaldoInicial] = React.useState("0");
  const [contaCriada, setContaCriada] = React.useState<{ id: string } | null>(null);

  // Etapa 3
  const [categorias, setCategorias] = React.useState<Categoria[]>([]);
  const [valorTransacao, setValorTransacao] = React.useState("");
  const [descricaoTransacao, setDescricaoTransacao] = React.useState("");
  const [categoriaId, setCategoriaId] = React.useState("");
  const [tipoTransacao, setTipoTransacao] = React.useState<"receita" | "despesa">("despesa");

  React.useEffect(() => {
    if (!carregando && !user) router.replace("/login");
    if (!carregando && perfil?.tipo_perfil) router.replace("/dashboard");
  }, [carregando, user, perfil, router]);

  React.useEffect(() => {
    if (etapa === 3 && user) {
      listarCategorias(user.id).then(setCategorias);
    }
  }, [etapa, user]);

  async function handleEtapa1() {
    if (!tipoPerfil) {
      setErro("Escolha uma opção para continuar.");
      return;
    }
    setErro(null);
    setEtapa(2);
  }

  async function handleEtapa2() {
    if (!user) return;
    if (nomeConta.trim().length < 2) {
      setErro("Dê um nome para sua conta.");
      return;
    }
    setErro(null);
    setSalvando(true);
    const saldo = Number(saldoInicial.replace(",", ".")) || 0;
    const { data, error } = await criarConta(user.id, nomeConta.trim(), tipoConta, saldo);
    setSalvando(false);
    if (error || !data) {
      setErro("Não foi possível criar sua conta. Tente novamente.");
      return;
    }
    setContaCriada({ id: data.id });
    setEtapa(3);
  }

  async function finalizar() {
    if (!user || !tipoPerfil) return;
    setSalvando(true);
    await atualizarTipoPerfil(user.id, tipoPerfil);
    await recarregarPerfil();
    setSalvando(false);
    router.push("/dashboard");
  }

  async function handleEtapa3ComTransacao() {
    if (!user) return;
    const valor = Number(valorTransacao.replace(",", "."));
    if (!valor || valor <= 0) {
      setErro("Digite um valor válido.");
      return;
    }
    setErro(null);
    setSalvando(true);
    await criarTransacao({
      usuario_id: user.id,
      conta_id: contaCriada?.id ?? null,
      categoria_id: categoriaId || null,
      tipo: tipoTransacao,
      valor,
      descricao: descricaoTransacao.trim() || (tipoTransacao === "receita" ? "Receita" : "Gasto"),
      data: new Date().toISOString().slice(0, 10),
      forma_pagamento: null,
      tipo_negocio: tipoPerfil === "clt" ? "pessoal" : null,
    });
    await finalizar();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background py-16">
      <Container className="flex max-w-lg flex-col gap-6">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                className={cn(
                  "h-1.5 flex-1 rounded-full transition-colors duration-300",
                  n <= etapa ? "bg-primary-500" : "bg-muted/15"
                )}
              />
            ))}
          </div>
          <p className="text-small text-muted">Passo {etapa} de 3</p>
        </div>

        {etapa === 1 && (
          <Card padding="lg" className="flex flex-col gap-6">
            <div>
              <h1 className="text-h2 text-foreground">Qual é o seu perfil?</h1>
              <p className="mt-1 text-body text-muted">
                Isso nos ajuda a mostrar o que realmente importa para você.
              </p>
            </div>
            <div className="flex flex-col gap-3">
              {PERFIS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setTipoPerfil(p.id)}
                  className={cn(
                    "flex items-center gap-4 rounded-2xl border-2 p-4 text-left transition-all duration-200",
                    tipoPerfil === p.id
                      ? "border-primary-500 bg-primary-50"
                      : "border-border bg-card hover:border-muted/40"
                  )}
                >
                  <span
                    className={cn(
                      "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
                      tipoPerfil === p.id ? "bg-primary-500 text-white" : "bg-muted/15 text-muted"
                    )}
                  >
                    <Icon icon={p.icon} />
                  </span>
                  <span className="flex-1">
                    <span className="block text-body font-semibold text-foreground">{p.titulo}</span>
                    <span className="block text-small text-muted">{p.texto}</span>
                  </span>
                  {tipoPerfil === p.id && <Check size={20} className="text-primary-600" />}
                </button>
              ))}
            </div>
            {erro && <p className="text-small text-rose-600">{erro}</p>}
            <Button size="lg" onClick={handleEtapa1} className="w-full">
              Continuar
              <ArrowRight size={18} />
            </Button>
          </Card>
        )}

        {etapa === 2 && (
          <Card padding="lg" className="flex flex-col gap-6">
            <div>
              <h1 className="text-h2 text-foreground">Crie sua primeira conta</h1>
              <p className="mt-1 text-body text-muted">
                É onde vamos organizar suas entradas e saídas.
              </p>
            </div>
            <div className="flex flex-col gap-4">
              <Input
                label="Nome da conta"
                value={nomeConta}
                onChange={(e) => setNomeConta(e.target.value)}
                placeholder="Ex: Nubank, Carteira, Caixa da empresa"
              />
              <div className="flex flex-col gap-1.5">
                <span className="text-small font-medium text-foreground">Tipo de conta</span>
                <div className="grid grid-cols-2 gap-2">
                  {TIPOS_CONTA.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTipoConta(t.id)}
                      className={cn(
                        "rounded-xl border px-3 py-2.5 text-left text-small font-medium transition-all",
                        tipoConta === t.id
                          ? "border-primary-500 bg-primary-50 text-primary-700"
                          : "border-border text-muted hover:border-muted/40"
                      )}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
              <Input
                label="Saldo inicial"
                inputMode="decimal"
                value={saldoInicial}
                onChange={(e) => setSaldoInicial(e.target.value)}
                placeholder="0,00"
              />
            </div>
            {erro && <p className="text-small text-rose-600">{erro}</p>}
            <Button size="lg" onClick={handleEtapa2} disabled={salvando} className="w-full">
              {salvando ? "Salvando..." : "Continuar"}
              {!salvando && <ArrowRight size={18} />}
            </Button>
          </Card>
        )}

        {etapa === 3 && (
          <Card padding="lg" className="flex flex-col gap-6">
            <div>
              <h1 className="text-h2 text-foreground">Que tal anotar seu primeiro gasto?</h1>
              <p className="mt-1 text-body text-muted">
                Opcional — você pode pular e fazer isso depois.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setTipoTransacao("despesa")}
                className={cn(
                  "flex-1 rounded-xl border-2 py-2.5 text-small font-semibold transition-all",
                  tipoTransacao === "despesa"
                    ? "border-rose-400 bg-rose-50 text-rose-600"
                    : "border-border text-muted"
                )}
              >
                Saída
              </button>
              <button
                type="button"
                onClick={() => setTipoTransacao("receita")}
                className={cn(
                  "flex-1 rounded-xl border-2 py-2.5 text-small font-semibold transition-all",
                  tipoTransacao === "receita"
                    ? "border-primary-400 bg-primary-50 text-primary-700"
                    : "border-border text-muted"
                )}
              >
                Entrada
              </button>
            </div>
            <div className="flex flex-col gap-4">
              <Input
                label="Valor"
                inputMode="decimal"
                value={valorTransacao}
                onChange={(e) => setValorTransacao(e.target.value)}
                placeholder="0,00"
              />
              <Input
                label="Descrição"
                value={descricaoTransacao}
                onChange={(e) => setDescricaoTransacao(e.target.value)}
                placeholder="Ex: Mercado, Salário..."
              />
              {categorias.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-small font-medium text-foreground">Categoria</span>
                  <div className="flex flex-wrap gap-2">
                    {categorias
                      .filter((c) => c.tipo === tipoTransacao)
                      .map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setCategoriaId(c.id)}
                          className={cn(
                            "rounded-full border px-3 py-1.5 text-small font-medium transition-all",
                            categoriaId === c.id
                              ? "border-primary-500 bg-primary-50 text-primary-700"
                              : "border-border text-muted"
                          )}
                        >
                          {c.nome}
                        </button>
                      ))}
                  </div>
                </div>
              )}
            </div>
            {erro && <p className="text-small text-rose-600">{erro}</p>}
            <div className="flex flex-col gap-2">
              <Button size="lg" onClick={handleEtapa3ComTransacao} disabled={salvando} className="w-full">
                {salvando ? "Salvando..." : "Salvar e concluir"}
              </Button>
              <Button
                size="lg"
                variant="tertiary"
                onClick={finalizar}
                disabled={salvando}
                className="w-full"
              >
                <SkipForward size={18} />
                Pular por agora
              </Button>
            </div>
          </Card>
        )}
      </Container>
    </main>
  );
}
