import Link from "next/link";
import { ArrowRight, TrendingUp, Wallet } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

const BARRAS = [40, 65, 50, 80, 60, 90];

export function Hero() {
  return (
    <section className="overflow-hidden pb-20 pt-16 sm:pt-24">
      <Container className="grid items-center gap-12 lg:grid-cols-2">
        <div className="flex flex-col items-start gap-6">
          <Badge variant="accent">Controle financeiro simples</Badge>
          <h1 className="text-h1 text-foreground sm:text-5xl">
            Saiba para onde seu dinheiro vai — e o que fazer para sobrar mais
          </h1>
          <p className="max-w-xl text-body text-muted">
            Feito para quem é CLT, MEI ou tem uma pequena empresa e ganha de 2 a 6 salários
            mínimos. Sem planilha, sem termos técnicos — só clareza sobre suas finanças.
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <Link href="/cadastro">
              <Button size="lg">
                Começar grátis
                <ArrowRight size={18} strokeWidth={2} />
              </Button>
            </Link>
            <a href="#planos">
              <Button variant="tertiary" size="lg">
                Ver planos
              </Button>
            </a>
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-md">
          <div className="rounded-3xl border border-border bg-card p-6 shadow-card">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <p className="text-small text-muted">Saldo do mês</p>
                <p className="text-h2 text-secondary">R$ 1.284,00</p>
              </div>
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
                <Wallet size={20} />
              </span>
            </div>

            <div className="mb-6 flex items-end gap-2">
              {BARRAS.map((altura, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-t-lg bg-gradient-to-t from-primary-500 to-accent-400"
                  style={{ height: `${altura}px` }}
                />
              ))}
            </div>

            <div className="flex items-center gap-2 rounded-xl bg-primary-50 px-4 py-3">
              <TrendingUp size={18} className="text-primary-600" />
              <p className="text-small font-medium text-primary-700">
                Você guardou 12% a mais que mês passado
              </p>
            </div>
          </div>

          <div className="absolute -right-6 -top-6 hidden rounded-2xl border border-border bg-card px-4 py-3 shadow-soft sm:block">
            <p className="text-small text-muted">Categoria em alta</p>
            <p className="text-body font-semibold text-foreground">Mercado</p>
          </div>
        </div>
      </Container>
    </section>
  );
}
