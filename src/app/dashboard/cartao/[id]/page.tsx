"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, ArrowUpCircle, ArrowDownCircle, CreditCard, Settings2 } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { useAuth } from "@/lib/auth/AuthProvider";
import { listarContas } from "@/lib/data/contas";
import { listarTransacoes } from "@/lib/data/transacoes";
import { agruparPorFatura } from "@/lib/data/faturaCartao";
import { NovaTransacaoModal } from "@/components/dashboard/NovaTransacaoModal";
import { formatarMoeda } from "@/lib/format";
import type { Conta, Transacao } from "@/lib/data/tipos";

function formatarDiaMes(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "long" });
}

/**
 * Fatura de um cartão de crédito -- agrupa as transações dessa carteira por
 * ciclo de fechamento (não pelo mês civil) e mostra o total de cada fatura,
 * fechada ou em aberto. Ver src/lib/data/faturaCartao.ts pro cálculo do
 * ciclo. Não mexe em saldo/`transacoes` nenhum -- é só uma visão diferente
 * das mesmas transações que já aparecem no Extrato completo.
 */
export default function FaturaCartaoPage() {
  const params = useParams<{ id: string }>();
  const contaId = params?.id ?? "";
  const { user } = useAuth();

  const [conta, setConta] = React.useState<Conta | null | undefined>(undefined);
  const [transacoes, setTransacoes] = React.useState<Transacao[]>([]);
  const [carregando, setCarregando] = React.useState(true);
  const [modalAberto, setModalAberto] = React.useState(false);
  const [transacaoEditando, setTransacaoEditando] = React.useState<Transacao | null>(null);

  const carregar = React.useCallback(async () => {
    if (!user || !contaId) return;
    setCarregando(true);
    const [contas, lista] = await Promise.all([listarContas(user.id), listarTransacoes(user.id)]);
    setConta(contas.find((c) => c.id === contaId) ?? null);
    setTransacoes(lista.filter((t) => t.conta_id === contaId));
    setCarregando(false);
  }, [user, contaId]);

  React.useEffect(() => {
    carregar();
  }, [carregar]);

  function handleEditar(t: Transacao) {
    setTransacaoEditando(t);
    setModalAberto(true);
  }

  function handleFecharModal() {
    setModalAberto(false);
    setTransacaoEditando(null);
  }

  // Guarda calculada fora do useMemo (não pode depender de narrowing dentro
  // dele) -- true só quando `conta` está carregada, é cartão de crédito, e
  // tem os dois dias configurados.
  const cartaoConfigurado =
    !!conta && conta.tipo === "cartao_credito" && !!conta.dia_fechamento && !!conta.dia_vencimento;

  const grupos = React.useMemo(() => {
    if (!cartaoConfigurado || !conta) return [];
    // O `if` acima já garante os dois campos preenchidos -- `as number`
    // só documenta isso pro TypeScript, sem mudar nenhum valor.
    return agruparPorFatura(transacoes, conta.dia_fechamento as number, conta.dia_vencimento as number);
  }, [transacoes, conta, cartaoConfigurado]);

  const modal = (
    <NovaTransacaoModal
      aberto={modalAberto}
      mundo="pessoal"
      transacaoEditando={transacaoEditando}
      onFechar={handleFecharModal}
      onSalvo={carregar}
    />
  );

  const voltar = (
    <Link href="/dashboard/carteiras" className="flex items-center gap-1.5 text-small font-medium text-muted hover:text-foreground">
      <ArrowLeft size={16} />
      Minhas carteiras
    </Link>
  );

  if (carregando) {
    return (
      <Container full className="flex flex-col gap-6 py-8">
        {voltar}
        <p className="py-8 text-center text-body text-muted">Carregando...</p>
      </Container>
    );
  }

  if (!conta) {
    return (
      <Container full className="flex flex-col gap-6 py-8">
        {voltar}
        <Card className="flex flex-col items-center gap-3 py-12 text-center">
          <CreditCard size={28} className="text-muted" />
          <p className="text-body text-muted">Essa carteira não foi encontrada.</p>
        </Card>
      </Container>
    );
  }

  if (conta.tipo !== "cartao_credito") {
    return (
      <Container full className="flex flex-col gap-6 py-8">
        {voltar}
        <Card className="flex flex-col items-center gap-3 py-12 text-center">
          <CreditCard size={28} className="text-muted" />
          <p className="text-body text-muted">A tela de fatura só existe pra carteiras do tipo cartão de crédito.</p>
        </Card>
      </Container>
    );
  }

  if (!conta.dia_fechamento || !conta.dia_vencimento) {
    return (
      <Container full className="flex flex-col gap-6 py-8">
        {voltar}
        <Card className="flex flex-col items-center gap-3 py-12 text-center">
          <Settings2 size={28} className="text-muted" />
          <p className="text-body text-muted">
            Configure o dia de fechamento e o dia de vencimento desta carteira pra ver a fatura organizada
            por ciclo.
          </p>
          <Link href="/dashboard/carteiras" className="text-small font-semibold text-primary-600 hover:underline">
            Editar carteira
          </Link>
        </Card>
      </Container>
    );
  }

  return (
    <Container full className="flex flex-col gap-6 py-8">
      {voltar}

      <div className="flex flex-col items-start gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div>
          <h1 className="text-h2 text-foreground">Fatura — {conta.nome}</h1>
          <p className="text-body text-muted">
            Fecha todo dia {conta.dia_fechamento}, vence todo dia {conta.dia_vencimento}.
            {conta.limite !== null && <> Limite: {formatarMoeda(Number(conta.limite))}.</>}
          </p>
        </div>
      </div>

      {grupos.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 py-12 text-center">
          <CreditCard size={28} className="text-muted" />
          <p className="text-body text-muted">Nenhum lançamento ainda nesta carteira.</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          {grupos.map((grupo) => (
            <div key={grupo.ciclo.chave} className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-body font-semibold text-foreground">{grupo.ciclo.rotulo}</h2>
                {grupo.ciclo.aberta && (
                  <Badge variant="accent" size="sm">
                    Em aberto
                  </Badge>
                )}
                <span className="text-small text-muted">
                  fecha {formatarDiaMes(grupo.ciclo.fechamento)} · vence {formatarDiaMes(grupo.ciclo.vencimento)}
                </span>
                <span className="ml-auto text-body font-semibold text-foreground">
                  {formatarMoeda(grupo.total)}
                </span>
              </div>
              <div className="flex flex-col gap-2">
                {grupo.transacoes.map((t) => (
                  <Card
                    key={t.id}
                    padding="sm"
                    onClick={() => handleEditar(t)}
                    className="flex flex-wrap items-center justify-between gap-4 transition-colors cursor-pointer hover:bg-muted/5"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                          t.tipo === "receita" ? "bg-primary-50 text-primary-600" : "bg-rose-50 text-red-500"
                        }`}
                      >
                        {t.tipo === "receita" ? <ArrowUpCircle size={16} /> : <ArrowDownCircle size={16} />}
                      </span>
                      <div className="min-w-0">
                        <p className="text-body font-medium text-foreground">{t.descricao}</p>
                        <p className="text-xs text-muted">
                          {new Date(t.data + "T00:00:00").toLocaleDateString("pt-BR")}
                          {t.categorias?.nome ? ` · ${t.categorias.nome}` : ""}
                        </p>
                      </div>
                    </div>
                    <p
                      className={`shrink-0 text-body font-semibold ${
                        t.tipo === "receita" ? "text-primary-600" : "text-red-500"
                      }`}
                    >
                      {t.tipo === "receita" ? "+" : "-"}
                      {formatarMoeda(Number(t.valor))}
                    </p>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {modal}
    </Container>
  );
}
