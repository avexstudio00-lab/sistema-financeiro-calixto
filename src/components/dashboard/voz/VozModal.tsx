"use client";

import * as React from "react";
import { Mic, MicOff, X, Loader2, CheckCircle2, Trash2, Smartphone, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { DateMaskInput } from "@/components/ui/DateMaskInput";
import { useAuth } from "@/lib/auth/AuthProvider";
import { listarCategorias } from "@/lib/data/categorias";
import { listarContas, carteirasDoAmbiente } from "@/lib/data/contas";
import { listarProdutos } from "@/lib/data/produtos";
import { listarClientes } from "@/lib/data/clientes";
import { criarTransacao } from "@/lib/data/transacoes";
import { registrarVenda } from "@/lib/data/vendas";
import { listarAnotacoesPendentes, resolverAnotacao, registrarUsoMicrofone, type AnotacaoVoz } from "@/lib/data/voz";
import { interpretarFrase, type Interpretacao, type TipoAnotacao } from "@/lib/voz/interpretar";
import { formatarMoeda } from "@/lib/format";
import { ConfigurarSiri } from "./ConfigurarSiri";
import type { Categoria, Cliente, Conta, Produto, Transacao } from "@/lib/data/tipos";

type Forma = NonNullable<Transacao["forma_pagamento"]>;

interface Catalogos {
  categoriasPessoal: Categoria[];
  categoriasEmpresa: Categoria[];
  contasPessoal: Conta[];
  contasEmpresa: Conta[];
  produtos: Produto[];
  clientes: Cliente[];
}

/** Web Speech API (Chrome/Android e Safari). No app instalado do iPhone às
 * vezes não existe — aí fica o microfone do próprio teclado. */
interface Reconhecedor {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start: () => void;
  stop: () => void;
}
function criarReconhecedor(): Reconhecedor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Reconhecedor; webkitSpeechRecognition?: new () => Reconhecedor };
  const C = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return C ? new C() : null;
}

const num = (t: string) => {
  const v = Number(t.trim().replace(/\./g, "").replace(",", "."));
  return Number.isFinite(v) ? v : 0;
};
const paraInput = (v: number | null) => (v != null ? v.toFixed(2).replace(".", ",") : "");

const EXEMPLOS = ["gastei 35 no mercado", "paguei 120 de luz ontem", "recebi 200 do João", "vendi 2 corrente grumet 2mm por 80 pra Rosa", "gastei 50 na empresa com embalagem"];

/**
 * Comando de voz (23/nov/2026): fala → o app entende (leitor de frases, sem
 * IA) → mostra o que entendeu pra conferir → salva com o mesmo código das
 * telas de sempre. Também lista o que chegou pela Siri e ainda não foi
 * conferido, e tem a configuração do atalho da Siri.
 */
