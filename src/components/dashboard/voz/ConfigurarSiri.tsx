"use client";

import * as React from "react";
import { Copy, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { gerarNovoCodigoVoz, statusCodigoVoz, type StatusCodigoVoz } from "@/lib/data/voz";

/** Link do atalho pronto no iCloud (quando existir, todo mundo instala com
 * um toque). Sem ele, a tela mostra os 3 passos pra montar. */
const LINK_ATALHO = process.env.NEXT_PUBLIC_ATALHO_SIRI_URL ?? "";

/** Copia com fallback pro Safari antigo (sem navigator.clipboard). */
async function copiarTexto(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    try {
      const area = document.createElement("textarea");
      area.value = texto;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      area.setSelectionRange(0, texto.length);
      const ok = document.execCommand("copy");
      document.body.removeChild(area);
      return ok;
    } catch {
      return false;
    }
  }
}

/**
 * Atalho da Siri — versão simples (23/nov/2026, depois do usuário se perder
 * no passo a passo de cabeçalho/código no iPhone). Agora o app entrega UM
 * endereço pronto, já com o código dentro, num botão grande "Copiar". No
 * Atalhos só precisa: Ditar Texto → Obter conteúdo de [colar] (POST, JSON
 * texto = Texto Ditado) → Falar Texto. Sem cabeçalho.
 */
export function ConfigurarSiri() {
  const [status, setStatus] = React.useState<StatusCodigoVoz | null | undefined>(undefined);
  const [endereco, setEndereco] = React.useState<string | null>(null);
  const [gerando, setGerando] = React.useState(false);
  const [copiado, setCopiado] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);

  React.useEffect(() => {
    void statusCodigoVoz().then(setStatus);
  }, []);

  async function gerar() {
    if (status?.configurado && !endereco && !window.confirm("Gerar um endereço novo faz o atalho antigo parar de funcionar até você colar o novo nele. Continuar?")) return;
    setGerando(true);
    setErro(null);
    setCopiado(false);
    const r = await gerarNovoCodigoVoz();
    setGerando(false);
    if (r.erro || !r.codigo) {
      setErro(r.erro ?? "Não foi possível gerar.");
      return;
    }
    // Termina em "&t=": no Atalhos o texto ditado entra logo depois.
    setEndereco(`${window.location.origin}/api/voz/siri?c=${r.codigo}&t=`);
    setStatus({ configurado: true, criadoEm: new Date().toISOString(), ultimoUso: null });
  }

  async function copiar() {
    if (!endereco) return;
    const ok = await copiarTexto(endereco);
    setCopiado(ok);
    if (!ok) setErro("Não deu pra copiar sozinho. Toque e segure no endereço acima e escolha Copiar.");
  }

  if (status === undefined) return <Loader2 size={18} className="animate-spin text-primary-700" />;
  if (status?.faltaSql) {
    return <p className="rounded-xl bg-amber-50 px-3 py-2 text-small text-amber-900 dark:text-amber-200">A Siri ainda não foi ativada no sistema.</p>;
  }

  const passo = "flex gap-3 text-small leading-relaxed text-foreground";
  const n = "flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-700 text-xs font-bold text-white";

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border p-4">
      <p className="text-small text-foreground">
        Depois de pronto, é só dizer <strong>&ldquo;E aí Siri, anotar gasto&rdquo;</strong> e falar. A anotação fica esperando aqui pra você conferir.
      </p>

      {/* Passo 1: pegar o endereço */}
      <div className="flex flex-col gap-3 rounded-xl bg-primary-50/60 p-3 dark:bg-primary-900/10">
        <p className={passo}>
          <span className={n}>1</span>
          <span>
            <strong>Pegue seu endereço pessoal</strong> (ele já leva seu código dentro).
          </span>
        </p>
        {endereco ? (
          <>
            <p className="select-all break-all rounded-lg bg-card px-3 py-2 font-mono text-sm leading-snug text-foreground">{endereco}</p>
            <Button className="w-full" size="lg" onClick={() => void copiar()}>
              {copiado ? <Check size={18} /> : <Copy size={18} />}
              {copiado ? "Copiado! Agora vá pro Atalhos" : "Copiar endereço"}
            </Button>
            <p className="text-xs text-muted">Por segurança ele só aparece agora. Se perder, é só gerar outro. Não mande pra ninguém.</p>
          </>
        ) : (
          <Button className="w-full" size="lg" disabled={gerando} onClick={() => void gerar()}>
            {gerando ? "Gerando..." : status?.configurado ? "Gerar endereço novo" : "Gerar meu endereço"}
          </Button>
        )}
        {erro && <p className="text-small text-rose-700 dark:text-rose-300">{erro}</p>}
      </div>

      {LINK_ATALHO ? (
        <div className="flex flex-col gap-2">
          <p className={passo}>
            <span className={n}>2</span>
            <span>Toque abaixo, depois em &ldquo;Adicionar atalho&rdquo;, e cole o endereço quando pedir.</span>
          </p>
          <a href={LINK_ATALHO} target="_blank" rel="noreferrer">
            <Button className="w-full" size="lg">
              Adicionar à Siri
            </Button>
          </a>
        </div>
      ) : (
        <>
          <p className={passo}>
            <span className={n}>2</span>
            <span>
              No app <strong>Atalhos</strong>, crie um atalho com estas 3 ações, <strong>nesta ordem</strong> (busque pelo nome em &ldquo;Buscar ações&rdquo;):
              <br />
              <strong>Ditar Texto</strong> → <strong>Codificar URL</strong> → <strong>Obter Conteúdo de URL</strong>.
              <br />
              <span className="text-muted">O iPhone liga uma na outra sozinho. Na última vai aparecer &ldquo;Obter conteúdo de [Texto Codificado em URL]&rdquo;.</span>
            </span>
          </p>
          <p className={passo}>
            <span className={n}>3</span>
            <span>
              Toque <strong>antes</strong> da fitinha azul &ldquo;Texto Codificado em URL&rdquo; e <strong>cole</strong> o endereço. Tem que ficar: endereço + fitinha azul, tudo junto. Não mexa em Método nem Cabeçalhos.
            </span>
          </p>
          <p className={passo}>
            <span className={n}>4</span>
            <span>
              Adicione <strong>Falar Texto</strong> no fim e renomeie o atalho para <strong>Anotar gasto</strong>. Teste tocando nele; funcionando, diga &ldquo;E aí Siri, anotar gasto&rdquo;.
            </span>
          </p>
        </>
      )}
    </div>
  );
}
