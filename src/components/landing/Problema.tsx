import { Container } from "@/components/ui/Container";
import { FadeIn } from "@/components/ui/FadeIn";
import { SectionTitle } from "@/components/ui/SectionTitle";

export function Problema() {
  return (
    <section className="py-20">
      <Container>
        <FadeIn>
          <div className="mx-auto max-w-2xl text-center">
            <SectionTitle
              align="center"
              title="Você sabe para onde seu dinheiro vai todo mês?"
              description="Quem ganha de 2 a 6 salários mínimos sente na pele a diferença de um mês pro
              outro, mas raramente tem tempo — ou paciência — para abrir uma planilha e organizar
              tudo. O resultado é sempre a mesma pergunta no fim do mês: para onde foi o dinheiro?"
            />
          </div>
        </FadeIn>
      </Container>
    </section>
  );
}
