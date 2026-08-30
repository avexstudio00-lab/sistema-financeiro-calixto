import { Container } from "@/components/ui/Container";
import { FadeIn } from "@/components/ui/FadeIn";
import { SectionTitle } from "@/components/ui/SectionTitle";

const PASSOS = [
  { numero: "1", titulo: "Crie sua conta grátis", texto: "Leva menos de um minuto, sem cartão de crédito." },
  { numero: "2", titulo: "Anote seus gastos", texto: "Registre entradas e saídas ao longo do mês, no seu ritmo." },
  { numero: "3", titulo: "Receba a análise de IA", texto: "No fim do mês, veja um resumo simples do que aconteceu." },
  { numero: "4", titulo: "Entenda e melhore", texto: "Use as recomendações para sobrar mais no próximo mês." },
];

export function ComoFunciona() {
  return (
    <section className="py-20">
      <Container className="flex flex-col gap-10">
        <SectionTitle
          align="center"
          eyebrow="Simples assim"
          title="Como funciona"
          className="mx-auto items-center text-center"
        />
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {PASSOS.map((passo, i) => (
            <FadeIn key={passo.numero} delay={i * 100}>
              <div className="flex flex-col gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary-500 text-button text-white">
                  {passo.numero}
                </span>
                <h3 className="text-h3">{passo.titulo}</h3>
                <p className="text-body text-muted">{passo.texto}</p>
              </div>
            </FadeIn>
          ))}
        </div>
      </Container>
    </section>
  );
}
