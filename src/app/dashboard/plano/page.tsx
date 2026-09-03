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

const BADGE_PLANO: Record<Plano, string> = {
  gratis: "Para começar",
  mensal: "Básico",
  clt: "Mais popular",
  avancado: "Para MEI e ME",
};

const DESCRICAO_PLANO: Record<Plano, string> = {
  gratis: "Pra testar e ver se o app é a sua cara, sem compromisso nenhum.",
  mensal: "Uso pessoal completo, com análise de IA no fim de cada mês.",
  clt: "O mais indicado pra quem é CLT: acompanha o dinheiro dia a dia, com dashboard ao vivo e sugestões de corte — sem controle de estoque, porque quem é CLT não precisa disso.",
  avancado: "Pra quem é MEI ou ME: tudo do plano CLT, mais o controle completo do negócio — vendas, estoque, contas a pagar/receber e fluxo de caixa.",
};

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
                <Badge variant={planoId === "clt" ? "primary" : "neutral"}>{BADGE_PLANO[planoId]}</Badge>
                {ehAtual && <Badge variant="primary">Seu plano atual</Badge>}
              </div>
              <div>
                <p className="text-h2 text-foreground">{dados.precoLabel}</p>
                <p className="text-h3 mt-1 text-foreground">{dados.nome}</p>
              </div>
              <p className="text-small text-muted">{DESCRICAO_PLANO[planoId]}</p>
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

      <div className="mx-auto grid w-full max-w-4xl gap-4 sm:grid-cols-2">
        <div className="rounded-2xl bg-primary-50 p-5 text-body text-primary-800">
          O plano <strong>Mensal</strong> mostra o que aconteceu no mês. Os planos{" "}
          <strong>CLT</strong> e <strong>Avançado</strong> mostram o que está acontecendo agora
          e o que fazer para melhorar.
        </div>
        <div className="rounded-2xl bg-accent-50 p-5 text-body text-accent-800">
          O plano <strong>CLT</strong> foca em sobrar dinheiro e começar a investir. O plano{" "}
          <strong>Avançado</strong>, pra quem é <strong>MEI/ME</strong>, soma o controle de
          vendas, estoque e lucro real do negócio.
        </div>
      </div>
    </Container>
  );
}
