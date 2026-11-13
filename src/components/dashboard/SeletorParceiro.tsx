"use client";

import * as React from "react";
import { Check, Search, UserPlus, X } from "lucide-react";
import { criarCliente } from "@/lib/data/clientes";
import { criarFornecedor } from "@/lib/data/fornecedores";
import { cn } from "@/lib/utils";

/**
 * Seletor de cliente/fornecedor com cadastro na hora (12/nov/2026, pedido do
 * usuário): em qualquer lugar que registra venda (produto, serviço,
 * orçamento, conta a receber), se a pessoa não estiver cadastrada aparece
 * "Cadastrar … como novo cliente" na própria lista, sem sair da tela.
 *
 * Campo de busca: digita parte do nome (ou do telefone) e escolhe. O mini
 * cadastro NÃO é um <form> (fica dentro do formulário da venda e form
 * aninhado é inválido); Enter nos campos dele salva o cadastro, não a venda.
 */

export interface ParceiroOpcao {
  id: string;
  nome: string;
  telefone?: string | null;
  email?: string | null;
}

type Tipo = "cliente" | "fornecedor";

const PALAVRA: Record<Tipo, { um: string; novo: string }> = {
  cliente: { um: "cliente", novo: "novo cliente" },
  fornecedor: { um: "fornecedor", novo: "novo fornecedor" },
};

const classeCampo =
  "h-11 w-full rounded-xl border border-border bg-card px-3 text-body text-foreground placeholder:text-muted focus:border-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-100";

