"use client";

import * as React from "react";
import { Bell, BellOff, BellRing, Check, Download, Loader2, PlusSquare, Share } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import {
  ativarNotificacoesPush,
  desativarNotificacoesPush,
  ehAndroid,
  estaInstaladoComoApp,
  obterInscricaoPushAtual,
  precisaInstalarParaPush,
  suportaPush,
} from "@/lib/data/notificacoesPush";

/**
 * Card "Notificações no celular" (item 6.6 da especificação de 03/out/2026):
 * ativa o push REAL — aquele que aparece na tela de bloqueio com som e
 * vibração, mesmo com o app fechado. Uma inscrição por aparelho.
 *
 * No iPhone o push só existe com o app instalado na Tela de Início (iOS
 * 16.4+): aberto no Safari comum, mostramos o passo a passo de instalação
 * antes de pedir a permissão. No Android, oferecemos o botão "Instalar app".
 */
export function NotificacoesPush() {
  const [suportado, setSuportado] = React.useState(true);
  const [precisaInstalar, setPrecisaInstalar] = React.useState(false);
  const [podeInstalarAndroid, setPodeInstalarAndroid] = React.useState(false);
  const [inscrito, setInscrito] = React.useState(false);
  const [permissaoNegada, setPermissaoNegada] = React.useState(false);
  const [carregando, setCarregando] = React.useState(true);
  const [alternando, setAlternando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  const [mensagem, setMensagem] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelado = false;
    const atualizarInstalavel = () => setPodeInstalarAndroid(!!window.__calixtoInstalar && !estaInstaladoComoApp());
    atualizarInstalavel();
    window.addEventListener("calixto:instalavel", atualizarInstalavel);

    if (precisaInstalarParaPush()) {
      setPrecisaInstalar(true);
      setCarregando(false);
    } else if (!suportaPush()) {
      setSuportado(false);
      setCarregando(false);
    } else {
      setPermissaoNegada(Notification.permission === "denied");
      obterInscricaoPushAtual()
        .then((inscricao) => {
          if (!cancelado) setInscrito(!!inscricao && Notification.permission === "granted");
        })
        .finally(() => {
          if (!cancelado) setCarregando(false);
        });
    }
    return () => {
      cancelado = true;
      window.removeEventListener("calixto:instalavel", atualizarInstalavel);
    };
  }, []);

  async function handleAtivar() {
    setAlternando(true);
    setErro(null);
    setMensagem(null);
    try {
      await ativarNotificacoesPush();
      setInscrito(true);
      setMensagem("Pronto! Você vai receber os avisos na tela do celular, mesmo com o app fechado.");
    } catch (e) {
      const texto = e instanceof Error ? e.message : "";
      if (/negada/i.test(texto)) setPermissaoNegada(true);
      setErro(texto || "Erro ao ativar notificações.");
    } finally {
      setAlternando(false);
    }
  }

  async function handleDesativar() {
    setAlternando(true);
    setErro(null);
    setMensagem(null);
    try {
      await desativarNotificacoesPush();
      setInscrito(false);
      setMensagem("Notificações desativadas neste aparelho.");
    } finally {
      setAlternando(false);
    }
  }

  async function handleInstalarAndroid() {
    const evento = window.__calixtoInstalar;
    if (!evento) return;
    await evento.prompt();
    await evento.userChoice.catch(() => null);
    window.__calixtoInstalar = null;
    setPodeInstalarAndroid(false);
  }

  return (
    <Card padding="lg" className="flex flex-col gap-5">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-700 dark:text-primary-300">
          <Icon icon={inscrito ? BellRing : Bell} />
        </span>
        <div className="min-w-0">
          <h2 className="text-h3 text-foreground">Notificações no celular</h2>
          <p className="text-small text-muted">
            Avisos de contas, parcelas, empréstimos, orçamentos e limites direto na tela de bloqueio — com som e vibração, sem precisar abrir o app.
          </p>
        </div>
      </div>

      {podeInstalarAndroid && ehAndroid() && (
        <div className="flex flex-col gap-2 rounded-xl border border-border px-4 py-3">
          <p className="text-small text-foreground">Instale o Calixto como app para receber os avisos como um app de verdade.</p>
          <Button type="button" variant="tertiary" onClick={handleInstalarAndroid} className="self-start">
            <Download size={18} /> Instalar app
          </Button>
        </div>
      )}

      {precisaInstalar ? (
        <div className="flex flex-col gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-700">
          <p className="text-small font-medium text-foreground">No iPhone, primeiro instale o app na Tela de Início:</p>
          <ol className="flex flex-col gap-2 text-small text-foreground">
            <li className="flex items-start gap-2">
              <span className="font-semibold">1.</span>
              <span>
                Abra este site no <strong>Safari</strong> e toque em <Share size={14} className="inline align-text-bottom" />{" "}
                <strong>Compartilhar</strong> (barra de baixo).
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="font-semibold">2.</span>
              <span>
                Role e toque em <PlusSquare size={14} className="inline align-text-bottom" /> <strong>Adicionar à Tela de Início</strong> →{" "}
                <strong>Adicionar</strong>.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="font-semibold">3.</span>
              <span>
                Abra o Calixto pelo <strong>ícone novo</strong> na Tela de Início, entre em Segurança e toque em &quot;Ativar neste aparelho&quot;.
              </span>
            </li>
          </ol>
          <p className="text-xs text-muted">Precisa do iOS 16.4 ou mais novo (Ajustes → Geral → Sobre).</p>
        </div>
      ) : !suportado ? (
        <p className="text-small text-muted">Este navegador não suporta notificações push. No celular, use o Chrome (Android) ou o app instalado (iPhone).</p>
      ) : carregando ? (
        <p className="flex items-center gap-2 text-small text-muted">
          <Loader2 size={16} className="animate-spin" />
          Verificando...
        </p>
      ) : (
        <>
          {permissaoNegada && !inscrito && (
            <p className="text-small text-foreground">
              As notificações estão bloqueadas para este app. Libere em Ajustes do celular → Notificações → Calixto (ou nas permissões do site no navegador) e
              toque em ativar de novo.
            </p>
          )}
          {mensagem && (
            <p className="flex items-center gap-2 text-small text-primary-700 dark:text-primary-300">
              <Check size={16} className="shrink-0" />
              {mensagem}
            </p>
          )}
          {erro && <p className="text-small font-medium text-rose-700 dark:text-rose-300">{erro}</p>}

          <Button
            type="button"
            variant={inscrito ? "tertiary" : "primary"}
            disabled={alternando}
            onClick={inscrito ? handleDesativar : handleAtivar}
            className="w-full self-start sm:w-auto"
          >
            {alternando ? <Loader2 size={18} className="animate-spin" /> : inscrito ? <BellOff size={18} /> : <Bell size={18} />}
            {alternando ? "Aguarde..." : inscrito ? "Desativar neste aparelho" : "Ativar neste aparelho"}
          </Button>
        </>
      )}
    </Card>
  );
}
