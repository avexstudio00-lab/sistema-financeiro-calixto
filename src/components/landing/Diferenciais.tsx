import { Heart, Brain, Users, ShieldCheck } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Card } from "@/components/ui/Card";
import { FadeIn } from "@/components/ui/FadeIn";
import { Icon } from "@/components/ui/Icon";
import { SectionTitle } from "@/components/ui/SectionTitle";

const DIFERENCIAIS = [
  {
    icon: Heart,
    titulo: "Interface amigável",
    texto: "Feito para ser simples de usar no dia a dia, sem termos técnicos e sem curva de aprendizado.",
  },
  {
    icon: Brain,
    titulo: "Análise de IA",
    texto: "No fim do mês, você recebe uma leitura clara do que aconteceu com seu dinheiro — sem precisar interpretar planilhas.",
  },
  {
    icon: Users,
    titulo: "Foco em quem ganha pouco",
    texto: "Construído pensando em quem ganha de 2 a 6 salários mínimos e sente cada real no orçamento.",
  },
  {
    icon: ShieldCheck,
    titulo: "Atendimento para CLT, MEI e ME",
    texto: "Cada perfil tem uma experiência própria, com o que realmente importa para a sua realidade financeira.",
  },
];

export function Diferenciais() {
  return (
    <section className="py-20">
      <Container className="flex flex-col gap-10">
        <SectionTitle
          align="center"
          eyebrow="Por que este e não outro"
          title="Feito para o seu momento, não para contadores"
          className="mx-auto items-center text-center"
        />
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {DIFERENCIAIS.map((item, i) => (
            <FadeIn key={item.titulo} delay={i * 80}>
              <Card className="flex h-full flex-col gap-4">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent-50 text-accent-600">
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
