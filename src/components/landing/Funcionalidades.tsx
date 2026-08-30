import { PenLine, Tags, LayoutDashboard, Brain, BarChart3, PiggyBank } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Card } from "@/components/ui/Card";
import { FadeIn } from "@/components/ui/FadeIn";
import { Icon } from "@/components/ui/Icon";
import { SectionTitle } from "@/components/ui/SectionTitle";

const FUNCIONALIDADES = [
  {
    icon: PenLine,
    titulo: "Anotação rápida",
    texto: "Registre um gasto ou uma receita em menos de 10 segundos, direto do celular.",
  },
  {
    icon: Tags,
    titulo: "Categorias automáticas",
    texto: "Seus gastos se organizam sozinhos por categoria — alimentação, transporte, moradia e mais.",
  },
  {
    icon: LayoutDashboard,
    titulo: "Dashboard mensal",
    texto: "Um resumo visual e simples de tudo que entrou e saiu no mês.",
  },
  {
    icon: Brain,
    titulo: "Análise de IA no fim do mês",
    texto: "Receba, em linguagem simples, o que aconteceu com seu dinheiro e o que fazer a seguir.",
  },
  {
    icon: BarChart3,
    titulo: "Comparativo de meses",
    texto: "Veja se você gastou mais ou menos que o mês passado, em valores e porcentagem.",
  },
  {
    icon: PiggyBank,
    titulo: "Metas de economia",
    texto: "Defina quanto quer guardar e acompanhe o progresso até chegar lá.",
  },
];

export function Funcionalidades() {
  return (
    <section id="funcionalidades" className="py-20">
      <Container className="flex flex-col gap-10">
        <SectionTitle
          align="center"
          eyebrow="Funcionalidades"
          title="Tudo que você precisa, nada que você não vai usar"
          className="mx-auto items-center text-center"
        />
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FUNCIONALIDADES.map((item, i) => (
            <FadeIn key={item.titulo} delay={i * 80}>
              <Card variant="interactive" className="flex h-full flex-col gap-4">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
                  <Icon icon={item.icon} />
                </span>
                <h3 className="text-h3">{item.titulo}</h3>
                <p className="text-body text-muted">{item.texto}</p>
              </Card>
            </FadeIn>
          ))}
        </div>
      </Container>
    </section>
  );
}
