"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Download, X } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/auth/AuthProvider";
import { listarContas } from "@/lib/data/contas";
import {
  buscarExistentesParaDuplicidade,
  carregarContextoExtrato,
  importarExtratoInteligente,
  resolverCategorias,
  sugerirExtrato,
  type SugestaoExtrato,
} from "@/lib/data/importar";
import { carteirasDoAmbiente } from "@/lib/data/contas";
import { lerOfx, ofxParaCsv, pareceOfx } from "@/lib/util/ofx";
import { classificarLancamento, chaveDescricao, desmarcadoPorPadrao, type Classificacao } from "@/lib/util/classificarExtrato";
import type { Categoria } from "@/lib/data/tipos";
import {
  ErroArquivo,
  MODELO_CSV,
  analisarEstrutura,
  decodificarArquivo,
  interpretarLinhas,
  marcarDuplicadas,
  descricoesParecidas,
  validarArquivoAntesDeLer,
  type CampoCanonico,
  type Estrutura,
} from "@/lib/util/csvImportacao";
import type { Conta } from "@/lib/data/tipos";
import { AreaUpload } from "./AreaUpload";
import { MapeamentoColunas } from "./MapeamentoColunas";
import { ConferenciaImportacao } from "./ConferenciaImportacao";
import { ResultadoImportacao, type ResumoResultado } from "./ResultadoImportacao";
import { baixarCsv } from "./baixarCsv";

type Etapa = "upload" | "mapear" | "conferir" | "resultado";

function lerBytes(arquivo: File): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(new Uint8Array(leitor.result as ArrayBuffer));
    leitor.onerror = () => reject(new ErroArquivo("Não foi possível ler o arquivo."));
    leitor.readAsArrayBuffer(arquivo);
  });
}

/**
 * Importação de CSV (especificação de 05/out/2026): upload → prévia e
 * mapeamento → conferência (com duplicadas desmarcadas) → resultado.
 * Nada é gravado antes do "Confirmar e importar".
 */
