"use client";

import * as React from "react";
import { X, Plus, Sparkles, Trash2, Home, Building2, CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { DateMaskInput } from "@/components/ui/DateMaskInput";
import { CriarCategoriaInline } from "@/components/dashboard/CriarCategoriaInline";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth/AuthProvider";
import { listarCategorias } from "@/lib/data/categorias";
import { listarContas } from "@/lib/data/contas";
import { listarDividasComProgresso } from "@/lib/data/dividas";
import {
  criarTransacao,
  atualizarTransacao,
  deletarTransacao,
  listarDescricoesUsadas,
  type DescricaoUsada,
} from "@/lib/data/transacoes";
import { adicionarNaFila } from "@/lib/offline/fila";
import { salvarDadosFormOffline, lerDadosFormOffline } from "@/lib/offline/dadosFormOffline";
import { useOnlineStatus } from "@/lib/offline/useOnlineStatus";
import { formatarMoeda } from "@/lib/format";
import type { Categoria, Conta, DividaComProgresso, Transacao } from "@/lib/data/tipos";

/** Nome exato da categoria padrão "Dívida" (ver seção do contexto do
 * projeto sobre dívidas, 17/set/2026) — comparado por nome porque
 * categorias padrão não têm nenhum campo de "tipo especial", só nome. */
const NOME_CATEGORIA_DIVIDA = "Dívida";

const FORMAS_PAGAMENTO = [
  { id: "pix", label: "Pix" },
  { id: "debito", label: "Débito" },
  { id: "credito", label: "Crédito" },
  { id: "dinheiro", label: "Dinheiro" },
  { id: "boleto", label: "Boleto" },
] as const;

export interface NovaTransacaoModalProps {
  aberto: boolean;
  onFechar: () => void;
  onSalvo: () => void;
  bloqueado?: boolean;
  transacaoEditando?: Transacao | null;
  /** Mundo em que o modal foi aberto ("Minha vida" ou "Minha empresa") — o
   * valor de `tipo_negocio` gravado é sempre o do mundo atual, sem depender
   * de o usuário escolher manualmente (pra não misturar pessoal e negócio
   * na mesma tela). Só chega "negocio" aqui vindo de uma tela que já passou
   * pela guarda de acesso (empresa/layout.tsx), então não precisa checar
   * tipo de perfil de novo. */
  mundo?: "pessoal" | "negocio";
  /** Categoria já marcada quando o modal abre pra uma anotação nova (ex: um
   * atalho de "Registrar retirada de pró-labore" já abre com a categoria
   * certa escolhida). Ignorado ao editar uma anotação existente. */
  categoriaIdInicial?: string;
}

export function NovaTransacaoModal({
  aberto,
  onFechar,
  onSalvo,
  bloqueado,
  transacaoEditando,
  mundo = "pessoal",
  categoriaIdInicial,
}: NovaTransacaoModalProps) {
  const { user, negocio } = useAuth();
  const online = useOnlineStatus();
  // Quem abre esse modal já passou pela guarda de acesso da tela que o
  // renderiza (empresa/layout.tsx só deixa entrar em mundo="negocio" quem
  // está no plano Avançado/Grupo, seja qual for o tipo de perfil) — então o
  // gate de "pode marcar como negócio" aqui é só o mundo atual, não mais o
  // tipo de perfil.
  const podeMarcarNegocio = mundo === "negocio";
  const editando = !!transacaoEditando;

  // Em mundo "negocio", os dados (categorias, carteiras, anotação em si)
  // pertencem à conta mestre — pra funcionar tanto pro dono quanto pra
  // quem foi convidado (sócio), nunca usar `user.id` puro aqui, senão a
  // anotação de um sócio ficaria órfã, gravada sob o próprio id dele em
  // vez de cair no negócio compartilhado. Em mundo "pessoal", é sempre o
  // próprio id de quem está logado — nunca o da conta mestre.
  const usuarioEfetivoId = mundo === "negocio" ? negocio?.usuarioId : user?.id;

  const [categorias, setCategorias] = React.useState<Categoria[]>([]);
  const [contas, setContas] = React.useState<Conta[]>([]);
  const [dividas, setDividas] = React.useState<DividaComProgresso[]>([]);
  const [descricoesUsadas, setDescricoesUsadas] = React.useState<DescricaoUsada[]>([]);
  const [tipo, setTipo] = React.useState<"receita" | "despesa">("despesa");
  const [valor, setValor] = React.useState("");
  const [descricao, setDescricao] = React.useState("");
  const [categoriaId, setCategoriaId] = React.useState("");
  const [dividaId, setDividaId] = React.useState("");
  const [contaId, setContaId] = React.useState("");
  const [data, setData] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [mostrarVencimento, setMostrarVencimento] = React.useState(false);
  const [dataVencimento, setDataVencimento] = React.useState("");
  const [formaPagamento, setFormaPagamento] =
    React.useState<(typeof FORMAS_PAGAMENTO)[number]["id"]>("pix");
  const [tipoNegocio, setTipoNegocio] = React.useState<"pessoal" | "negocio">("pessoal");
  const [salvando, setSalvando] = React.useState(false);
  const [excluindo, setExcluindo] = React.useState(false);
  const [confirmandoExclusao, setConfirmandoExclusao] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!aberto || !usuarioEfetivoId) return;

    // Sem internet: não adianta tentar buscar (ficaria pendurado ou
    // voltaria vazio) -- usa o último retrato de categorias/contas salvo
    // (ver src/lib/offline/dadosFormOffline.ts), pra ainda dar pra escolher
    // categoria e conta e anotar mesmo assim.
    if (!navigator.onLine) {
      const cache = lerDadosFormOffline(usuarioEfetivoId);
      if (cache) {
        setCategorias(cache.categorias);
        setContas(cache.contas);
        if (!transacaoEditando && cache.contas[0]) setContaId(cache.contas[0].id);
      }
      return;
    }

    Promise.all([listarCategorias(usuarioEfetivoId), listarContas(usuarioEfetivoId)]).then(
      ([listaCategorias, listaContas]) => {
        setCategorias(listaCategorias);
        setContas(listaContas);
        if (!transacaoEditando && listaContas[0]) setContaId(listaContas[0].id);
        // Guarda o retrato mais recente pra próxima vez que o modal precisar
        // abrir sem internet.
        salvarDadosFormOffline(usuarioEfetivoId, listaCategorias, listaContas);
      }
    );
    listarDescricoesUsadas(usuarioEfetivoId).then(setDescricoesUsadas);
    // Dívidas são um conceito só de "Minha vida" (mesma regra "pessoal é
    // pessoal" de metas/contas fixas) -- não busca em mundo "negocio", onde
    // a categoria "Dívida" nem aparece como opção (ver filtro mais abaixo).
    // Busca todas (não só as em aberto) -- ao editar uma anotação antiga
    // que já aponta pra uma dívida já quitada, ela precisa continuar
    // aparecendo na lista pra não sumir do seletor (ver filtro no render).
    if (mundo === "pessoal") {
      listarDividasComProgresso(usuarioEfetivoId).then(setDividas);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, usuarioEfetivoId]);

  const sugestoesDescricao = React.useMemo(
    () => descricoesUsadas.filter((d) => d.tipo === tipo).map((d) => d.descricao),
    [descricoesUsadas, tipo]
  );

  // Só mostra o seletor "Qual dívida?" quando a categoria escolhida é
  // mesmo a "Dívida" -- em mundo "negocio" essa categoria nem aparece como
  // opção (ver filtro dos chips mais abaixo), então isso nunca fica true lá.
  const categoriaEhDivida = React.useMemo(() => {
    const cat = categorias.find((c) => c.id === categoriaId);
    return cat?.nome === NOME_CATEGORIA_DIVIDA;
  }, [categorias, categoriaId]);

  // Em mundo "negocio" a categoria "Dívida" não aparece nem como opção --
  // dívida é conceito só de "Minha vida" (ver nota acima em `dividas`).
  const categoriasDoTipo = React.useMemo(
    () =>
      categorias.filter((c) => c.tipo === tipo && (mundo === "pessoal" || c.nome !== NOME_CATEGORIA_DIVIDA)),
    [categorias, tipo, mundo]
  );

  // Ao editar, a dívida ligada à anotação pode já estar quitada (some da
  // lista "em aberto" das outras telas) -- ainda assim precisa aparecer
  // aqui, senão o seletor mostraria um valor selecionado que não existe
  // nas opções.
  const dividasSelecionaveis = React.useMemo(
    () => dividas.filter((d) => !d.quitada || d.id === dividaId),
    [dividas, dividaId]
  );

  React.useEffect(() => {
    if (aberto && transacaoEditando) {
      setTipo(transacaoEditando.tipo);
      setValor(String(transacaoEditando.valor).replace(".", ","));
      setDescricao(transacaoEditando.descricao ?? "");
      setCategoriaId(transacaoEditando.categoria_id ?? "");
      setDividaId(transacaoEditando.divida_id ?? "");
      setContaId(transacaoEditando.conta_id ?? "");
      setData(transacaoEditando.data);
      setDataVencimento(transacaoEditando.data_vencimento ?? "");
      setMostrarVencimento(!!transacaoEditando.data_vencimento);
      setFormaPagamento(
        (transacaoEditando.forma_pagamento as (typeof FORMAS_PAGAMENTO)[number]["id"]) ?? "pix"
      );
      setTipoNegocio(transacaoEditando.tipo_negocio === "negocio" ? "negocio" : "pessoal");
    }
  }, [aberto, transacaoEditando]);

  React.useEffect(() => {
    if (!aberto) {
      setValor("");
      setDescricao("");
      setCategoriaId(categoriaIdInicial ?? "");
      setDividaId("");
      setContaId("");
      setErro(null);
      setTipo("despesa");
      setData(new Date().toISOString().slice(0, 10));
      setDataVencimento("");
      setMostrarVencimento(false);
      setFormaPagamento("pix");
      setTipoNegocio(mundo);
      setConfirmandoExclusao(false);
    }
  }, [aberto, mundo, categoriaIdInicial]);

  if (!aberto) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!usuarioEfetivoId) return;

    const valorNumero = Number(valor.replace(",", "."));
    if (!valorNumero || valorNumero <= 0) {
      setErro("Digite um valor válido.");
      return;
    }
    if (!descricao.trim()) {
      setErro("Digite uma descrição rápida.");
      return;
    }

    const semInternet = typeof navigator !== "undefined" && !navigator.onLine;

    // Editar uma anotação existente depende do valor antigo dela pra
    // desfazer o efeito no saldo da conta antes de aplicar o novo (ver
    // atualizarTransacao em src/lib/data/transacoes.ts) -- arriscado demais
    // pra fazer "às cegas" sem internet, então só a criação de anotação
    // nova pode ser guardada na fila offline (ver fila.ts).
    if (editando && semInternet) {
      setErro("Sem internet agora — editar uma anotação só funciona com conexão. Tente de novo quando reconectar.");
      return;
    }

    setErro(null);
    setSalvando(true);
    const dados = {
      usuario_id: usuarioEfetivoId,
      conta_id: contaId || null,
      categoria_id: categoriaId || null,
      tipo,
      valor: valorNumero,
      descricao: descricao.trim(),
      data,
      forma_pagamento: formaPagamento,
      tipo_negocio: podeMarcarNegocio ? tipoNegocio : "pessoal",
      divida_id: categoriaEhDivida ? dividaId || null : null,
      data_vencimento: mostrarVencimento ? dataVencimento || null : null,
    };

    if (semInternet) {
      // Não tem edição aqui (bloqueada acima) -- só sobra criar anotação
      // nova, que é seguro guardar numa fila local e enviar de verdade
      // depois, em ordem, quando a internet voltar (ver fila.ts e
      // sincronizarFila.ts).
      adicionarNaFila(dados);
      setSalvando(false);
      onSalvo();
      onFechar();
      return;
    }

    const { error } = transacaoEditando
      ? await atualizarTransacao(transacaoEditando, dados)
      : await criarTransacao(dados);
    setSalvando(false);

    if (error) {
      setErro("Não foi possível salvar. Tente novamente.");
      return;
    }
    onSalvo();
    onFechar();
  }

  async function handleExcluir() {
    if (!transacaoEditando) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setErro("Sem internet agora — apagar uma anotação só funciona com conexão. Tente de novo quando reconectar.");
      return;
    }
    setExcluindo(true);
    const { error } = await deletarTransacao(transacaoEditando);
    setExcluindo(false);

    if (error) {
      setErro("Não foi possível apagar. Tente novamente.");
      return;
    }
    onSalvo();
    onFechar();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 backdrop-blur-sm sm:items-center">
      <div className="flex max-h-[90vh] w-full max-w-md flex-col overflow-y-auto rounded-t-3xl bg-card p-6 shadow-card-hover sm:rounded-3xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-h3 text-foreground">{editando ? "Editar anotação" : "Nova anotação"}</h2>
          <button
            type="button"
            onClick={onFechar}
            aria-label="Fechar"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-muted/10"
          >
            <X size={20} />
          </button>
        </div>

        {confirmandoExclusao ? (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-red-500">
              <Trash2 size={26} />
            </span>
            <p className="text-body text-foreground">
              Apagar &ldquo;{transacaoEditando?.descricao}&rdquo;? O saldo da conta é ajustado
              automaticamente. Essa ação não pode ser desfeita.
            </p>
            <div className="flex w-full gap-2">
              <Button
                variant="tertiary"
                onClick={() => setConfirmandoExclusao(false)}
                disabled={excluindo}
                className="flex-1"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleExcluir}
                disabled={excluindo}
                className="flex-1 bg-red-500 shadow-none hover:bg-red-600 active:bg-red-700"
              >
                {excluindo ? "Apagando..." : "Sim, apagar"}
              </Button>
            </div>
            {erro && <p className="text-small text-rose-600">{erro}</p>}
          </div>
        ) : bloqueado ? (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary-600">
              <Sparkles size={26} />
            </span>
            <p className="text-body text-foreground">
              Você já usou suas 30 anotações grátis deste mês. Assine um plano pago para anotar
              sem limites.
            </p>
            <Button onClick={onFechar} className="w-full">
              Entendi
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setTipo("despesa")}
                className={cn(
                  "flex-1 rounded-xl border-2 py-2.5 text-small font-semibold transition-all",
                  tipo === "despesa" ? "border-rose-400 bg-rose-50 text-rose-600" : "border-border text-muted"
                )}
              >
                Saída
              </button>
              <button
                type="button"
                onClick={() => setTipo("receita")}
                className={cn(
                  "flex-1 rounded-xl border-2 py-2.5 text-small font-semibold transition-all",
                  tipo === "receita"
                    ? "border-primary-400 bg-primary-50 text-primary-700"
                    : "border-border text-muted"
                )}
              >
                Entrada
              </button>
            </div>

            <Input
              label="Valor"
              inputMode="decimal"
              autoFocus
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder="0,00"
            />
            <Input
              label="Descrição"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Ex: Mercado, Uber, Salário..."
              list="sugestoes-descricao"
              autoComplete="off"
            />
            <datalist id="sugestoes-descricao">
              {sugestoesDescricao.map((d) => (
                <option key={d} value={d} />
              ))}
            </datalist>

            {usuarioEfetivoId && (
              <div className="flex flex-col gap-1.5">
                <span className="text-small font-medium text-foreground">Categoria</span>
                <div className="flex flex-wrap gap-2">
                  {categoriasDoTipo.map((c) => (
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
                  {/* Botão "+" pra criar uma categoria personalizada sem sair
                      do modal (pedido do usuário, 22/set/2026) — a categoria
                      nova já nasce selecionada. */}
                  <CriarCategoriaInline
                    usuarioId={usuarioEfetivoId}
                    tipo={tipo}
                    onCriada={(nova) => {
                      setCategorias((atual) => [...atual, nova]);
                      setCategoriaId(nova.id);
                    }}
                  />
                </div>
              </div>
            )}

            {categoriaEhDivida && (
              <div className="flex flex-col gap-1.5">
                <span className="text-small font-medium text-foreground">Qual dívida?</span>
                {dividasSelecionaveis.length === 0 ? (
                  <p className="text-small text-muted">
                    Você ainda não cadastrou nenhuma dívida. Cadastre uma na tela{" "}
                    <strong className="text-foreground">Dívidas</strong> pra esse pagamento contar
                    automaticamente pra lá.
                  </p>
                ) : (
                  <select
                    value={dividaId}
                    onChange={(e) => setDividaId(e.target.value)}
                    className="h-11 rounded-xl border border-border bg-card px-3 text-body text-foreground focus:border-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-100"
                  >
                    <option value="">Não ligar a nenhuma dívida específica</option>
                    {dividasSelecionaveis.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.nome} — falta {formatarMoeda(d.valor_restante)}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Data"
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
              />
              <div className="flex flex-col gap-1.5">
                <span className="text-small font-medium text-foreground">Forma de pagamento</span>
                <select
                  value={formaPagamento}
                  onChange={(e) => setFormaPagamento(e.target.value as typeof formaPagamento)}
                  className="h-11 rounded-xl border border-border bg-card px-3 text-body text-foreground focus:border-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-100"
                >
                  {FORMAS_PAGAMENTO.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Vencimento é opcional e separado da data do lançamento (ver
                comentário em Transacao.data_vencimento, tipos.ts) — ex: um
                gasto anotado hoje que só vence mês que vem. Fica escondido
                atrás de um botão pra não poluir o formulário na maioria das
                anotações, que não têm vencimento nenhum. */}
            {mostrarVencimento ? (
              <DateMaskInput
                label="Data de vencimento (opcional)"
                value={dataVencimento}
                onChange={setDataVencimento}
                helperText="O lançamento continua registrado na data acima — isso é só pra lembrar quando vence."
              />
            ) : (
              <button
                type="button"
                onClick={() => setMostrarVencimento(true)}
                className="flex items-center gap-1.5 self-start text-small font-medium text-muted hover:text-foreground"
              >
                <CalendarClock size={15} />
                Adicionar data de vencimento
              </button>
            )}

            {contas.length > 1 && (
              <div className="flex flex-col gap-1.5">
                <span className="text-small font-medium text-foreground">Conta</span>
                <select
                  value={contaId}
                  onChange={(e) => setContaId(e.target.value)}
                  className="h-11 rounded-xl border border-border bg-card px-3 text-body text-foreground focus:border-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-100"
                >
                  {contas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {podeMarcarNegocio && (
              <div
                className={cn(
                  "flex items-center gap-2 rounded-xl px-3 py-2 text-small font-medium",
                  tipoNegocio === "negocio" ? "bg-accent-50 text-accent-700" : "bg-primary-50 text-primary-700"
                )}
              >
                {tipoNegocio === "negocio" ? <Building2 size={16} /> : <Home size={16} />}
                {tipoNegocio === "negocio" ? "Anotando como gasto/receita do negócio" : "Anotando como gasto/receita pessoal"}
              </div>
            )}

            {!editando && !online && (
              <p className="text-small text-muted">
                Sem internet agora — sua anotação fica guardada no aparelho e é enviada sozinha assim que a
                conexão voltar.
              </p>
            )}

            {erro && <p className="text-small text-rose-600">{erro}</p>}

            <Button type="submit" size="lg" disabled={salvando} className="mt-1 w-full">
              {salvando ? "Salvando..." : editando ? "Salvar alterações" : "Salvar anotação"}
              {!salvando && <Plus size={18} />}
            </Button>
            {editando && (
              <button
                type="button"
                onClick={() => setConfirmandoExclusao(true)}
                className="flex items-center justify-center gap-2 py-1 text-small font-medium text-red-500 hover:text-red-600"
              >
                <Trash2 size={16} />
                Apagar essa anotação
              </button>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
