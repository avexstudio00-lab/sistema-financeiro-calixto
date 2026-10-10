"use client";

import * as React from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { criarServico, atualizarServico } from "@/lib/data/servicos";
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

const OPCOES_PRECO: { id: ModoPreco; rotulo: string }[] = [
  { id: "fixo", rotulo: "Preço fixo" },
  { id: "a_partir", rotulo: "A partir de" },
  { id: "faixa", rotulo: "Faixa de preço" },
  { id: "consulta", rotulo: "Sob consulta" },
];

/**
 * Formulário de cadastro/edição de serviço — o MESMO usado no Catálogo de
 * serviços, na Venda e no Orçamento (itens 6.1/12.1/12.5 da especificação de
 * 09/out/2026: cadastrar sem sair da tela da venda e já vincular).
 */
export function FormularioServico({
  contaMestreId,
  servico,
  onSalvo,
  onCancelar,
  compacto = false,
  nomeInicial = "",
}: {
  contaMestreId: string;
  servico?: Servico | null;
  onSalvo: (s: Servico) => void;
  onCancelar: () => void;
  compacto?: boolean;
  nomeInicial?: string;
}) {
  const [form, setForm] = React.useState<FormServico>(() => (servico ? formDoServico(servico) : { ...FORM_VAZIO, nome: nomeInicial }));
  const [salvando, setSalvando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();
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
    setErro(null);
    if (servico) {
      const { error } = await atualizarServico(servico.id, dados);
      setSalvando(false);
      if (error) return setErro("Não foi possível salvar. Tente de novo.");
      onSalvo({ ...servico, ...dados, nome: dados.nome.trim() } as Servico);
      return;
    }
    const { data, error } = await criarServico({ ...dados, usuario_id: contaMestreId });
    setSalvando(false);
    if (error || !data) return setErro("Não foi possível salvar. Tente de novo.");
    onSalvo(data as Servico);
  }

  return (
    <Card padding={compacto ? "md" : "lg"} className={cn("flex flex-col gap-4", compacto && "border border-primary-200")}>
      <h2 className={compacto ? "text-body font-semibold text-foreground" : "text-h3 text-foreground"}>{servico ? "Editar serviço" : "Novo serviço"}</h2>
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
            {OPCOES_PRECO.map((o) => (
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
          <Button type="button" variant="tertiary" onClick={onCancelar}>Cancelar</Button>
        </div>
      </form>
    </Card>
  );
}
