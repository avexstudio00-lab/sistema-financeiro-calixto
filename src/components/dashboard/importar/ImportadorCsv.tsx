"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Download, X } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/auth/AuthProvider";
import { listarContas } from "@/lib/data/contas";
import { buscarExistentesParaDuplicidade, importarLancamentos, resolverCategorias } from "@/lib/data/importar";
import {
  ErroArquivo,
  MODELO_CSV,
  analisarEstrutura,
  decodificarArquivo,
  interpretarLinhas,
  marcarDuplicadas,
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

  // Negócio grava na conta mestre (mesmo padrão da NovaTransacaoModal).
  const usuarioEfetivoId = tipoNegocio === "negocio" ? negocio?.usuarioId ?? null : user?.id ?? null;

  React.useEffect(() => {
    if (!usuarioEfetivoId) return;
    listarContas(usuarioEfetivoId).then((lista) => {
      setContas(lista);
      setContaId((atual) => (lista.some((c) => c.id === atual) ? atual : lista.find((c) => c.tipo !== "cartao_credito")?.id ?? ""));
    });
  }, [usuarioEfetivoId]);

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
  }

  async function receberArquivo(arquivo: File) {
    setErro(null);
    setIncompativel(false);
    try {
      validarArquivoAntesDeLer(arquivo);
      setLendo(true);
      const bytes = await lerBytes(arquivo);
      const { texto } = decodificarArquivo(bytes);
      const e = analisarEstrutura(texto);
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
      setDuplicadas(dup);
      // Duplicadas vêm desmarcadas por padrão.
      setSelecionados(new Set(interpretacao.validos.map((_, i) => i).filter((i) => !dup.has(i))));
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
      const categorias = await resolverCategorias(usuarioEfetivoId, itens, criarCategorias);
      const { inseridos, falhas } = await importarLancamentos({
        usuarioId: usuarioEfetivoId,
        contaId,
        tipoNegocio,
        itens,
        categorias,
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
