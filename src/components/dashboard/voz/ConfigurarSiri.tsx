"use client";

import * as React from "react";
import { Copy, Check, KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { gerarNovoCodigoVoz, statusCodigoVoz, type StatusCodigoVoz } from "@/lib/data/voz";

/** Link do atalho pronto no iCloud (quando o dono criar e compartilhar o
 * atalho uma vez, é só pôr na env da Vercel — todo mundo instala com um
 * toque). Sem ele, a tela mostra o passo a passo pra montar o atalho. */
const LINK_ATALHO = process.env.NEXT_PUBLIC_ATALHO_SIRI_URL ?? "";

function Copiar({ texto, rotulo }: { texto: string; rotulo: string }) {
  const [ok, setOk] = React.useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(texto).then(() => {
          setOk(true);
          window.setTimeout(() => setOk(false), 2000);
        });
      }}
      className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-primary-700 hover:bg-muted/10 dark:text-primary-300"
    >
      {ok ? <Check size={13} /> : <Copy size={13} />} {ok ? "Copiado" : rotulo}
    </button>
  );
}

/**
 * Atalho da Siri (23/nov/2026): "E aí Siri, anotar no Meu Controle". Cada
 * pessoa gera um código pessoal (vai dentro do atalho, pra anotação cair na
 * conta certa) e instala o atalho uma vez no próprio iPhone. O app Atalhos já
 * vem no iPhone — ninguém baixa nada da App Store.
 */
export function ConfigurarSiri() {
  const [status, setStatus] = React.useState<StatusCodigoVoz | null | undefined>(undefined);
  const [codigo, setCodigo] = React.useState<string | null>(null);
  const [gerando, setGerando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  const url = typeof window !== "undefined" ? `${window.location.origin}/api/voz/siri` : "/api/voz/siri";

  React.useEffect(() => {
    void statusCodigoVoz().then(setStatus);
  }, []);

  async function gerar() {
    if (status?.configurado && !window.confirm("Gerar um código novo faz o atalho antigo parar de funcionar até você colar o novo nele. Continuar?")) return;
    setGerando(true);
    setErro(null);
    const r = await gerarNovoCodigoVoz();
    setGerando(false);
    if (r.erro || !r.codigo) {
      setErro(r.erro ?? "Não foi possível gerar o código.");
      return;
    }
    setCodigo(r.codigo);
    setStatus({ configurado: true, criadoEm: new Date().toISOString(), ultimoUso: null });
  }

  if (status === undefined) return <Loader2 size={18} className="animate-spin text-primary-700" />;
  if (status?.faltaSql) {
    return <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">A Siri ainda não foi ativada no sistema (falta rodar o SQL do comando de voz). Avise o suporte.</p>;
  }

  const passo = "flex gap-2 text-xs text-foreground";
  const n = "flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-50 text-[11px] font-semibold text-primary-800";

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border p-3">
      <p className="text-xs text-muted">
        Diga <strong className="text-foreground">&ldquo;E aí Siri, anotar no Meu Controle&rdquo;</strong>, fale a anotação, e ela fica guardada aqui pra você conferir e salvar com um toque quando abrir o app. Não precisa baixar nada: o app Atalhos já vem no iPhone.
      </p>

      <div className="flex flex-col gap-2 rounded-lg bg-muted/5 p-2.5">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <KeyRound size={13} /> Seu código pessoal
        </p>
        {codigo ? (
          <>
            <div className="flex items-center gap-2 rounded-lg bg-card px-2 py-1.5">
              <code className="min-w-0 flex-1 break-all text-[11px] text-foreground">{codigo}</code>
              <Copiar texto={codigo} rotulo="Copiar" />
            </div>
            <p className="text-[11px] text-amber-800 dark:text-amber-200">Guarde agora: por segurança ele só aparece esta vez. Não mande pra ninguém.</p>
          </>
        ) : (
          <p className="text-xs text-muted">
            {status?.configurado
              ? `Você já tem um código${status.ultimoUso ? ` (último uso ${new Date(status.ultimoUso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })})` : ""}. Só gere outro se perdeu o atalho ou trocou de celular.`
              : "Gere o código e cole no atalho (passo a passo abaixo)."}
          </p>
        )}
        <Button size="sm" variant={status?.configurado ? "secondary" : "primary"} disabled={gerando} onClick={() => void gerar()}>
          {gerando ? "Gerando..." : status?.configurado ? "Gerar código novo" : "Gerar meu código"}
        </Button>
        {erro && <p className="text-xs text-rose-700 dark:text-rose-300">{erro}</p>}
      </div>

      {LINK_ATALHO ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-foreground">Com o código copiado, toque abaixo. O iPhone abre o Atalhos: toque em &ldquo;Adicionar atalho&rdquo; e cole o código quando ele pedir.</p>
          <a href={LINK_ATALHO} target="_blank" rel="noreferrer">
            <Button className="w-full">Adicionar à Siri</Button>
          </a>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold text-foreground">Montar o atalho (uma vez só, uns 3 minutos)</p>
          <div className={passo}>
            <span className={n}>1</span>
            <span>
              Abra o app <strong>Atalhos</strong>, toque em <strong>+</strong> e dê o nome <strong>Anotar no Meu Controle</strong> (é a frase que você vai dizer pra Siri).
            </span>
          </div>
          <div className={passo}>
            <span className={n}>2</span>
            <span>
              Adicione a ação <strong>Ditar Texto</strong>. Idioma: Português (Brasil). Parar de ouvir: Após Pausa.
            </span>
          </div>
          <div className={passo}>
            <span className={n}>3</span>
            <span className="min-w-0">
              Adicione <strong>Obter Conteúdo do URL</strong> e cole este endereço:
              <span className="mt-1 flex items-center gap-1 rounded-lg bg-muted/5 px-2 py-1">
                <code className="min-w-0 flex-1 break-all text-[11px]">{url}</code>
                <Copiar texto={url} rotulo="Copiar" />
              </span>
            </span>
          </div>
          <div className={passo}>
            <span className={n}>4</span>
            <span>
              Toque na setinha da ação (<strong>Mostrar Mais</strong>): Método <strong>POST</strong>. Em <strong>Cabeçalhos</strong>, adicione: chave <code>Authorization</code>, valor <code>Bearer </code> + seu código (com um espaço depois de Bearer). Em <strong>Corpo da Solicitação</strong>, escolha <strong>JSON</strong>, adicione um campo de texto com a chave <code>texto</code> e, no valor, escolha a variável <strong>Texto Ditado</strong>.
            </span>
          </div>
          <div className={passo}>
            <span className={n}>5</span>
            <span>
              Adicione <strong>Falar Texto</strong> e escolha <strong>Conteúdo do URL</strong>. Pronto: diga &ldquo;E aí Siri, anotar no Meu Controle&rdquo;.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
