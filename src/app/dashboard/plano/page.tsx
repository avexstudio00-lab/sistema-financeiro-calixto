"use client";

import * as React from "react";
import { Check, CreditCard, ShieldCheck } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth/AuthProvider";
import { PLANOS, type Plano } from "@/lib/planos";
import { assinarPlano, cancelarAssinatura, ultimaAssinatura } from "@/lib/data/assinaturas";

const ORDEM: Plano[] = ["gratis", "mensal", "clt", "avancado"];

export default function PlanoPage() {
  const { user, perfil, recarregarPerfil } = useAuth();
  const [planoSelecionado, setPlanoSelecionado] = React.useState<Plano | null>(null);
  const [processando, setProcessando] = React.useState(false);
  const [assinatura, setAssinatura] = React.useState<Awaited<ReturnType<typeof ultimaAssinatura>>>(null);
  const [mensagem, setMensagem] = React.useState<string | null>(null);

  const carregarAssinatura = React.useCallback(async () => {
    if (!user) return;
    setAssinatura(await ultimaAssinatura(user.id));
  }, [user]);

  React.useEffect(() => {
    // Verifica se o usuário veio do cadastro com um plano pretendido (?plano=...).
    try {
      const pretendido = window.localStorage.getItem("plano_pretendido");
      if (pretendido === "mensal" || pretendido === "clt" || pretendido === "avancado") {
        setPlanoSelecionado(pretendido);
        window.localStorage.removeItem("plano_pretendido");
      }
    } catch {
      // localStorage indisponível — segue sem pré-selecionar.
    }
    carregarAssinatura();
  }, [carregarAssinatura]);

  async function handleConfirmarAssinatura(plano: Plano) {
    if (!user) return;
    setProcessando(true);
    await assinarPlano(user.id, plano);
    await recarregarPerfil();
    await carregarAssinatura();
    setProcessando(false);
    setPlanoSelecionado(null);
    setMensagem(`Assinatura do plano ${PLANOS[plano].nome} confirmada com sucesso.`);
  }

  async function handleCancelar() {
    if (!user) return;
    setProcessando(true);
    await cancelarAssinatura(user.id);
    await recarregarPerfil();
    await carregarAssinatura();
    setProcessando(false);
    setMensagem("Sua assinatura foi cancelada. Você voltou para o plano Grátis.");
  }

  if (!perfil) return null;

  return (
    <Container className="flex flex-col gap-8 py-8">
      <div>
        <h1 className="text-h2 text-foreground">Meu plano</h1>
        <p className="text-body text-muted">
          Você está no plano <strong>{PLANOS[perfil.plano].nome}</strong>.
        </p>
      </div>

      {mensagem && (
        <Card className="flex items-center gap-3 border-primary-200 bg-primary-50">
          <ShieldCheck size={20} className="text-primary-600" />
          <p className="text-body text-primary-800">{mensagem}</p>
        </Card>
      )}

      {assinatura && perfil.plano !== "gratis" && (
        <Card className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <CreditCard size={20} className="text-muted" />
            <div>
              <p className="text-body font-medium text-foreground">
                Assinatura {assinatura.status === "ativa" ? "ativa" : assinatura.status}
              </p>
              <p className="text-small text-muted">
                Início: {new Date(assinatura.data_inicio).toLocaleDateString("pt-BR")}
                {assinatura.data_proximo_pagamento &&
                  ` · Próxima cobrança: ${new Date(assinatura.data_proximo_pagamento).toLocaleDateString("pt-BR")}`}
              </p>
            </div>
          </div>
          {assinatura.status === "ativa" && (
            <Button variant="tertiary" onClick={handleCancelar} disabled={processando}>
              Cancelar assinatura
            </Button>
          )}
        </Card>
      )}

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {ORDEM.map((planoId) => {
          const dados = PLANOS[planoId];
          const ehAtual = perfil.plano === planoId;
          const confirmando = planoSelecionado === planoId;
          return (
            <Card
              key={planoId}
              padding="lg"
              className={cn("flex h-full flex-col gap-5", ehAtual && "border-2 border-primary-500")}
            >
              <div className="flex items-center justify-between">
                <p className="text-h3 text-foreground">{dados.nome}</p>
                {ehAtual && <Badge variant="primary">Seu plano atual</Badge>}
              </div>
              <p className="text-h2 text-foreground">{dados.precoLabel}</p>
              <ul className="flex flex-1 flex-col gap-2.5">
                {dados.recursos.map((r) => (
                  <li key={r} className="flex items-start gap-2 text-small text-foreground">
                    <Check size={16} className="mt-0.5 shrink-0 text-primary-500" />
                    <span>{r}</span>
                  </li>
                ))}
              </ul>

              {planoId === "avancado" && perfil.tipo_perfil === "clt" && (
                <p className="text-small text-muted">
                  Você está como CLT — o plano CLT já cobre tudo que você usa. O Avançado só
                  desbloqueia mais coisa se você mudar seu perfil pra MEI ou ME.
                </p>
              )}

              {ehAtual ? (
                <Button variant="tertiary" disabled className="w-full">
                  Plano atual
                </Button>
              ) : confirmando ? (
                <div className="flex flex-col gap-2">
                  <p className="text-small text-muted">
                    Pagamento simulado — nenhum valor real será cobrado neste ambiente de testes.
                  </p>
                  <Button onClick={() => handleConfirmarAssinatura(planoId)} disabled={processando} className="w-full">
                    {processando ? "Confirmando..." : `Confirmar por ${dados.precoLabel}`}
                  </Button>
                  <Button variant="tertiary" onClick={() => setPlanoSelecionado(null)} className="w-full">
                    Cancelar
                  </Button>
                </div>
              ) : (
                <Button
                  variant={planoId === "gratis" ? "tertiary" : "primary"}
                  onClick={() => (planoId === "gratis" ? handleCancelar() : setPlanoSelecionado(planoId))}
                  disabled={processando}
                  className="w-full"
                >
                  {planoId === "gratis" ? "Voltar para o grátis" : `Assinar por ${dados.precoLabel}`}
                </Button>
              )}
            </Card>
          );
        })}
      </div>
    </Container>
  );
}
