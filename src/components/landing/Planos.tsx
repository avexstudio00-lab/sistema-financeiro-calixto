import Link from "next/link";
import { Check } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { FadeIn } from "@/components/ui/FadeIn";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { cn } from "@/lib/utils";

const PLANOS = [
  {
    id: "gratis",
    nome: "Grátis",
    preco: "R$ 0",
    periodo: "",
    badge: "Para começar",
    destaque: false,
    recursos: ["Anote até 30 gastos por mês", "Categorias de gastos", "Resumo simples do mês"],
    cta: "Criar conta grátis",
    href: "/cadastro",
  },
  {
    id: "mensal",
    nome: "Mensal",
    preco: "R$ 20",
    periodo: "/mês",
    badge: "Básico",
    destaque: false,
    recursos: [
      "Anotações ilimitadas",
      "Análise de IA no fim do mês (entrou, saiu, sobrou, variação em %)",
      "Dashboard mensal",
      "Comparativo com o mês anterior",
      "Metas de economia",
    ],
    cta: "Assinar por R$ 20",
    href: "/cadastro?plano=mensal",
  },
  {
    id: "clt",
    nome: "CLT",
    preco: "R$ 30",
    periodo: "/mês",
    badge: "Mais popular",
    destaque: true,
    recursos: [
      "Tudo do plano Mensal",
      "Dashboard diário ao vivo",
      "Gráficos interativos",
      "Sugestões de corte e melhoria",
      "Sem controle de estoque/negócio — ideal pra quem é CLT",
    ],
    cta: "Assinar por R$ 30",
    href: "/cadastro?plano=clt",
  },
  {
    id: "avancado",
    nome: "Avançado",
    preco: "R$ 50",
    periodo: "/mês",
    badge: "Para MEI e ME",
    destaque: false,
    recursos: [
      "Tudo do plano CLT",
      "Minha empresa: vendas, estoque, contas e fluxo de caixa",
      "Ideal pra quem é MEI ou ME",
    ],
    cta: "Assinar por R$ 50",
    href: "/cadastro?plano=avancado",
  },
];

export function Planos() {
  return (
    <section id="planos" className="py-20">
      <Container className="flex flex-col gap-10">
        <SectionTitle
          align="center"
          eyebrow="Planos"
          title="Escolha o plano ideal para você"
          description="Cada plano se adapta ao seu perfil — CLT, MEI ou ME."
          className="mx-auto items-center text-center"
        />

        <div className="grid items-start gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {PLANOS.map((plano, i) => (
            <FadeIn key={plano.id} delay={i * 100}>
              <Card
                padding="lg"
                variant="interactive"
                className={cn(
                  "flex h-full flex-col gap-6",
                  plano.destaque && "border-2 border-primary-500 shadow-card-hover lg:-translate-y-2"
                )}
              >
                <Badge variant={plano.destaque ? "primary" : "neutral"}>{plano.badge}</Badge>
                <div>
                  <p className="flex items-end gap-1">
                    <span className="text-h1 text-foreground">{plano.preco}</span>
                    <span className="pb-1 text-body text-muted">{plano.periodo}</span>
                  </p>
                  <p className="text-h3 mt-1">{plano.nome}</p>
                </div>
                <ul className="flex flex-1 flex-col gap-3">
                  {plano.recursos.map((r) => (
                    <li key={r} className="flex items-start gap-2 text-body text-foreground">
                      <Check size={18} className="mt-0.5 shrink-0 text-primary-500" />
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
                <Link href={plano.href}>
                  <Button variant={plano.destaque ? "primary" : "secondary"} className="w-full">
                    {plano.cta}
                  </Button>
                </Link>
              </Card>
            </FadeIn>
          ))}
        </div>

        <FadeIn>
          <div className="mx-auto grid max-w-4xl gap-4 sm:grid-cols-2">
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
        </FadeIn>
      </Container>
    </section>
  );
}
