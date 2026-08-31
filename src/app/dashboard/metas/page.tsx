"use client";

import * as React from "react";
import Link from "next/link";
import { Plus, Lock, Trophy, PiggyBank } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { useAuth } from "@/lib/auth/AuthProvider";
import { criarMeta, listarMetas, atualizarProgressoMeta } from "@/lib/data/metas";
import { podeUsarRecurso } from "@/lib/planos";
import type { Meta } from "@/lib/data/tipos";

function formatarMoeda(valor: number) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function MetasPage() {
  const { user, perfil } = useAuth();
  const temMetas = perfil ? podeUsarRecurso(perfil.plano, "metas") : false;

  const [metas, setMetas] = React.useState<Meta[]>([]);
  const [carregando, setCarregando] = React.useState(true);
  const [formAberto, setFormAberto] = React.useState(false);
  const [nome, setNome] = React.useState("");
  const [valorMeta, setValorMeta] = React.useState("");
  const [dataFim, setDataFim] = React.useState("");
  const [salvando, setSalvando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  const [aporteEmEdicao, setAporteEmEdicao] = React.useState<Record<string, string>>({});

  const carregar = React.useCallback(async () => {
    if (!user) return;
    setCarregando(true);
    setMetas(await listarMetas(user.id));
    setCarregando(false);
  }, [user]);

  React.useEffect(() => {
    if (temMetas) carregar();
    else setCarregando(false);
  }, [temMetas, carregar]);

  async function handleCriarMeta(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    const valor = Number(valorMeta.replace(",", "."));
    if (nome.trim().length < 2 || !valor || valor <= 0) {
      setErro("Preencha o nome e um valor válido para a meta.");
      return;
    }
    setErro(null);
    setSalvando(true);
    await criarMeta(user.id, nome.trim(), valor, dataFim || null);
    setSalvando(false);
    setNome("");
    setValorMeta("");
    setDataFim("");
    setFormAberto(false);
    carregar();
  }

  async function handleAporte(meta: Meta) {
    const valorTexto = aporteEmEdicao[meta.id];
    const valor = Number((valorTexto ?? "").replace(",", "."));
    if (!valor || valor <= 0) return;
    const novoValor = Number(meta.valor_atual) + valor;
    const status = novoValor >= Number(meta.valor_meta) ? "concluida" : "em_andamento";
    await atualizarProgressoMeta(meta.id, novoValor, status);
    setAporteEmEdicao((prev) => ({ ...prev, [meta.id]: "" }));
    carregar();
  }

  if (!temMetas) {
    return (
      <Container className="flex flex-col items-center gap-6 py-16 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-50 text-primary-600">
          <Lock size={28} />
        </span>
        <div>
          <h1 className="text-h2 text-foreground">Metas de economia são um recurso pago</h1>
          <p className="mx-auto mt-2 max-w-md text-body text-muted">
            Assine o plano Mensal ou Avançado para definir quanto quer guardar e acompanhar o
            progresso até chegar lá.
          </p>
        </div>
        <Link href="/dashboard/plano">
          <Button size="lg">Ver planos</Button>
        </Link>
      </Container>
    );
  }

  return (
    <Container className="flex flex-col gap-8 py-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-h2 text-foreground">Metas de economia</h1>
          <p className="text-body text-muted">Defina quanto quer guardar e acompanhe o progresso.</p>
        </div>
        <Button onClick={() => setFormAberto((v) => !v)}>
          <Plus size={18} />
          Nova meta
        </Button>
      </div>

      {formAberto && (
        <Card padding="lg" className="flex flex-col gap-4">
          <h2 className="text-h3 text-foreground">Criar nova meta</h2>
          <form onSubmit={handleCriarMeta} className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Input label="Nome da meta" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Reserva de emergência" />
            </div>
            <div className="flex-1">
              <Input label="Valor da meta" inputMode="decimal" value={valorMeta} onChange={(e) => setValorMeta(e.target.value)} placeholder="0,00" />
            </div>
            <div className="flex-1">
              <Input label="Prazo (opcional)" type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
            </div>
            <Button type="submit" disabled={salvando} className="sm:w-auto">
              {salvando ? "Salvando..." : "Criar"}
            </Button>
          </form>
          {erro && <p className="text-small text-rose-600">{erro}</p>}
        </Card>
      )}

      {carregando ? (
        <p className="py-8 text-center text-body text-muted">Carregando...</p>
      ) : metas.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 py-12 text-center">
          <PiggyBank size={32} className="text-primary-400" />
          <p className="text-body text-muted">Você ainda não tem metas. Que tal criar a primeira?</p>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {metas.map((meta) => {
            const progresso = Math.min(100, (Number(meta.valor_atual) / Number(meta.valor_meta)) * 100);
            return (
              <Card key={meta.id} className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-h3 text-foreground">{meta.nome}</h3>
                  {meta.status === "concluida" && (
                    <Badge variant="primary" size="sm">
                      <Trophy size={12} />
                      Concluída
                    </Badge>
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-small">
                    <span className="text-muted">{formatarMoeda(Number(meta.valor_atual))}</span>
                    <span className="text-muted">{formatarMoeda(Number(meta.valor_meta))}</span>
                  </div>
                  <div className="h-2.5 w-full rounded-full bg-muted/15">
                    <div
                      className="h-2.5 rounded-full bg-gradient-to-r from-primary-500 to-accent-400 transition-all duration-500"
                      style={{ width: `${progresso}%` }}
                    />
                  </div>
                  <p className="text-small font-medium text-primary-600">{progresso.toFixed(0)}% concluído</p>
                </div>
                {meta.status !== "concluida" && (
                  <div className="flex gap-2">
                    <Input
                      placeholder="Guardar valor"
                      inputMode="decimal"
                      value={aporteEmEdicao[meta.id] ?? ""}
                      onChange={(e) => setAporteEmEdicao((prev) => ({ ...prev, [meta.id]: e.target.value }))}
                    />
                    <Button variant="secondary" onClick={() => handleAporte(meta)}>
                      Adicionar
                    </Button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </Container>
  );
}
