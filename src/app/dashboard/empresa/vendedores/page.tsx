"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BadgeDollarSign, ChevronLeft, ChevronRight, Lock, Pencil, Plus, Trash2, UserRound, X } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { useAuth } from "@/lib/auth/AuthProvider";
import { listarVendas } from "@/lib/data/vendas";
import {
  atualizarVendedor,
  calcularResultadoVendedores,
  criarVendedor,
  excluirVendedor,
  listarVendedores,
  type DadosVendedor,
} from "@/lib/data/vendedores";
import { formatarMoeda } from "@/lib/format";
import { PLANOS, podeUsarVendedores } from "@/lib/planos";
import { cn } from "@/lib/utils";
import type { Venda, Vendedor } from "@/lib/data/tipos";

/**
 * Vendedores (13/nov/2026): cadastro com o jeito que cada um ganha
 * (comissão em % ou preço de repasse por peça), meta do mês e, por mês,
 * quanto cada um vendeu, quanto falta pra meta, a comissão a pagar ou
 * quanto o vendedor de repasse te deve.
 */

const ROTULO_MODELO: Record<Vendedor["modelo"], string> = {
  comissao: "Comissão",
  repasse: "Preço de repasse",
  nenhum: "Só acompanhar",
};

const NOMES_MES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

