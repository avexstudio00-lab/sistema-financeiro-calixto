"use client";

import * as React from "react";
import { Plus, Wrench, Pencil, Trash2, Clock, Hash } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { useAuth } from "@/lib/auth/AuthProvider";
import { listarServicos, criarServico, atualizarServico, removerServico, rotuloPrecoServico } from "@/lib/data/servicos";
import { cn } from "@/lib/utils";
import type { Servico } from "@/lib/data/tipos";

type ModoPreco = "fixo" | "a_partir" | "faixa" | "consulta";

interface FormServico {
  nome: string;
  descricao: string;
  codigo: string;
  tempo: string;
  modoPreco: ModoPreco;
  preco: string;
  precoMax: string;
  custo: string;
}

const FORM_VAZIO: FormServico = { nome: "", descricao: "", codigo: "", tempo: "", modoPreco: "fixo", preco: "", precoMax: "", custo: "" };

function parsear(texto: string): number | null {
  if (!texto.trim()) return null;
  const n = Number(texto.trim().replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : NaN;
}

function brl(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Lê de volta o "modo" a partir do que está salvo (texto de referência). */
function formDoServico(s: Servico): FormServico {
  let modoPreco: ModoPreco = "fixo";
  if (!s.preco_fixo) {
    const ref = s.referencia_preco ?? "";
    modoPreco = /^a partir/i.test(ref) ? "a_partir" : /R\$.*\sa\s.*R\$/.test(ref) ? "faixa" : "consulta";
  }
  const numeros = (s.referencia_preco ?? "").match(/[\d.]+,\d{2}/g) ?? [];
  return {
    nome: s.nome,
    descricao: s.descricao ?? "",
    codigo: s.codigo ?? "",
    tempo: s.tempo_estimado ?? "",
    modoPreco,
    preco: s.preco_fixo && s.preco != null ? String(s.preco).replace(".", ",") : numeros[0] ?? "",
    precoMax: numeros[1] ?? "",
    custo: s.custo != null ? String(s.custo).replace(".", ",") : "",
  };
}

/**
 * Catálogo de serviços (itens 5.6 e 5.7 da especificação de 03/out/2026).
 * Serviço não tem estoque: só nome, código interno, tempo estimado e preço —
 * que pode ser fixo ou só uma "base de orçamento" (a partir de, faixa ou sob
 * consulta), com o valor final definido no orçamento de cada cliente.
 */
export default function ServicosPage() {
  const { negocio } = useAuth();
  const [servicos, setServicos] = React.useState<Servico[]>([]);
  const [carregando, setCarregando] = React.useState(true);
  const [formAberto, setFormAberto] = React.useState(false);
  const [editandoId, setEditandoId] = React.useState<string | null>(null);
  const [form, setForm] = React.useState<FormServico>(FORM_VAZIO);
  const [salvando, setSalvando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  const [confirmandoRemocao, setConfirmandoRemocao] = React.useState<string | null>(null);

  const carregar = React.useCallback(async () => {
    if (!negocio) return;
    setCarregando(true);
    setServicos(await listarServicos(negocio.usuarioId));
    setCarregando(false);
  }, [negocio]);

  React.useEffect(() => {
    carregar();
  }, [carregar]);

  function abrirNovo() {
    setEditandoId(null);
    setForm(FORM_VAZIO);
    setErro(null);
    setFormAberto(true);
  }

  function abrirEdicao(s: Servico) {
    setEditandoId(s.id);
    setForm(formDoServico(s));
    setErro(null);
    setFormAberto(true);
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!negocio) return;
    if (form.nome.trim().length < 2) return setErro("Dê um nome ao serviço.");
    const preco = parsear(form.preco);
    const precoMax = parsear(form.precoMax);
    const custo = parsear(form.custo);
    if (Number.isNaN(preco) || Number.isNaN(precoMax) || Number.isNaN(custo)) return setErro("Confira os valores digitados.");
    if (form.modoPreco === "fixo" && (preco == null || preco <= 0)) return setErro("Informe o preço do serviço.");
    if (form.modoPreco === "a_partir" && (preco == null || preco <= 0)) return setErro("Informe o valor mínimo.");
    if (form.modoPreco === "faixa" && (preco == null || precoMax == null || precoMax < preco)) return setErro("Informe a faixa (mínimo e máximo).");

    let referencia: string | null = null;
    if (form.modoPreco === "a_partir" && preco != null) referencia = `A partir de ${brl(preco)}`;
    if (form.modoPreco === "faixa" && preco != null && precoMax != null) referencia = `${brl(preco)} a ${brl(precoMax)}`;
    if (form.modoPreco === "consulta") referencia = "Sob consulta";

    const dados = {
      nome: form.nome,
      descricao: form.descricao,
      codigo: form.codigo,
      tempo_estimado: form.tempo,
      preco_fixo: form.modoPreco === "fixo",
      preco: form.modoPreco === "fixo" ? preco : null,
      custo,
      referencia_preco: referencia,
    };
    setSalvando(true);
    const { error } = editandoId
      ? await atualizarServico(editandoId, dados)
      : await criarServico({ ...dados, usuario_id: negocio.usuarioId });
    setSalvando(false);
    if (error) return setErro("Não foi possível salvar. Tente de novo.");
    setFormAberto(false);
    carregar();
  }

  async function remover(id: string) {
    await removerServico(id);
    setConfirmandoRemocao(null);
    carregar();
  }

  const opcoesPreco: { id: ModoPreco; rotulo: string }[] = [
    { id: "fixo", rotulo: "Preço fixo" },
    { id: "a_partir", rotulo: "A partir de" },
    { id: "faixa", rotulo: "Faixa de preço" },
    { id: "consulta", rotulo: "Sob consulta" },
  ];

  return (
    <Container full className="flex flex-col gap-8 py-8">
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div>
          <h1 className="text-h2 text-foreground">Catálogo de serviços</h1>
          <p className="text-body text-muted">O que sua empresa faz — sem estoque, com preço fixo ou só uma base pra orçar.</p>
        </div>
        <Button onClick={abrirNovo}>
          <Plus size={18} />
          Novo serviço
        </Button>
      </div>

      {formAberto && (
        <Card padding="lg" className="flex flex-col gap-4">
          <h2 className="text-h3 text-foreground">{editandoId ? "Editar serviço" : "Novo serviço"}</h2>
          <form onSubmit={salvar} className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Nome do serviço" value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} placeholder="Ex: Criação de site" autoFocus />
              <Input label="Código interno (opcional)" value={form.codigo} onChange={(e) => setForm((f) => ({ ...f, codigo: e.target.value }))} placeholder="Ex: SRV-001" />
            </div>
            <Input label="Descrição (opcional)" value={form.descricao} onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))} />
            <Input label="Tempo estimado de execução (opcional)" value={form.tempo} onChange={(e) => setForm((f) => ({ ...f, tempo: e.target.value }))} placeholder="Ex: 2 horas, 15 dias" />

            <div className="flex flex-col gap-2">
              <span className="text-small font-medium text-foreground">Base de orçamento / preço de referência</span>
              <div className="flex flex-wrap gap-2">
                {opcoesPreco.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, modoPreco: o.id }))}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-small font-semibold",
                      form.modoPreco === o.id ? "border-primary-500 bg-primary-50 text-primary-700" : "border-border text-foreground"
                    )}
                  >
                    {o.rotulo}
                  </button>
                ))}
              </div>
            </div>
            {form.modoPreco !== "consulta" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label={form.modoPreco === "fixo" ? "Preço" : form.modoPreco === "a_partir" ? "A partir de" : "Mínimo"}
                  inputMode="decimal"
                  value={form.preco}
                  onChange={(e) => setForm((f) => ({ ...f, preco: e.target.value }))}
                  placeholder="0,00"
                />
                {form.modoPreco === "faixa" && (
                  <Input label="Máximo" inputMode="decimal" value={form.precoMax} onChange={(e) => setForm((f) => ({ ...f, precoMax: e.target.value }))} placeholder="0,00" />
                )}
              </div>
            )}
            {form.modoPreco !== "fixo" && (
              <p className="text-small text-foreground">O valor exato é definido no orçamento de cada cliente (aba Orçamentos).</p>
            )}
            <Input
              label="Custo direto (opcional)"
              inputMode="decimal"
              value={form.custo}
              onChange={(e) => setForm((f) => ({ ...f, custo: e.target.value }))}
              helperText="Usado pra calcular a margem de lucro do serviço."
            />
            {erro && <p className="text-small text-rose-700">{erro}</p>}
            <div className="flex gap-2">
              <Button type="submit" disabled={salvando} className="flex-1">{salvando ? "Salvando..." : "Salvar"}</Button>
              <Button type="button" variant="tertiary" onClick={() => setFormAberto(false)}>Cancelar</Button>
            </div>
          </form>
        </Card>
      )}

      {carregando ? (
        <p className="py-8 text-center text-body text-muted">Carregando...</p>
      ) : servicos.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 py-12 text-center">
          <Wrench size={28} className="text-accent-700" />
          <p className="text-body text-muted">Nenhum serviço cadastrado ainda. Ex: &quot;Consultoria — a partir de R$ 500&quot;.</p>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {servicos.map((s) => (
            <Card key={s.id} className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-body font-semibold text-foreground">{s.nome}</p>
                  {s.descricao && <p className="text-small text-muted">{s.descricao}</p>}
                </div>
                <p className="shrink-0 text-body font-semibold text-foreground">{rotuloPrecoServico(s)}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {s.codigo && (
                  <Badge variant="neutral" size="sm">
                    <Hash size={12} />
                    {s.codigo}
                  </Badge>
                )}
                {s.tempo_estimado && (
                  <Badge variant="neutral" size="sm">
                    <Clock size={12} />
                    {s.tempo_estimado}
                  </Badge>
                )}
                {!s.preco_fixo && <Badge variant="accent" size="sm">Base de orçamento</Badge>}
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="tertiary" onClick={() => abrirEdicao(s)}>
                  <Pencil size={14} />
                  Editar
                </Button>
                {confirmandoRemocao === s.id ? (
                  <>
                    <Button size="sm" variant="tertiary" onClick={() => setConfirmandoRemocao(null)}>Não</Button>
                    <Button size="sm" onClick={() => remover(s.id)} className="bg-red-500 shadow-none hover:bg-red-600">Remover</Button>
                  </>
                ) : (
                  <Button size="sm" variant="tertiary" onClick={() => setConfirmandoRemocao(s.id)}>
                    <Trash2 size={14} />
                    Remover
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </Container>
  );
}
