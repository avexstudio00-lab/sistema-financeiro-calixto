"use client";

import * as React from "react";
import { Bell, BellOff, BellRing, Check, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import {
  ativarNotificacoesPush,
  desativarNotificacoesPush,
  obterInscricaoPushAtual,
  suportaPush,
} from "@/lib/data/notificacoesPush";

/**
 * Card de "Notificacoes push" (Bloco 5) na tela de Perfil -- ativa/desativa
 * o aviso de alerta de orcamento (80% do limite) e de falha de cobranca do
 * Asaas neste navegador/dispositivo. Um dispositivo por inscricao: quem usa
 * o app no celular e no computador ativa nos dois separadamente.
 */
export function NotificacoesPush() {
  const [suportado, setSuportado] = React.useState(true);
  const [inscrito, setInscrito] = React.useState(false);
  const [carregando, setCarregando] = React.useState(true);
  const [alternando, setAlternando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  const [mensagem, setMensagem] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelado = false;
    if (!suportaPush()) {
      setSuportado(false);
      setCarregando(false);
      return;
    }
    obterInscricaoPushAtual()
      .then((inscricao) => {
        if (!cancelado) setInscrito(!!inscricao);
      })
      .finally(() => {
        if (!cancelado) setCarregando(false);
      });
    return () => {
      cancelado = true;
    };
  }, []);

  async function handleAtivar() {
    setAlternando(true);
    setErro(null);
    setMensagem(null);
    try {
      await ativarNotificacoesPush();
      setInscrito(true);
      setMensagem("Notificacoes ativadas neste dispositivo.");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao ativar notificacoes.");
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
      setMensagem("Notificacoes desativadas neste dispositivo.");
    } finally {
      setAlternando(false);
    }
  }

  return (
    <Card padding="lg" className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted/15 text-muted">
          <Icon icon={inscrito ? BellRing : Bell} />
        </span>
        <div>
          <h2 className="text-h3 text-foreground">Notificacoes push</h2>
          <p className="text-small text-muted">
            Avisos de orcamento (80% do limite) e de cobranca pendente direto neste navegador.
          </p>
        </div>
      </div>

      {!suportado ? (
        <p className="text-small text-muted">Este navegador nao suporta notificacoes push.</p>
      ) : carregando ? (
        <p className="flex items-center gap-2 text-small text-muted">
          <Loader2 size={16} className="animate-spin" />
          Verificando...
        </p>
      ) : (
        <>

          {mensagem && (
            <p className="flex items-center gap-2 text-small text-primary-700">
              <Check size={16} />
              {mensagem}
            </p>
          )}
          {erro && <p className="text-small text-rose-600">{erro}</p>}

          <Button
            type="button"
            variant="tertiary"
            disabled={alternando}
            onClick={inscrito ? handleDesativar : handleAtivar}
            className="w-full self-start sm:w-auto"
          >
            {alternando ? (
              <Loader2 size={18} className="animate-spin" />
            ) : inscrito ? (
              <BellOff size={18} />
            ) : (
              <Bell size={18} />
            )}

            {alternando ? "Aguarde..." : inscrito ? "Desativar neste dispositivo" : "Ativar neste dispositivo"}
          </Button>
        </>
      )}
    </Card>
  );
}