export function VozModal({ aberto, onFechar, onMudouPendentes }: { aberto: boolean; onFechar: () => void; onMudouPendentes?: (n: number) => void }) {
  const { user, perfil, negocio, podeAcessarMinhaEmpresa, papel } = useAuth();
  const [texto, setTexto] = React.useState("");
  const [ouvindo, setOuvindo] = React.useState(false);
  const [temMicrofone, setTemMicrofone] = React.useState(false);
  const reconhecedorRef = React.useRef<Reconhecedor | null>(null);
  const [catalogos, setCatalogos] = React.useState<Catalogos | null>(null);
  const [pendentes, setPendentes] = React.useState<AnotacaoVoz[]>([]);
  const [anotacaoAtual, setAnotacaoAtual] = React.useState<AnotacaoVoz | null>(null);
  const [verSiri, setVerSiri] = React.useState(false);

  // Formulário de conferência
  const [entendido, setEntendido] = React.useState<Interpretacao | null>(null);
  const [tipo, setTipo] = React.useState<TipoAnotacao>("gasto");
  const [mundo, setMundo] = React.useState<"pessoal" | "negocio">("pessoal");
  const [valor, setValor] = React.useState("");
  const [descricao, setDescricao] = React.useState("");
  const [categoriaId, setCategoriaId] = React.useState("");
  const [contaId, setContaId] = React.useState("");
  const [data, setData] = React.useState("");
  const [produtoId, setProdutoId] = React.useState("");
  const [quantidade, setQuantidade] = React.useState("1");
  const [clienteId, setClienteId] = React.useState("");
  const [forma, setForma] = React.useState<Forma>("pix");
  const [salvando, setSalvando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  const [sucesso, setSucesso] = React.useState<string | null>(null);

  const empresaLiberada = !!negocio && podeAcessarMinhaEmpresa;
  // Funcionário só vende (não lança gasto/recebimento da empresa).
  const soVenda = papel === "funcionario";

  const carregar = React.useCallback(async () => {
    if (!user) return;
    const [catP, contasP, pend] = await Promise.all([listarCategorias(user.id), listarContas(user.id), listarAnotacoesPendentes(user.id)]);
    let catE: Categoria[] = [];
    let contasE: Conta[] = [];
    let produtos: Produto[] = [];
    let clientes: Cliente[] = [];
    if (empresaLiberada && negocio) {
      [catE, contasE, produtos, clientes] = await Promise.all([
        listarCategorias(negocio.usuarioId),
        listarContas(negocio.usuarioId),
        listarProdutos(negocio.usuarioId),
        listarClientes(negocio.usuarioId),
      ]);
    }
    setCatalogos({ categoriasPessoal: catP, categoriasEmpresa: catE, contasPessoal: contasP, contasEmpresa: contasE, produtos, clientes });
    setPendentes(pend);
    onMudouPendentes?.(pend.length);
  }, [user, negocio, empresaLiberada, onMudouPendentes]);

  React.useEffect(() => {
    if (!aberto) return;
    setTemMicrofone(!!criarReconhecedor());
    setSucesso(null);
    void carregar();
  }, [aberto, carregar]);

  React.useEffect(() => () => reconhecedorRef.current?.stop(), []);

  // Esc fecha; e trava a rolagem da página de trás enquanto está aberto.
  React.useEffect(() => {
    if (!aberto) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") onFechar();
    };
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", aoTeclar);
    return () => {
      document.body.style.overflow = antes;
      window.removeEventListener("keydown", aoTeclar);
    };
  }, [aberto, onFechar]);

  function ouvir() {
    if (ouvindo) {
      reconhecedorRef.current?.stop();
      return;
    }
    const r = criarReconhecedor();
    if (!r) return;
    r.lang = "pt-BR";
    r.interimResults = true;
    r.continuous = false;
    let base = "";
    r.onresult = (e) => {
      let parcial = "";
      for (let i = 0; i < e.results.length; i++) parcial += e.results[i][0].transcript;
      setTexto((base + " " + parcial).trim());
    };
    r.onerror = (e) => {
      setOuvindo(false);
      if (e.error === "not-allowed") setErro("O navegador não deixou usar o microfone. Libere nas permissões ou use o microfone do teclado.");
    };
    r.onend = () => setOuvindo(false);
    base = "";
    setErro(null);
    setSucesso(null);
    setTexto("");
    reconhecedorRef.current = r;
    try {
      r.start();
      setOuvindo(true);
    } catch {
      setOuvindo(false);
    }
  }

  function contasDo(m: "pessoal" | "negocio"): Conta[] {
    if (!catalogos) return [];
    return m === "negocio" ? carteirasDoAmbiente(catalogos.contasEmpresa, "empresa") : carteirasDoAmbiente(catalogos.contasPessoal, "pessoal");
  }
  function categoriasDo(m: "pessoal" | "negocio", t: TipoAnotacao): Categoria[] {
    if (!catalogos) return [];
    const lista = m === "negocio" ? catalogos.categoriasEmpresa : catalogos.categoriasPessoal;
    return lista.filter((c) => c.tipo === (t === "receita" ? "receita" : "despesa"));
  }

  function entender(frase: string, anotacao: AnotacaoVoz | null = null) {
    if (!catalogos || !frase.trim()) return;
    const catalogo = {
      categorias: [...catalogos.categoriasPessoal, ...catalogos.categoriasEmpresa],
      contas: [...catalogos.contasPessoal, ...catalogos.contasEmpresa],
      produtos: catalogos.produtos,
      clientes: catalogos.clientes,
    };
    const i = interpretarFrase(frase, catalogo);
    let m = i.mundo;
    if (m === "negocio" && !empresaLiberada) m = "pessoal";
    let t = i.tipo;
    if (t === "venda" && !empresaLiberada) t = "receita";
    if (soVenda && empresaLiberada) {
      m = "negocio";
      t = "venda";
    }
    setAnotacaoAtual(anotacao);
    setEntendido(i);
    setTipo(t);
    setMundo(m);
    setValor(paraInput(i.valor));
    setDescricao(i.descricao);
    const cats = categoriasDo(m, t);
    setCategoriaId(i.categoriaId && cats.some((c) => c.id === i.categoriaId) ? i.categoriaId : "");
    const cs = contasDo(m);
    setContaId(i.contaId && cs.some((c) => c.id === i.contaId) ? i.contaId : cs[0]?.id ?? "");
    setData(i.data);
    setProdutoId(i.produtoId ?? "");
    setQuantidade(String(i.quantidade || 1));
    setClienteId(i.clienteId ?? "");
    setForma("pix");
    setErro(null);
    setSucesso(null);
  }

  function trocarMundo(m: "pessoal" | "negocio") {
    setMundo(m);
    const cs = contasDo(m);
    if (!cs.some((c) => c.id === contaId)) setContaId(cs[0]?.id ?? "");
    if (!categoriasDo(m, tipo).some((c) => c.id === categoriaId)) setCategoriaId("");
  }
  function trocarTipo(t: TipoAnotacao) {
    setTipo(t);
    if (t === "venda") trocarMundo("negocio");
    if (!categoriasDo(t === "venda" ? "negocio" : mundo, t).some((c) => c.id === categoriaId)) setCategoriaId("");
  }

  function limpar() {
    setEntendido(null);
    setAnotacaoAtual(null);
    setTexto("");
  }

  async function salvar() {
    if (!user) return;
    const v = num(valor);
    if (!(v > 0)) {
      setErro("Digite o valor.");
      return;
    }
    if (!data) {
      setErro("Escolha a data.");
      return;
    }
    setSalvando(true);
    setErro(null);
    let falhou: string | null = null;
    let resumo = "";
    if (tipo === "venda") {
      const produto = catalogos?.produtos.find((p) => p.id === produtoId) ?? null;
      const q = Math.max(1, Math.floor(num(quantidade)) || 1);
      if (!negocio || !produto) {
        falhou = "Escolha o produto vendido.";
      } else {
        const { error } = await registrarVenda({
          usuarioId: negocio.usuarioId,
          itens: [{ produto, quantidade: q, valorUnitario: Number((v / q).toFixed(2)) }],
          formaPagamento: forma,
          data,
          clienteId: clienteId || null,
          contaId: contaId || null,
          // Mesmo padrão da tela de Vendas: quem lançou vira "quem vendeu".
          vendedorNome: perfil?.nome?.trim() || null,
        });
        if (error) falhou = (error as { message?: string }).message ?? "Não foi possível salvar a venda.";
        resumo = `Venda de ${q > 1 ? `${q} ` : ""}${produto.nome} por ${formatarMoeda(v)} salva.`;
      }
    } else {
      const negocioLado = mundo === "negocio";
      const { error } = await criarTransacao({
        usuario_id: negocioLado && negocio ? negocio.usuarioId : user.id,
        conta_id: contaId || null,
        categoria_id: categoriaId || null,
        tipo: tipo === "receita" ? "receita" : "despesa",
        valor: Number(v.toFixed(2)),
        descricao: descricao.trim() || (tipo === "receita" ? "Recebimento" : "Gasto"),
        data,
        forma_pagamento: null,
        tipo_negocio: negocioLado ? "negocio" : "pessoal",
      });
      if (error) falhou = "Não foi possível salvar.";
      resumo = `${tipo === "receita" ? "Recebimento" : "Gasto"} de ${formatarMoeda(v)} salvo${negocioLado ? " na empresa" : ""}.`;
    }
    if (falhou) {
      setSalvando(false);
      setErro(falhou);
      return;
    }
    if (anotacaoAtual) {
      await resolverAnotacao(anotacaoAtual.id, "salva");
      const resto = pendentes.filter((p) => p.id !== anotacaoAtual.id);
      setPendentes(resto);
      onMudouPendentes?.(resto.length);
    } else {
      void registrarUsoMicrofone(user.id, texto || descricao);
    }
    setSalvando(false);
    setSucesso(resumo);
    limpar();
    // Avisa as telas abertas (painel, extrato...) pra recarregar.
    window.dispatchEvent(new Event("meucontrole:lancamento-salvo"));
  }

  async function descartar(a: AnotacaoVoz) {
    await resolverAnotacao(a.id, "descartada");
    const resto = pendentes.filter((p) => p.id !== a.id);
    setPendentes(resto);
    onMudouPendentes?.(resto.length);
    if (anotacaoAtual?.id === a.id) limpar();
  }

  if (!aberto) return null;
  const contas = contasDo(mundo);
  const cats = categoriasDo(mundo, tipo);
  const select = "h-11 w-full rounded-xl border border-border bg-card px-3 text-small text-foreground";

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-900/40 backdrop-blur-sm sm:items-center" onClick={onFechar}>
      {/* 23/nov/2026: no iPhone a janela ficava "presa" (o X sumia ao rolar).
          Agora o topo com o X fica fixo, tem "Fechar" no fim e respeita a
          área da barra de gestos. */}
      <div
        className="flex max-h-[88dvh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-card shadow-card-hover sm:rounded-3xl"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-h3 text-foreground">Anotar falando</h2>
          <button type="button" onClick={onFechar} aria-label="Fechar" className="flex h-11 w-11 items-center justify-center rounded-full bg-muted/10 text-foreground hover:bg-muted/20">
            <X size={22} />
          </button>
        </div>
        <div className="flex flex-col gap-4 overflow-y-auto px-5 py-4">

        {!catalogos ? (
          <Loader2 size={22} className="animate-spin self-center text-primary-700" />
        ) : !entendido ? (
          <>
            {sucesso && (
              <p className="flex items-center gap-2 rounded-xl bg-primary-50 px-3 py-2 text-small text-primary-800 dark:text-primary-200">
                <CheckCircle2 size={16} className="shrink-0" /> {sucesso}
              </p>
            )}

            {pendentes.length > 0 && (
              <div className="flex flex-col gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 dark:border-amber-700">
                <p className="text-small font-semibold text-amber-900 dark:text-amber-200">
                  {pendentes.length === 1 ? "1 anotação da Siri pra conferir" : `${pendentes.length} anotações da Siri pra conferir`}
                </p>
                {pendentes.map((a) => (
                  <div key={a.id} className="flex items-center justify-between gap-2 rounded-lg bg-card px-2.5 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-small text-foreground">&ldquo;{a.texto}&rdquo;</p>
                      <p className="text-xs text-muted">{new Date(a.criado_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button size="sm" onClick={() => entender(a.texto, a)}>
                        Conferir
                      </Button>
                      <button type="button" onClick={() => void descartar(a)} aria-label="Descartar" className="flex h-9 w-9 items-center justify-center rounded-lg text-rose-700 hover:bg-rose-50">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-col items-center gap-3">
              {temMicrofone && (
                <button
                  type="button"
                  onClick={ouvir}
                  aria-label={ouvindo ? "Parar de ouvir" : "Falar"}
                  className={`flex h-20 w-20 items-center justify-center rounded-full text-white shadow-soft transition-all ${ouvindo ? "animate-pulse bg-rose-600" : "bg-primary-700 hover:bg-primary-800"}`}
                >
                  {ouvindo ? <MicOff size={32} /> : <Mic size={32} />}
                </button>
              )}
              <p className="text-center text-xs text-muted">
                {ouvindo
                  ? "Ouvindo… fale devagar e espere terminar."
                  : temMicrofone
                    ? "Toque no microfone e fale. Ou escreva/dite abaixo."
                    : "Toque no campo abaixo e use o microfone do teclado pra ditar."}
              </p>
            </div>

            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={2}
              placeholder="Ex.: gastei 35 no mercado"
              className="w-full rounded-xl border border-border bg-card px-3 py-2 text-body text-foreground focus:border-primary-500 focus:outline-none"
            />
            <Button disabled={!texto.trim() || ouvindo} onClick={() => entender(texto)}>
              Entender
            </Button>
            {erro && <p className="text-small text-rose-700 dark:text-rose-300">{erro}</p>}

            <div className="rounded-xl bg-muted/5 px-3 py-2 text-xs text-muted">
              <p className="mb-1 font-semibold text-foreground">Fale assim (curto e devagar):</p>
              <ul className="flex flex-col gap-0.5">
                {EXEMPLOS.filter((e) => empresaLiberada || !/vendi|empresa/.test(e)).map((e) => (
                  <li key={e}>&ldquo;{e}&rdquo;</li>
                ))}
              </ul>
              <p className="mt-1">Sempre: o que fez (gastei, recebi, vendi) + o valor + onde/o quê. Antes de salvar você confere.</p>
            </div>

            <button type="button" onClick={() => setVerSiri((v) => !v)} className="flex items-center justify-between rounded-xl border border-border px-3 py-2.5 text-left text-small font-medium text-foreground hover:bg-muted/5">
              <span className="flex items-center gap-2">
                <Smartphone size={16} className="text-primary-700" /> Usar com a Siri (iPhone)
              </span>
              <ChevronDown size={16} className={verSiri ? "rotate-180 transition-transform" : "transition-transform"} />
            </button>
            {verSiri && <ConfigurarSiri />}
          </>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="rounded-xl bg-muted/5 px-3 py-2 text-xs text-muted">
              Você disse: <span className="text-foreground">&ldquo;{anotacaoAtual?.texto ?? texto}&rdquo;</span>
              <br />
              Confira e corrija o que precisar.
            </p>

            <div className="flex gap-1.5 rounded-xl bg-muted/10 p-1">
              {(
                [
                  ["gasto", "Gasto"],
                  ["receita", "Recebimento"],
                  ["venda", "Venda"],
                ] as const
              )
                .filter(([t]) => (t === "venda" ? empresaLiberada : !soVenda))
                .map(([t, rotulo]) => (
                  <button key={t} type="button" onClick={() => trocarTipo(t)} className={`flex-1 rounded-lg px-2 py-1.5 text-small font-medium ${tipo === t ? "bg-card text-primary-700 shadow-sm" : "text-muted"}`}>
                    {rotulo}
                  </button>
                ))}
            </div>

            {tipo !== "venda" && empresaLiberada && !soVenda && (
              <div className="flex gap-1.5 rounded-xl bg-muted/10 p-1">
                {(
                  [
                    ["pessoal", "Minha vida"],
                    ["negocio", "Empresa"],
                  ] as const
                ).map(([m, rotulo]) => (
                  <button key={m} type="button" onClick={() => trocarMundo(m)} className={`flex-1 rounded-lg px-2 py-1.5 text-small font-medium ${mundo === m ? "bg-card text-accent-700 shadow-sm" : "text-muted"}`}>
                    {rotulo}
                  </button>
                ))}
              </div>
            )}

            {tipo === "venda" ? (
              <>
                <label className="flex flex-col gap-1 text-small font-medium text-foreground">
                  Produto
                  <select value={produtoId} onChange={(e) => setProdutoId(e.target.value)} className={select}>
                    <option value="">{entendido.produtoFalado ? `Não achei "${entendido.produtoFalado}" — escolha` : "Escolha o produto"}</option>
                    {catalogos.produtos
                      .filter((p) => p.ativo || p.id === produtoId)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nome}
                        </option>
                      ))}
                  </select>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Quantidade" inputMode="numeric" value={quantidade} onChange={(e) => setQuantidade(e.target.value)} />
                  <Input label="Total (R$)" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" />
                </div>
                <label className="flex flex-col gap-1 text-small font-medium text-foreground">
                  Cliente (opcional)
                  <select value={clienteId} onChange={(e) => setClienteId(e.target.value)} className={select}>
                    <option value="">{entendido.clienteFalado && !entendido.clienteId ? `Não achei "${entendido.clienteFalado}" — sem cliente` : "Sem cliente"}</option>
                    {catalogos.clientes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-small font-medium text-foreground">
                  Recebeu como
                  <select value={forma} onChange={(e) => setForma(e.target.value as Forma)} className={select}>
                    <option value="pix">Pix</option>
                    <option value="dinheiro">Dinheiro</option>
                    <option value="debito">Débito</option>
                    <option value="credito">Crédito</option>
                  </select>
                </label>
              </>
            ) : (
              <>
                <Input label="Valor (R$)" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" />
                <Input label="Descrição" value={descricao} onChange={(e) => setDescricao(e.target.value)} />
                <label className="flex flex-col gap-1 text-small font-medium text-foreground">
                  Categoria
                  <select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} className={select}>
                    <option value="">Sem categoria</option>
                    {cats.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}

            <label className="flex flex-col gap-1 text-small font-medium text-foreground">
              Carteira
              <select value={contaId} onChange={(e) => setContaId(e.target.value)} className={select}>
                <option value="">Sem carteira</option>
                {contas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </label>
            <DateMaskInput label="Data" value={data} onChange={setData} />

            {erro && <p className="text-small text-rose-700 dark:text-rose-300">{erro}</p>}
            <div className="flex gap-2">
              <Button className="flex-1" disabled={salvando} onClick={() => void salvar()}>
                {salvando ? "Salvando..." : "Salvar"}
              </Button>
              <Button variant="tertiary" disabled={salvando} onClick={limpar}>
                Voltar
              </Button>
            </div>
          </div>
        )}
        <Button variant="tertiary" className="w-full" onClick={onFechar}>
          Fechar
        </Button>
        </div>
      </div>
    </div>
  );
}