function normalizar(texto: string) {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

function soDigitos(texto: string) {
  return texto.replace(/\D/g, "");
}

export interface SeletorParceiroProps<T extends ParceiroOpcao> {
  tipo?: Tipo;
  /** Conta mestre (negocio.usuarioId) — dona do cadastro novo. */
  contaMestreId: string;
  lista: T[];
  value: string;
  onChange: (id: string) => void;
  /** Recebe o cadastro novo (para a tela pôr na lista dela). */
  onCriado: (novo: T) => void;
  rotulo?: string;
  /** Mostra o aviso de que precisa escolher (ex.: venda fiada). */
  obrigatorio?: boolean;
  className?: string;
}

export function SeletorParceiro<T extends ParceiroOpcao>({
  tipo = "cliente",
  contaMestreId,
  lista,
  value,
  onChange,
  onCriado,
  rotulo,
  obrigatorio = false,
  className,
}: SeletorParceiroProps<T>) {
  const palavras = PALAVRA[tipo];
  const idBase = React.useId();
  const caixaRef = React.useRef<HTMLDivElement>(null);
  const buscaRef = React.useRef<HTMLInputElement>(null);

  const [aberto, setAberto] = React.useState(false);
  const [busca, setBusca] = React.useState("");
  const [destaque, setDestaque] = React.useState(0);

  const [cadastrando, setCadastrando] = React.useState(false);
  const [nome, setNome] = React.useState("");
  const [telefone, setTelefone] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [salvando, setSalvando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);

  const selecionado = lista.find((p) => p.id === value) ?? null;

  // "Trocar": assim que o campo de busca aparece, já fica pronto pra digitar.
  const querFocoRef = React.useRef(false);
  React.useEffect(() => {
    if (!selecionado && querFocoRef.current) {
      querFocoRef.current = false;
      buscaRef.current?.focus();
    }
  }, [selecionado]);

  const filtrados = React.useMemo(() => {
    const termo = normalizar(busca);
    const digitos = soDigitos(busca);
    const base = termo
      ? lista.filter(
          (p) =>
            normalizar(p.nome).includes(termo) ||
            (digitos.length >= 3 &&
              soDigitos(p.telefone ?? "").includes(digitos)),
        )
      : lista;
    return base.slice(0, 8);
  }, [busca, lista]);

  const nomeIgual = React.useMemo(() => {
    const termo = normalizar(busca);
    return termo ? lista.some((p) => normalizar(p.nome) === termo) : false;
  }, [busca, lista]);

  // Opções navegáveis por teclado: os encontrados + "cadastrar".
  const mostrarCadastrar = !nomeIgual;
  const totalOpcoes = filtrados.length + (mostrarCadastrar ? 1 : 0);

  React.useEffect(() => {
    if (!aberto) return;
    function fora(e: MouseEvent | TouchEvent) {
      if (caixaRef.current && !caixaRef.current.contains(e.target as Node))
        setAberto(false);
    }
    document.addEventListener("mousedown", fora);
    document.addEventListener("touchstart", fora);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("touchstart", fora);
    };
  }, [aberto]);

  function escolher(id: string) {
    onChange(id);
    setBusca("");
    setAberto(false);
  }

  function abrirCadastro() {
    const texto = busca.trim();
    // Digitou um telefone? Vai pro campo de telefone, não pro nome.
    if (
      texto &&
      soDigitos(texto).length >= 8 &&
      soDigitos(texto).length === texto.replace(/[\s()+-]/g, "").length
    ) {
      setNome("");
      setTelefone(texto);
    } else {
      setNome(texto);
      setTelefone("");
    }
    setEmail("");
    setErro(null);
    setCadastrando(true);
    setAberto(false);
  }

  async function salvarCadastro() {
    const nomeLimpo = nome.trim();
    if (!nomeLimpo) {
      setErro(`Escreva o nome do ${palavras.um}.`);
      return;
    }
    const repetido = lista.find(
      (p) => normalizar(p.nome) === normalizar(nomeLimpo),
    );
    if (repetido) {
      // Já existe com esse nome: só seleciona, sem duplicar.
      escolher(repetido.id);
      setCadastrando(false);
      return;
    }
    setSalvando(true);
    setErro(null);
    const resposta =
      tipo === "cliente"
        ? await criarCliente(
            contaMestreId,
            nomeLimpo,
            telefone.trim() || null,
            email.trim() || null,
          )
        : await criarFornecedor(
            contaMestreId,
            nomeLimpo,
            telefone.trim() || null,
            email.trim() || null,
          );
    setSalvando(false);
    if (resposta.error || !resposta.data) {
      console.error(`Erro ao cadastrar ${palavras.um}:`, resposta.error);
      setErro(
        `Não consegui cadastrar agora. Confira a internet e tente de novo.`,
      );
      return;
    }
    const novo = resposta.data as T;
    onCriado(novo);
    onChange(novo.id);
    setCadastrando(false);
    setBusca("");
  }

  function teclaBusca(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setAberto(true);
      setDestaque((d) => Math.min(d + 1, Math.max(totalOpcoes - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setDestaque((d) => Math.max(d - 1, 0));
    } else if (e.key === "Enter") {
      // Nunca deixa o Enter da busca enviar o formulário da venda.
      e.preventDefault();
      if (!aberto) {
        setAberto(true);
        return;
      }
      if (destaque < filtrados.length) escolher(filtrados[destaque].id);
      else if (mostrarCadastrar) abrirCadastro();
    } else if (e.key === "Escape") {
      setAberto(false);
    }
  }

  function teclaCadastro(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      void salvarCadastro();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setCadastrando(false);
    }
  }

  const rotuloFinal = rotulo ?? (tipo === "cliente" ? "Cliente" : "Fornecedor");
  const idLista = `${idBase}-lista`;

  return (
    <div
      ref={caixaRef}
      className={cn("relative flex min-w-0 flex-col gap-1.5", className)}
    >
      <span className="text-small font-medium text-foreground">
        {rotuloFinal}
      </span>

      {cadastrando ? (
        <div className="flex flex-col gap-2 rounded-xl border border-primary-200 bg-primary-50/40 p-3 dark:border-primary-800 dark:bg-primary-900/10">
          <p className="flex items-center gap-2 text-small font-semibold text-foreground">
            <UserPlus
              size={16}
              className="shrink-0 text-primary-700 dark:text-primary-300"
            />
            Cadastrar {palavras.novo}
          </p>
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            onKeyDown={teclaCadastro}
            placeholder="Nome"
            aria-label={`Nome do ${palavras.um}`}
            className={classeCampo}
            autoFocus={!nome}
          />
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
              onKeyDown={teclaCadastro}
              placeholder="WhatsApp / telefone (opcional)"
              aria-label="Telefone"
              inputMode="tel"
              className={classeCampo}
              autoFocus={!!nome}
            />
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={teclaCadastro}
              placeholder="E-mail (opcional)"
              aria-label="E-mail"
              inputMode="email"
              type="email"
              className={classeCampo}
            />
          </div>
          {tipo === "cliente" && (
            <p className="text-xs text-muted">
              Com o WhatsApp, o comprovante e a cobrança já vão direto pra ele.
            </p>
          )}
          {erro && (
            <p className="text-xs text-rose-700 dark:text-rose-300">{erro}</p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void salvarCadastro()}
              disabled={salvando}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-primary-700 px-4 text-sm font-semibold text-white hover:bg-primary-800 disabled:opacity-50"
            >
              <Check size={16} />
              {salvando ? "Salvando..." : `Salvar e usar`}
            </button>
            <button
              type="button"
              onClick={() => setCadastrando(false)}
              disabled={salvando}
              className="inline-flex h-10 items-center rounded-xl px-4 text-sm font-semibold text-muted hover:bg-border/40"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : selecionado ? (
        <div className="flex min-h-11 items-center gap-2 rounded-xl border border-border bg-card px-3 py-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-body font-medium text-foreground">
              {selecionado.nome}
            </p>
            {selecionado.telefone && (
              <p className="truncate text-xs text-muted">
                {selecionado.telefone}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              querFocoRef.current = true;
              onChange("");
              setAberto(true);
            }}
            className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-accent-700 hover:bg-accent-50 dark:text-accent-300 dark:hover:bg-accent-900/20"
          >
            Trocar
          </button>
          <button
            type="button"
            onClick={() => onChange("")}
            aria-label={`Tirar o ${palavras.um}`}
            className="shrink-0 rounded-lg p-1 text-muted hover:bg-border/40"
          >
            <X size={16} />
          </button>
        </div>
      ) : (
        <div>
          {/* Busca ocupa o espaço que sobrar e o botão "Novo cliente" fica
              sempre à vista, do lado (pedido do usuário em 13/nov/2026). */}
          <div className="flex min-w-0 items-stretch gap-2">
            <div className="relative min-w-0 flex-1">
              <Search
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
              />
              <input
                ref={buscaRef}
                value={busca}
                onChange={(e) => {
                  setBusca(e.target.value);
                  setDestaque(0);
                  setAberto(true);
                }}
                onFocus={() => setAberto(true)}
                onKeyDown={teclaBusca}
                placeholder={
                  lista.length > 0
                    ? `Buscar ${palavras.um}`
                    : `Nome do ${palavras.um}`
                }
                role="combobox"
                aria-expanded={aberto}
                aria-controls={idLista}
                aria-autocomplete="list"
                autoComplete="off"
                className={cn(classeCampo, "pl-9")}
              />
            </div>
            <button
              type="button"
              onClick={abrirCadastro}
              className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl border border-primary-200 bg-primary-50 px-3 text-sm font-semibold text-primary-800 hover:bg-primary-100 dark:border-primary-800 dark:bg-primary-900/20 dark:text-primary-200"
            >
              <UserPlus size={16} className="shrink-0" />
              <span className="hidden min-[380px]:inline">
                Novo {palavras.um}
              </span>
              <span className="min-[380px]:hidden">Novo</span>
            </button>
          </div>
          {aberto && (
            <ul
              id={idLista}
              role="listbox"
              className="mt-1 max-h-64 overflow-y-auto rounded-xl border border-border bg-card p-1 shadow-lg"
            >
              {filtrados.map((p, i) => (
                <li key={p.id} role="option" aria-selected={i === destaque}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => escolher(p.id)}
                    onMouseEnter={() => setDestaque(i)}
                    className={cn(
                      "flex w-full min-w-0 flex-col items-start rounded-lg px-3 py-2 text-left",
                      i === destaque
                        ? "bg-primary-50 dark:bg-primary-900/20"
                        : "hover:bg-border/30",
                    )}
                  >
                    <span className="w-full truncate text-body text-foreground">
                      {p.nome}
                    </span>
                    {p.telefone && (
                      <span className="w-full truncate text-xs text-muted">
                        {p.telefone}
                      </span>
                    )}
                  </button>
                </li>
              ))}
              {busca.trim() && filtrados.length === 0 && (
                <li className="px-3 py-2 text-xs text-muted">
                  Nenhum {palavras.um} com esse nome.
                </li>
              )}
              {mostrarCadastrar && (
                <li role="option" aria-selected={destaque === filtrados.length}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={abrirCadastro}
                    onMouseEnter={() => setDestaque(filtrados.length)}
                    className={cn(
                      "flex w-full min-w-0 items-center gap-2 rounded-lg px-3 py-2 text-left font-semibold text-primary-700 dark:text-primary-300",
                      destaque === filtrados.length
                        ? "bg-primary-50 dark:bg-primary-900/20"
                        : "hover:bg-border/30",
                    )}
                  >
                    <UserPlus size={16} className="shrink-0" />
                    <span className="min-w-0 break-words">
                      {busca.trim()
                        ? `Cadastrar “${busca.trim()}” como ${palavras.novo}`
                        : `Cadastrar ${palavras.novo}`}
                    </span>
                  </button>
                </li>
              )}
            </ul>
          )}
        </div>
      )}

      {obrigatorio && !value && !cadastrando && (
        <p className="text-xs text-amber-800 dark:text-amber-200">
          Escolha ou cadastre o {palavras.um} — fica no nome dele.
        </p>
      )}
      {!obrigatorio && !value && !cadastrando && !aberto && (
        <p className="text-xs text-muted">Opcional — pode deixar em branco.</p>
      )}
    </div>
  );
}