export function ImportadorCsv({ mundoInicial = "pessoal" }: { mundoInicial?: "pessoal" | "negocio" }) {
  const router = useRouter();
  const { user, negocio, podeAcessarMinhaEmpresa } = useAuth();
  const [etapa, setEtapa] = React.useState<Etapa>("upload");
  const [lendo, setLendo] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  const [incompativel, setIncompativel] = React.useState(false);
  const [nomeArquivo, setNomeArquivo] = React.useState("");
  const [estrutura, setEstrutura] = React.useState<Estrutura | null>(null);
  const [mapeamento, setMapeamento] = React.useState<CampoCanonico[]>([]);
  const [inverterSinal, setInverterSinal] = React.useState(false);
  const [tipoNegocio, setTipoNegocio] = React.useState<"pessoal" | "negocio">(mundoInicial === "negocio" && podeAcessarMinhaEmpresa ? "negocio" : "pessoal");
  const [contas, setContas] = React.useState<Conta[]>([]);
  const [contaId, setContaId] = React.useState("");
  const [criarCategorias, setCriarCategorias] = React.useState(false);
  const [verificando, setVerificando] = React.useState(false);
  const [duplicadas, setDuplicadas] = React.useState<Set<number>>(new Set());
  const [selecionados, setSelecionados] = React.useState<Set<number>>(new Set());
  const [importando, setImportando] = React.useState(false);
  const [resultado, setResultado] = React.useState<ResumoResultado | null>(null);
  // 09/nov/2026: leitura inteligente do extrato.
  const [ehCartaoArquivo, setEhCartaoArquivo] = React.useState(false);
  const [classificacoes, setClassificacoes] = React.useState<Classificacao[]>([]);
  const [sugestoes, setSugestoes] = React.useState<SugestaoExtrato[]>([]);
  const [categorias, setCategorias] = React.useState<Categoria[]>([]);

  // Negócio grava na conta mestre (mesmo padrão da NovaTransacaoModal).
  const usuarioEfetivoId = tipoNegocio === "negocio" ? negocio?.usuarioId ?? null : user?.id ?? null;

  React.useEffect(() => {
    if (!usuarioEfetivoId) return;
    listarContas(usuarioEfetivoId).then((todas) => {
      // Carteiras da empresa no "Negócio", pessoais no "Pessoal".
      const lista = carteirasDoAmbiente(todas, tipoNegocio === "negocio" ? "empresa" : "pessoal");
      setContas(lista);
      setContaId((atual) => (lista.some((c) => c.id === atual) ? atual : lista.find((c) => c.tipo !== "cartao_credito")?.id ?? ""));
    });
  }, [usuarioEfetivoId, tipoNegocio]);

  const interpretacao = React.useMemo(
    () => (estrutura ? interpretarLinhas(estrutura, mapeamento, { inverterSinal }) : { validos: [], rejeitados: [], totalReceitas: 0, totalDespesas: 0 }),
    [estrutura, mapeamento, inverterSinal]
  );

  function reiniciar() {
    setEtapa("upload");
    setErro(null);
    setNomeArquivo("");
    setEstrutura(null);
    setMapeamento([]);
    setInverterSinal(false);
    setDuplicadas(new Set());
    setSelecionados(new Set());
    setResultado(null);
    setCriarCategorias(false);
    setEhCartaoArquivo(false);
    setClassificacoes([]);
    setSugestoes([]);
  }

  async function receberArquivo(arquivo: File) {
    setErro(null);
    setIncompativel(false);
    try {
      validarArquivoAntesDeLer(arquivo);
      setLendo(true);
      const bytes = await lerBytes(arquivo);
      const { texto } = decodificarArquivo(bytes);
      // OFX vira CSV padrão e segue o mesmo caminho do importador.
      let textoCsv = texto;
      let cartao = false;
      if (pareceOfx(texto)) {
        const extrato = lerOfx(texto);
        if (extrato.transacoes.length === 0) throw new ErroArquivo("Não encontrei lançamentos nesse OFX. Confira o período exportado no banco.");
        textoCsv = ofxParaCsv(extrato);
        cartao = extrato.ehCartao;
      }
      const e = analisarEstrutura(textoCsv);
      setEhCartaoArquivo(cartao || e.sugereInverterSinal);
      setNomeArquivo(arquivo.name.slice(0, 120));
      setEstrutura(e);
      setMapeamento(e.mapeamento);
      setInverterSinal(e.sugereInverterSinal);
      setEtapa("mapear");
    } catch (e) {
      if (e instanceof ErroArquivo && e.message === "ESTRUTURA") setIncompativel(true);
      else setErro(e instanceof Error ? e.message : "Não foi possível ler o arquivo.");
    } finally {
      setLendo(false);
    }
  }

  async function conferir() {
    if (!usuarioEfetivoId || !contaId) return;
    setVerificando(true);
    setErro(null);
    try {
      const datas = interpretacao.validos.map((v) => v.data).sort();
      const existentes = datas.length
        ? await buscarExistentesParaDuplicidade(usuarioEfetivoId, contaId, datas[0], datas[datas.length - 1])
        : [];
      const dup = marcarDuplicadas(interpretacao.validos, existentes);
      // Leitura inteligente: o que é cada lançamento, categoria sugerida
      // (histórico do usuário > regras), dívida ligada, fatura → cartão.
      const conta = contas.find((c) => c.id === contaId);
      const ehCartao = ehCartaoArquivo || conta?.tipo === "cartao_credito";
      const classes = interpretacao.validos.map((l) => classificarLancamento(l, ehCartao));
      const contexto = await carregarContextoExtrato({
        usuarioId: usuarioEfetivoId,
        tipoNegocio,
        inicio: datas[0] ?? new Date().toISOString().slice(0, 10),
        fim: datas[datas.length - 1] ?? new Date().toISOString().slice(0, 10),
        chaveDe: chaveDescricao,
      });
      const cartaoDestino = conta?.tipo === "cartao_credito" ? null : contas.find((c) => c.tipo === "cartao_credito")?.id ?? null;
      const sugs = sugerirExtrato({
        itens: interpretacao.validos,
        classificacoes: classes,
        contexto,
        cartaoDestinoId: cartaoDestino,
        parecidas: descricoesParecidas,
      });
      sugs.forEach((sg, i) => {
        if (sg.jaLancado) dup.add(i);
      });
      setCategorias(contexto.categorias);
      setClassificacoes(classes);
      setSugestoes(sugs);
      setDuplicadas(dup);
      // Duplicadas (e "pagamento da fatura" dentro da fatura) vêm desmarcadas.
      setSelecionados(new Set(interpretacao.validos.map((_, i) => i).filter((i) => !dup.has(i) && !desmarcadoPorPadrao(classes[i].natureza))));
      setEtapa("conferir");
    } catch {
      setErro("Não foi possível conferir duplicadas agora. Verifique a internet e tente de novo.");
    } finally {
      setVerificando(false);
    }
  }

  async function importar() {
    if (!usuarioEfetivoId || !contaId) return;
    setImportando(true);
    setErro(null);
    try {
      const indices = Array.from(selecionados).sort((a, b) => a - b);
      const itens = indices.map((i) => interpretacao.validos[i]);
      let sugestoesFinais = indices.map((i) => sugestoes[i]);
      // CSV com coluna de categoria + "criar categorias novas": a categoria
      // escrita no arquivo vale (criando quando não existir).
      if (criarCategorias && itens.some((it) => it.categoriaTexto)) {
        const doArquivo = await resolverCategorias(usuarioEfetivoId, itens, true);
        sugestoesFinais = sugestoesFinais.map((sg, k) =>
          itens[k].categoriaTexto && sg && sg.origemCategoria !== "divida" && sg.origemCategoria !== "arquivo" && sg.origemCategoria !== "manual"
            ? { ...sg, categoriaId: doArquivo.get(k) ?? sg.categoriaId }
            : sg
        );
      }
      const { inseridos, falhas } = await importarExtratoInteligente({
        usuarioId: usuarioEfetivoId,
        contaId,
        tipoNegocio,
        itens: itens.map((item, k) => ({ ...item, formaPagamento: item.formaPagamento ?? classificacoes[indices[k]]?.formaPagamento ?? null })),
        sugestoes: sugestoesFinais,
      });
      const ignoradosDuplicidade = Array.from(duplicadas).filter((i) => !selecionados.has(i)).length;
      setResultado({
        inseridos,
        ignoradosDuplicidade,
        falhas: [...interpretacao.rejeitados, ...falhas],
      });
      setEtapa("resultado");
      // Revalida dados de servidor; as telas do painel buscam de novo ao abrir.
      router.refresh();
    } catch {
      setErro("A importação foi interrompida. Confira o extrato antes de tentar de novo, para não duplicar.");
    } finally {
      setImportando(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {erro && (
        <Card padding="lg" className="flex items-start gap-3 border border-rose-300 dark:border-rose-700">
          <AlertTriangle size={20} className="mt-0.5 shrink-0 text-rose-700 dark:text-rose-300" />
          <p className="min-w-0 flex-1 text-small font-medium text-foreground">{erro}</p>
          <button type="button" aria-label="Fechar aviso" onClick={() => setErro(null)} className="text-muted hover:text-foreground">
            <X size={18} />
          </button>
        </Card>
      )}

      {etapa === "upload" && <AreaUpload lendo={lendo} onArquivo={receberArquivo} />}

      {etapa === "mapear" && estrutura && (
        <MapeamentoColunas
          nomeArquivo={nomeArquivo}
          estrutura={estrutura}
          mapeamento={mapeamento}
          onMapeamento={setMapeamento}
          inverterSinal={inverterSinal}
          onInverterSinal={setInverterSinal}
          interpretacao={interpretacao}
          contas={contas}
          contaId={contaId}
          onConta={setContaId}
          tipoNegocio={tipoNegocio}
          onTipoNegocio={setTipoNegocio}
          podeNegocio={podeAcessarMinhaEmpresa && !!negocio}
          criarCategorias={criarCategorias}
          onCriarCategorias={setCriarCategorias}
          verificando={verificando}
          onVoltar={reiniciar}
          onAvancar={conferir}
        />
      )}

      {etapa === "conferir" && (
        <ConferenciaImportacao
          validos={interpretacao.validos}
          rejeitados={interpretacao.rejeitados}
          duplicadas={duplicadas}
          classificacoes={classificacoes}
          sugestoes={sugestoes}
          onSugestoes={setSugestoes}
          categorias={categorias}
          cartoes={contas.filter((c) => c.tipo === "cartao_credito" && c.id !== contaId)}
          selecionados={selecionados}
          onSelecionados={setSelecionados}
          importando={importando}
          onVoltar={() => setEtapa("mapear")}
          onCancelar={reiniciar}
          onConfirmar={importar}
        />
      )}

      {etapa === "resultado" && resultado && (
        <ResultadoImportacao
          resultado={resultado}
          nomeArquivo={nomeArquivo}
          linkExtrato={tipoNegocio === "negocio" ? "/dashboard/empresa/extrato" : "/dashboard/extrato"}
          onNovaImportacao={reiniciar}
        />
      )}

      {incompativel && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true">
          <div className="flex w-full max-w-md flex-col gap-4 rounded-t-3xl bg-card p-6 shadow-card-hover sm:rounded-3xl">
            <div className="flex items-start gap-3">
              <AlertTriangle size={24} className="shrink-0 text-amber-700 dark:text-amber-300" />
              <div className="min-w-0">
                <h2 className="text-h3 text-foreground">Não reconheci este arquivo</h2>
                <p className="text-small text-muted">
                  Não encontrei uma coluna de data e de valor confiáveis. Use o modelo do Calixto (Data;Tipo;Categoria;Descrição;Forma de pagamento;Valor) — dá
                  para copiar suas linhas para ele no Excel ou Google Planilhas.
                </p>
              </div>
            </div>
            <Button type="button" onClick={() => baixarCsv("modelo-importacao-calixto.csv", MODELO_CSV)}>
              <Download size={18} /> Baixar modelo CSV
            </Button>
            <Button type="button" variant="tertiary" onClick={() => setIncompativel(false)}>
              Fechar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