function lerNumero(t: string): number | null {
  const s = t.trim();
  if (!s) return null;
  const n = Number(s.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export default function VendedoresPage() {
  const { negocio, papel } = useAuth();
  const router = useRouter();
  const hoje = new Date();
  const [ano, setAno] = React.useState(hoje.getFullYear());
  const [mes, setMes] = React.useState(hoje.getMonth() + 1);
  const [vendedores, setVendedores] = React.useState<Vendedor[]>([]);
  const [vendas, setVendas] = React.useState<Venda[]>([]);
  const [carregando, setCarregando] = React.useState(true);

  const [formAberto, setFormAberto] = React.useState(false);
  const [editandoId, setEditandoId] = React.useState<string | null>(null);
  const [nome, setNome] = React.useState("");
  const [modelo, setModelo] = React.useState<Vendedor["modelo"]>("comissao");
  const [pct, setPct] = React.useState("");
  const [meta, setMeta] = React.useState("");
  const [telefone, setTelefone] = React.useState("");
  const [erro, setErro] = React.useState<string | null>(null);
  const [salvando, setSalvando] = React.useState(false);
  const [apagandoId, setApagandoId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (papel === "funcionario") router.replace("/dashboard/empresa/vendas");
  }, [papel, router]);

  const carregar = React.useCallback(async () => {
    if (!negocio) return;
    const inicio = `${ano}-${String(mes).padStart(2, "0")}-01`;
    const fim = `${ano}-${String(mes).padStart(2, "0")}-${String(new Date(ano, mes, 0).getDate()).padStart(2, "0")}`;
    const [vs, vd] = await Promise.all([listarVendedores(negocio.usuarioId), listarVendas(negocio.usuarioId, { inicio, fim })]);
    setVendedores(vs);
    setVendas(vd);
    setCarregando(false);
  }, [negocio, ano, mes]);

  React.useEffect(() => {
    void carregar();
  }, [carregar]);

  const resultados = React.useMemo(() => calcularResultadoVendedores(vendas, vendedores), [vendas, vendedores]);
  const semVenda = vendedores.filter((v) => v.ativo && !resultados.some((r) => r.vendedor?.id === v.id));
  const totalComissoes = resultados.filter((r) => r.vendedor?.modelo === "comissao").reduce((a, r) => a + r.ganhoVendedor, 0);
  const totalAReceber = resultados.reduce((a, r) => a + r.devePagar, 0);

  function abrirNovo(nomeInicial = "") {
    setEditandoId(null);
    setNome(nomeInicial);
    setModelo("comissao");
    setPct("");
    setMeta("");
    setTelefone("");
    setErro(null);
    setFormAberto(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function abrirEdicao(v: Vendedor) {
    setEditandoId(v.id);
    setNome(v.nome);
    setModelo(v.modelo);
    setPct(v.comissao_pct != null ? String(v.comissao_pct).replace(".", ",") : "");
    setMeta(v.meta_mensal != null ? String(v.meta_mensal).replace(".", ",") : "");
    setTelefone(v.telefone ?? "");
    setErro(null);
    setFormAberto(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!negocio) return;
    if (nome.trim().length < 2) return setErro("Escreva o nome do vendedor.");
    const comissao = lerNumero(pct);
    if (modelo === "comissao" && (comissao == null || comissao > 100)) return setErro("Informe a comissão em % (de 0 a 100).");
    const dados: DadosVendedor = {
      nome,
      modelo,
      comissao_pct: modelo === "comissao" ? comissao : null,
      meta_mensal: lerNumero(meta),
      telefone: telefone.trim() || null,
    };
    setSalvando(true);
    setErro(null);
    const r = editandoId ? await atualizarVendedor(editandoId, dados) : await criarVendedor(negocio.usuarioId, dados);
    setSalvando(false);
    if (r.error) {
      console.error("Erro ao salvar vendedor:", r.error);
      return setErro(/duplicate|unique/i.test(r.error.message) ? "Já existe um vendedor com esse nome." : "Não consegui salvar. Tente de novo.");
    }
    setFormAberto(false);
    void carregar();
  }

  async function apagar(id: string) {
    await excluirVendedor(id);
    setApagandoId(null);
    void carregar();
  }

  function mudarMes(delta: number) {
    const d = new Date(ano, mes - 1 + delta, 1);
    setAno(d.getFullYear());
    setMes(d.getMonth() + 1);
  }

  // Item 3.5 (14/nov/2026): Vendedores faz parte dos planos com equipe.
  // Nos outros, a tela explica o que é e leva pra Meu plano.
  if (negocio && !podeUsarVendedores(negocio.plano)) {
    return (
      <Container full className="flex flex-col gap-6 py-8">
        <div>
          <h1 className="text-h2 text-foreground">Vendedores</h1>
          <p className="text-body text-muted">Quanto cada um vendeu, meta, comissão e repasse.</p>
        </div>
        <Card className="flex flex-col items-center gap-3 py-12 text-center">
          <Lock size={28} className="text-accent-500" />
          <p className="max-w-md text-body text-foreground">
            Controle de vendedores faz parte dos planos <strong>{PLANOS.grupo.nome}</strong> ({PLANOS.grupo.precoLabel}) e{" "}
            <strong>{PLANOS.grupo_multi.nome}</strong> ({PLANOS.grupo_multi.precoLabel}).
          </p>
          <ul className="flex max-w-sm flex-col gap-1 text-left text-small text-muted">
            <li>• Marque quem fez cada venda e veja o ranking do mês</li>
            <li>• Comissão em % ou preço de repasse por peça</li>
            <li>• Meta de cada vendedor e quanto falta</li>
            <li>• O que vai para os vendedores já sai do seu lucro líquido</li>
          </ul>
          <Link href="/dashboard/plano">
            <Button>Ver planos com equipe</Button>
          </Link>
        </Card>
      </Container>
    );
  }

  return (
    <Container full className="flex flex-col gap-6 py-8">
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div>
          <h1 className="text-h2 text-foreground">Vendedores</h1>
          <p className="text-body text-muted">Quanto cada um vendeu, meta, comissão e repasse.</p>
        </div>
        <Button onClick={() => abrirNovo()}>
          <Plus size={18} />
          Novo vendedor
        </Button>
      </div>

      {formAberto && (
        <Card padding="lg" className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-h3 text-foreground">{editandoId ? "Editar vendedor" : "Novo vendedor"}</h2>
            <button type="button" onClick={() => setFormAberto(false)} aria-label="Fechar" className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-muted/10">
              <X size={18} />
            </button>
          </div>
          <form onSubmit={salvar} className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Nome (igual ao usado na venda)" value={nome} onChange={(e) => setNome(e.target.value)} autoFocus />
              <Input label="WhatsApp (opcional)" inputMode="tel" value={telefone} onChange={(e) => setTelefone(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-small font-medium text-foreground">Como ele ganha</span>
              <div className="grid gap-2 sm:grid-cols-3">
                {(["comissao", "repasse", "nenhum"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setModelo(m)}
                    className={cn(
                      "rounded-xl border-2 px-3 py-2.5 text-left text-small transition-all",
                      modelo === m ? "border-accent-400 bg-accent-50 dark:bg-accent-900/20" : "border-border"
                    )}
                  >
                    <p className="font-semibold text-foreground">{ROTULO_MODELO[m]}</p>
                    <p className="text-xs text-muted">
                      {m === "comissao"
                        ? "Ganha uma % do que vende."
                        : m === "repasse"
                          ? "Te paga o preço de repasse da peça e fica com o que vender acima."
                          : "Só ver as vendas dele."}
                    </p>
                  </button>
                ))}
              </div>
              {modelo === "repasse" && (
                <p className="text-xs text-muted">O preço de repasse de cada peça fica no cadastro do produto (Produtos → Editar → Preço de repasse).</p>
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {modelo === "comissao" && <Input label="Comissão (%)" inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} placeholder="Ex: 10" />}
              <Input label="Meta de vendas no mês (R$, opcional)" inputMode="decimal" value={meta} onChange={(e) => setMeta(e.target.value)} placeholder="Ex: 5.000,00" />
            </div>
            {erro && <p className="text-small text-rose-600">{erro}</p>}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={salvando}>
                {salvando ? "Salvando..." : "Salvar"}
              </Button>
              <Button type="button" variant="tertiary" onClick={() => setFormAberto(false)}>
                Cancelar
              </Button>
            </div>
          </form>
        </Card>
      )}

      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={() => mudarMes(-1)} aria-label="Mês anterior" className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-muted/10">
          <ChevronLeft size={18} />
        </button>
        <p className="text-body font-semibold text-foreground first-letter:uppercase">
          {NOMES_MES[mes - 1]} de {ano}
        </p>
        <button type="button" onClick={() => mudarMes(1)} aria-label="Próximo mês" className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-muted/10">
          <ChevronRight size={18} />
        </button>
      </div>

      {(totalComissoes > 0 || totalAReceber > 0) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {totalComissoes > 0 && (
            <Card className="flex flex-col gap-1">
              <p className="text-small text-muted">Comissões a pagar no mês</p>
              <p className="text-h3 text-foreground">{formatarMoeda(totalComissoes)}</p>
            </Card>
          )}
          {totalAReceber > 0 && (
            <Card className="flex flex-col gap-1">
              <p className="text-small text-muted">Vendedores de repasse te devem</p>
              <p className="text-h3 text-foreground">{formatarMoeda(totalAReceber)}</p>
            </Card>
          )}
        </div>
      )}

      {carregando ? (
        <p className="py-8 text-center text-body text-muted">Carregando...</p>
      ) : resultados.length === 0 && vendedores.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 py-12 text-center">
          <BadgeDollarSign size={28} className="text-accent-700" />
          <p className="text-body text-muted">Cadastre seus vendedores para ver comissão, repasse e meta de cada um.</p>
          <p className="max-w-md text-small text-muted">Na hora da venda, o campo &quot;Quem vendeu&quot; liga a venda ao vendedor pelo nome.</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {resultados.map((r) => {
            const progresso = r.meta ? Math.min(100, (r.vendido / r.meta) * 100) : 0;
            return (
              <Card key={r.nome} className="flex flex-col gap-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-50 text-accent-700 dark:bg-accent-900/20">
                      <UserRound size={18} />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-body font-semibold text-foreground">{r.nome}</p>
                      <div className="flex flex-wrap items-center gap-2">
                        {r.vendedor ? (
                          <Badge size="sm" variant="accent">
                            {ROTULO_MODELO[r.vendedor.modelo]}
                            {r.vendedor.modelo === "comissao" && r.vendedor.comissao_pct != null ? ` ${String(r.vendedor.comissao_pct).replace(".", ",")}%` : ""}
                          </Badge>
                        ) : (
                          <button type="button" onClick={() => abrirNovo(r.nome)} className="text-xs font-semibold text-accent-700 hover:underline dark:text-accent-300">
                            Cadastrar como vendedor
                          </button>
                        )}
                        <span className="text-xs text-muted">
                          {r.vendas} {r.vendas === 1 ? "venda" : "vendas"}
                        </span>
                      </div>
                    </div>
                  </div>
                  <p className="shrink-0 text-h3 text-foreground">{formatarMoeda(r.vendido)}</p>
                </div>

                {r.meta != null && r.meta > 0 && (
                  <div className="flex flex-col gap-1">
                    <div className="h-2 overflow-hidden rounded-full bg-muted/15">
                      <div className="h-full rounded-full bg-accent-500" style={{ width: `${progresso}%` }} />
                    </div>
                    <p className="text-xs text-muted">
                      Meta {formatarMoeda(r.meta)} · {r.falta && r.falta > 0 ? `faltam ${formatarMoeda(r.falta)}` : "meta batida! 🎉"}
                    </p>
                  </div>
                )}

                <div className="grid gap-2 text-small sm:grid-cols-2">
                  {r.vendedor?.modelo === "comissao" && (
                    <p className="text-foreground">
                      Comissão a pagar: <strong>{formatarMoeda(r.ganhoVendedor)}</strong>
                    </p>
                  )}
                  {r.vendedor?.modelo === "repasse" && (
                    <>
                      <p className="text-foreground">
                        Te deve (repasse): <strong>{formatarMoeda(r.devePagar)}</strong>
                      </p>
                      <p className="text-foreground">
                        Ele ganhou acima do repasse: <strong>{formatarMoeda(r.ganhoVendedor)}</strong>
                      </p>
                      {r.itensSemRepasse > 0 && (
                        <p className="text-xs text-amber-800 dark:text-amber-200 sm:col-span-2">
                          {r.itensSemRepasse} {r.itensSemRepasse === 1 ? "item vendido sem" : "itens vendidos sem"} preço de repasse no produto: contei o valor inteiro como repasse.
                        </p>
                      )}
                    </>
                  )}
                </div>

                {r.vendedor && (
                  <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                    <Button size="sm" variant="tertiary" onClick={() => abrirEdicao(r.vendedor!)}>
                      <Pencil size={14} />
                      Editar
                    </Button>
                  </div>
                )}
              </Card>
            );
          })}

          {semVenda.length > 0 && (
            <Card className="flex flex-col gap-2">
              <p className="text-small font-semibold text-foreground">Sem vendas neste mês</p>
              {semVenda.map((v) => (
                <div key={v.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 py-2 last:border-0">
                  <div className="min-w-0">
                    <p className="truncate text-small font-medium text-foreground">{v.nome}</p>
                    <p className="text-xs text-muted">
                      {ROTULO_MODELO[v.modelo]}
                      {v.meta_mensal ? ` · meta ${formatarMoeda(Number(v.meta_mensal))}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="tertiary" onClick={() => abrirEdicao(v)}>
                      <Pencil size={14} />
                    </Button>
                    {apagandoId === v.id ? (
                      <>
                        <Button size="sm" variant="tertiary" onClick={() => setApagandoId(null)}>
                          Não
                        </Button>
                        <Button size="sm" onClick={() => void apagar(v.id)} className="bg-red-500 shadow-none hover:bg-red-600">
                          Apagar
                        </Button>
                      </>
                    ) : (
                      <Button size="sm" variant="tertiary" aria-label="Apagar" onClick={() => setApagandoId(v.id)}>
                        <Trash2 size={14} />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </Card>
          )}
        </div>
      )}
    </Container>
  );
}
