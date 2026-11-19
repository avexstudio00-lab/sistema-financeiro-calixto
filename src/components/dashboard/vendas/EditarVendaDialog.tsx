"use client";

import * as React from "react";
import { Loader2, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { DateMaskInput } from "@/components/ui/DateMaskInput";
import { formatarMoeda } from "@/lib/format";
import { arredondar2, gerarParcelasFiado, somaParcelas, somarMeses } from "@/lib/util/fiado";
import {
  carregarDetalhesVenda,
  editarVenda,
  jaRecebidoDoFiado,
  totalDaEdicao,
  validarEdicaoVenda,
  type DetalhesVenda,
  type EdicaoVenda,
  type FormaVenda,
} from "@/lib/data/editarVenda";
import type { Cliente, Conta, Venda, Vendedor } from "@/lib/data/tipos";

const FORMAS: { id: FormaVenda; label: string }[] = [
  { id: "pix", label: "Pix" },
  { id: "debito", label: "Débito" },
  { id: "credito", label: "Crédito" },
  { id: "dinheiro", label: "Dinheiro" },
  { id: "boleto", label: "Boleto" },
];

const CLASSE_SELECT =
  "h-11 w-full min-w-0 rounded-xl border border-border bg-card px-3 text-body text-foreground focus:border-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-100";

/** "1.234,56" / "1234,56" / "1234.56" → número (NaN se inválido). */
function lerNumero(texto: string): number {
  const t = texto.trim();
  if (!t) return NaN;
  const n = t.includes(",") ? Number(t.replace(/\./g, "").replace(",", ".")) : Number(t);
  return Number.isFinite(n) ? n : NaN;
}
const paraTexto = (v: number) => (Number.isFinite(v) ? v.toFixed(2).replace(".", ",") : "");
const dataBr = (iso: string) => {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
};

interface ItemForm {
  id: string;
  nome: string;
  quantidade: string;
  valorUnitario: string;
}
interface ParcelaForm {
  chave: string;
  vencimento: string;
  valor: string;
}
interface PagamentoForm {
  forma: FormaVenda;
  valor: string;
  contaId: string;
}

let contadorChave = 0;
const novaChave = () => `p${++contadorChave}`;

/**
 * Ver e editar uma venda já registrada (19/nov/2026). Abre ao tocar na venda
 * na lista. A gravação (e o ajuste de caixa, parcelas e estoque) fica em
 * src/lib/data/editarVenda.ts.
 */
export function EditarVendaDialog({
  venda,
  clientes,
  contas,
  vendedores,
  onFechar,
  onSalvo,
}: {
  venda: Venda;
  clientes: Cliente[];
  contas: Conta[];
  vendedores: Vendedor[];
  onFechar: () => void;
  onSalvo: (aviso: string | null) => void;
}) {
  const [detalhes, setDetalhes] = React.useState<DetalhesVenda | null>(null);
  const [erroCarga, setErroCarga] = React.useState<string | null>(null);
  const [salvando, setSalvando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);

  const [data, setData] = React.useState(venda.data);
  const [clienteId, setClienteId] = React.useState(venda.cliente_id ?? "");
  const [vendedor, setVendedor] = React.useState(venda.vendedor_nome ?? "");
  const [itens, setItens] = React.useState<ItemForm[]>([]);
  const [forma, setForma] = React.useState<FormaVenda>("pix");
  const [contaId, setContaId] = React.useState("");
  const [pagamentos, setPagamentos] = React.useState<PagamentoForm[]>([]);
  const [acrescimo, setAcrescimo] = React.useState("");
  const [entrada, setEntrada] = React.useState("");
  const [parcelas, setParcelas] = React.useState<ParcelaForm[]>([]);
  // Texto do "Nº de parcelas" enquanto a pessoa digita (null = mostra a contagem atual).
  const [numeroParcelasTexto, setNumeroParcelasTexto] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelado = false;
    carregarDetalhesVenda(venda).then(({ data: d, error }) => {
      if (cancelado) return;
      if (error || !d) {
        setErroCarga(error?.message ?? "Não consegui abrir essa venda.");
        return;
      }
      const principal = d.linhas[0];
      setDetalhes(d);
      setData(principal.data);
      setClienteId(principal.cliente_id ?? "");
      setVendedor(principal.vendedor_nome ?? "");
      setItens(
        d.linhas.map((l) => ({
          id: l.id,
          nome: l.produto_nome,
          quantidade: String(l.quantidade),
          valorUnitario: paraTexto(Number(l.valor_unitario)),
        }))
      );
      setForma((d.transacaoCaixa?.forma_pagamento ?? principal.forma_pagamento ?? "pix") as FormaVenda);
      setContaId(d.transacaoCaixa?.conta_id ?? "");
      setPagamentos(
        (principal.pagamentos ?? []).map((p) => ({
          forma: p.forma as FormaVenda,
          valor: paraTexto(Number(p.valor)),
          contaId: p.contaId ?? "",
        }))
      );
      setAcrescimo(Number(principal.acrescimo ?? 0) > 0 ? paraTexto(Number(principal.acrescimo)) : "");
      setEntrada(d.transacaoCaixa ? paraTexto(Number(d.transacaoCaixa.valor)) : "");
      setParcelas(
        d.titulos
          .filter((t) => t.status !== "recebido")
          .map((t) => ({ chave: novaChave(), vencimento: t.vencimento, valor: paraTexto(Number(t.valor)) }))
      );
    });
    return () => {
      cancelado = true;
    };
  }, [venda]);

  // Fecha com Esc (mesmo padrão dos outros diálogos).
  React.useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !salvando) onFechar();
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [onFechar, salvando]);

  function montarEdicao(): EdicaoVenda | null {
    if (!detalhes) return null;
    return {
      data,
      clienteId: clienteId || null,
      vendedorNome: vendedor || null,
      itens: itens.map((i) => ({ id: i.id, quantidade: Number(i.quantidade), valorUnitario: lerNumero(i.valorUnitario) })),
      ...(detalhes.tipo === "avista" ? { formaPagamento: forma, contaId: contaId || null } : {}),
      ...(detalhes.tipo === "dividida"
        ? { pagamentos: pagamentos.map((p) => ({ forma: p.forma, valor: lerNumero(p.valor), contaId: p.contaId || null })) }
        : {}),
      ...(detalhes.tipo === "fiado"
        ? {
            acrescimo: acrescimo.trim() ? lerNumero(acrescimo) : 0,
            // Campo vazio = não mexe na entrada (só "0" digitado remove).
            entradaValor: detalhes.transacaoCaixa && entrada.trim() ? lerNumero(entrada) : undefined,
            parcelasPendentes: parcelas.map((p) => ({ vencimento: p.vencimento, valor: lerNumero(p.valor) })),
          }
        : {}),
    };
  }

  const edicao = montarEdicao();
  const totalNovo = detalhes && edicao ? totalDaEdicao(detalhes, edicao) : 0;
  const totalAntigo = detalhes ? arredondar2(detalhes.linhas.reduce((a, l) => a + Number(l.valor_total), 0)) : 0;
  const recebido = detalhes ? jaRecebidoDoFiado(detalhes) : 0;
  const entradaNum =
    detalhes?.transacaoCaixa && detalhes.tipo === "fiado" ? (entrada.trim() ? lerNumero(entrada) : Number(detalhes.transacaoCaixa.valor)) : 0;
  const faltaReceber = arredondar2(totalNovo - recebido - (Number.isFinite(entradaNum) ? entradaNum : 0));
  const somaPendentes = somaParcelas(parcelas.map((p) => ({ vencimento: p.vencimento, valor: lerNumero(p.valor) })));
  const somaPagamentos = arredondar2(pagamentos.reduce((a, p) => a + (Number.isFinite(lerNumero(p.valor)) ? lerNumero(p.valor) : 0), 0));
  const temTaxa = !!detalhes?.linhas[0].taxa_transacao_id;

  function redistribuirParcelas(quantidade: number) {
    const n = Math.max(1, Math.min(48, Math.floor(quantidade) || 1));
    const primeiro = parcelas[0]?.vencimento && parcelas[0].vencimento >= data ? parcelas[0].vencimento : somarMeses(data, 1);
    const geradas = gerarParcelasFiado(Math.max(0, faltaReceber), n, primeiro, "mensal");
    setParcelas(geradas.map((p) => ({ chave: novaChave(), vencimento: p.vencimento, valor: paraTexto(p.valor) })));
    setNumeroParcelasTexto(null);
  }

  function aplicarNumeroParcelas() {
    if (numeroParcelasTexto === null) return;
    const n = Number(numeroParcelasTexto);
    if (n >= 1 && n !== parcelas.length) redistribuirParcelas(n);
    else setNumeroParcelasTexto(null);
  }

  const travaRef = React.useRef(false);

  async function salvar() {
    if (!detalhes || !edicao || travaRef.current) return;
    const problema = validarEdicaoVenda(detalhes, edicao);
    if (problema) {
      setErro(problema);
      return;
    }
    setErro(null);
    setSalvando(true);
    travaRef.current = true;
    const { error, estoqueInsuficiente } = await editarVenda(detalhes, edicao);
    travaRef.current = false;
    setSalvando(false);
    if (error) {
      setErro(error.message);
      return;
    }
    onSalvo(
      estoqueInsuficiente && estoqueInsuficiente.length > 0
        ? `Venda atualizada. Atenção: o estoque não tinha tudo de ${estoqueInsuficiente.join(", ")} — ficou zerado.`
        : null
    );
  }

  // Vendedor gravado que não está mais no cadastro continua na lista.
  const nomesVendedores = Array.from(new Set([...vendedores.filter((v) => v.ativo).map((v) => v.nome), ...(vendedor ? [vendedor] : [])]));

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true" aria-label="Editar venda">
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col gap-4 overflow-y-auto overflow-x-hidden rounded-t-3xl bg-card p-5 shadow-card-hover sm:rounded-3xl">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-h3 text-foreground">Editar venda</h2>
            <p className="text-small text-muted">Mude o que precisar; caixa, parcelas e estoque acompanham.</p>
          </div>
          <button
            type="button"
            onClick={onFechar}
            disabled={salvando}
            aria-label="Fechar"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-muted/10 hover:text-foreground"
          >
            <X size={18} />
          </button>
        </div>

        {erroCarga ? (
          <p className="rounded-xl bg-rose-50 px-3 py-2 text-small text-rose-700 dark:bg-rose-900/20 dark:text-rose-200">{erroCarga}</p>
        ) : !detalhes ? (
          <p className="flex items-center gap-2 py-8 text-small text-muted">
            <Loader2 size={16} className="animate-spin" /> Abrindo a venda...
          </p>
        ) : (
          <>
            {/* Itens */}
            <div className="flex flex-col gap-2">
              <p className="text-small font-semibold text-foreground">Itens</p>
              {itens.map((item, i) => {
                const q = Number(item.quantidade);
                const vu = lerNumero(item.valorUnitario);
                const subtotal = Number.isFinite(q) && Number.isFinite(vu) ? arredondar2(q * vu) : 0;
                return (
                  <div key={item.id} className="flex flex-col gap-2 rounded-xl border border-border p-3">
                    <p className="break-words text-small font-medium text-foreground">{item.nome}</p>
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        label="Quantidade"
                        inputMode="numeric"
                        value={item.quantidade}
                        onChange={(e) => setItens((l) => l.map((x, j) => (j === i ? { ...x, quantidade: e.target.value.replace(/\D/g, "") } : x)))}
                      />
                      <Input
                        label="Valor unitário"
                        inputMode="decimal"
                        value={item.valorUnitario}
                        onChange={(e) => setItens((l) => l.map((x, j) => (j === i ? { ...x, valorUnitario: e.target.value } : x)))}
                      />
                    </div>
                    <p className="text-xs text-muted">Subtotal: {formatarMoeda(subtotal)}</p>
                  </div>
                );
              })}
              {itens.length > 1 && <p className="text-xs text-muted">Pra incluir ou tirar um item, apague a venda e registre de novo.</p>}
            </div>

            {/* Dados gerais */}
            <div className="grid gap-3 sm:grid-cols-2">
              <DateMaskInput label="Data da venda" value={data} onChange={(v) => setData(v)} />
              <div className="flex flex-col gap-1.5">
                <span className="text-small font-medium text-foreground">Cliente{detalhes.tipo === "fiado" ? "" : " (opcional)"}</span>
                <select value={clienteId} onChange={(e) => setClienteId(e.target.value)} className={CLASSE_SELECT} aria-label="Cliente">
                  {detalhes.tipo !== "fiado" ? <option value="">Sem cliente</option> : <option value="" disabled>Escolha o cliente</option>}
                  {clienteId && !clientes.some((c) => c.id === clienteId) && <option value={clienteId}>{venda.clientes?.nome ?? "Cliente da venda"}</option>}
                  {clientes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </select>
              </div>
              {(nomesVendedores.length > 0 || vendedor) && (
                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <span className="text-small font-medium text-foreground">Quem vendeu</span>
                  <select value={vendedor} onChange={(e) => setVendedor(e.target.value)} className={CLASSE_SELECT} aria-label="Quem vendeu">
                    <option value="">Não informado</option>
                    {nomesVendedores.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Pagamento */}
            {detalhes.tipo === "avista" && (
              <div className="flex flex-col gap-3 rounded-xl bg-muted/5 p-3">
                <p className="text-small font-semibold text-foreground">Pagamento à vista</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <span className="text-small font-medium text-foreground">Forma</span>
                    <select value={forma} onChange={(e) => setForma(e.target.value as FormaVenda)} className={CLASSE_SELECT} aria-label="Forma de pagamento">
                      {FORMAS.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <span className="text-small font-medium text-foreground">Carteira</span>
                    <select value={contaId} onChange={(e) => setContaId(e.target.value)} className={CLASSE_SELECT} aria-label="Carteira">
                      <option value="">Nenhuma</option>
                      {contaId && !contas.some((c) => c.id === contaId) && <option value={contaId}>Carteira atual</option>}
                      {contas.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nome}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                {temTaxa && (
                  <p className="text-xs text-muted">
                    {forma === "debito" || forma === "credito"
                      ? "A taxa da maquininha é recalculada na mesma proporção do novo total."
                      : "Como não é mais cartão, a taxa da maquininha desta venda será removida."}
                  </p>
                )}
              </div>
            )}

            {detalhes.tipo === "dividida" && (
              <div className="flex flex-col gap-3 rounded-xl bg-muted/5 p-3">
                <p className="text-small font-semibold text-foreground">Formas de pagamento</p>
                {pagamentos.map((p, i) => (
                  <div key={i} className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    <select
                      value={p.forma}
                      onChange={(e) => setPagamentos((l) => l.map((x, j) => (j === i ? { ...x, forma: e.target.value as FormaVenda } : x)))}
                      className={CLASSE_SELECT}
                      aria-label={`Forma ${i + 1}`}
                    >
                      {FORMAS.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                    <Input
                      aria-label={`Valor da forma ${i + 1}`}
                      inputMode="decimal"
                      value={p.valor}
                      onChange={(e) => setPagamentos((l) => l.map((x, j) => (j === i ? { ...x, valor: e.target.value } : x)))}
                    />
                    <select
                      value={p.contaId}
                      onChange={(e) => setPagamentos((l) => l.map((x, j) => (j === i ? { ...x, contaId: e.target.value } : x)))}
                      className={`${CLASSE_SELECT} col-span-2 sm:col-span-1`}
                      aria-label={`Carteira da forma ${i + 1}`}
                    >
                      <option value="">Nenhuma</option>
                      {p.contaId && !contas.some((c) => c.id === p.contaId) && <option value={p.contaId}>Carteira atual</option>}
                      {contas.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nome}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
                <p className={`text-xs ${Math.abs(somaPagamentos - totalNovo) < 0.01 ? "text-muted" : "text-amber-700 dark:text-amber-300"}`}>
                  Soma das formas: {formatarMoeda(somaPagamentos)} de {formatarMoeda(totalNovo)}
                </p>
              </div>
            )}

            {detalhes.tipo === "fiado" && (
              <div className="flex flex-col gap-3 rounded-xl bg-muted/5 p-3">
                <p className="text-small font-semibold text-foreground">Fiado (a prazo)</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input label="Acréscimo combinado" inputMode="decimal" placeholder="0,00" value={acrescimo} onChange={(e) => setAcrescimo(e.target.value)} />
                  {detalhes.transacaoCaixa && (
                    <Input label="Entrada paga" inputMode="decimal" value={entrada} onChange={(e) => setEntrada(e.target.value)} helperText="Digite 0 pra tirar a entrada do caixa." />
                  )}
                </div>

                {detalhes.titulos.some((t) => t.status === "recebido") && (
                  <div className="flex flex-col gap-1">
                    <p className="text-xs font-semibold text-muted">Já recebidas (não mudam)</p>
                    {detalhes.titulos
                      .filter((t) => t.status === "recebido")
                      .map((t) => (
                        <p key={t.id} className="flex flex-wrap justify-between gap-2 text-small text-muted">
                          <span>Venc. {dataBr(t.vencimento)}</span>
                          <span className="font-medium">{formatarMoeda(Number(t.valor))}</span>
                        </p>
                      ))}
                  </div>
                )}

                <div className="flex flex-wrap items-end gap-2">
                  <div className="w-32">
                    <Input
                      label="Nº de parcelas"
                      inputMode="numeric"
                      value={numeroParcelasTexto ?? String(parcelas.length)}
                      onChange={(e) => setNumeroParcelasTexto(e.target.value.replace(/\D/g, "").slice(0, 2))}
                      onBlur={aplicarNumeroParcelas}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          aplicarNumeroParcelas();
                        }
                      }}
                    />
                  </div>
                  <Button type="button" size="sm" variant="tertiary" onClick={() => redistribuirParcelas(Number(numeroParcelasTexto) || parcelas.length || 1)}>
                    Dividir igual
                  </Button>
                </div>

                {parcelas.map((p, i) => (
                  <div key={p.chave} className="flex flex-col gap-2 rounded-xl border border-border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-muted">Parcela {recebido > 0 ? `pendente ${i + 1}` : i + 1}</p>
                      <button
                        type="button"
                        aria-label={`Remover parcela ${i + 1}`}
                        onClick={() => setParcelas((l) => l.filter((_, j) => j !== i))}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-rose-50 hover:text-red-500"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <DateMaskInput
                        label="Vencimento"
                        value={p.vencimento}
                        onChange={(v) => setParcelas((l) => l.map((x, j) => (j === i ? { ...x, vencimento: v } : x)))}
                      />
                      <Input
                        label="Valor"
                        inputMode="decimal"
                        value={p.valor}
                        onChange={(e) => setParcelas((l) => l.map((x, j) => (j === i ? { ...x, valor: e.target.value } : x)))}
                      />
                    </div>
                  </div>
                ))}
                <Button
                  type="button"
                  size="sm"
                  variant="tertiary"
                  className="self-start"
                  onClick={() =>
                    setParcelas((l) => [
                      ...l,
                      { chave: novaChave(), vencimento: somarMeses(l[l.length - 1]?.vencimento ?? data, 1), valor: "" },
                    ])
                  }
                >
                  <Plus size={15} /> Adicionar parcela
                </Button>
                <p className={`text-xs ${Math.abs(somaPendentes - Math.max(0, faltaReceber)) < 0.01 ? "text-muted" : "text-amber-700 dark:text-amber-300"}`}>
                  Parcelas pendentes: {formatarMoeda(somaPendentes)} · falta receber {formatarMoeda(Math.max(0, faltaReceber))}
                </p>
              </div>
            )}

            {detalhes.tipo === "sem_caixa" && (
              <p className="rounded-xl bg-muted/5 p-3 text-xs text-muted">
                Esta venda não tem lançamento no caixa ligado (por exemplo, veio de um orçamento). Mudar o valor aqui não mexe em Contas a receber.
              </p>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
              <p className="text-small text-muted">Total</p>
              <p className="text-h3 text-foreground">
                {Number.isFinite(totalNovo) ? formatarMoeda(totalNovo) : "—"}
                {Math.abs(totalNovo - totalAntigo) >= 0.01 && <span className="ml-2 text-xs font-normal text-muted line-through">{formatarMoeda(totalAntigo)}</span>}
              </p>
            </div>

            {erro && <p className="rounded-xl bg-rose-50 px-3 py-2 text-small text-rose-700 dark:bg-rose-900/20 dark:text-rose-200">{erro}</p>}

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="tertiary" onClick={onFechar} disabled={salvando}>
                Cancelar
              </Button>
              <Button type="button" onClick={salvar} disabled={salvando}>
                {salvando ? <Loader2 size={16} className="animate-spin" /> : null}
                Salvar alterações
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
