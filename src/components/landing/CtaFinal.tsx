import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { FadeIn } from "@/components/ui/FadeIn";

export function CtaFinal() {
  return (
    <section className="py-20">
      <Container>
        <FadeIn>
          <div className="flex flex-col items-center gap-6 rounded-3xl bg-secondary px-6 py-16 text-center sm:px-12">
            <h2 className="text-h2 max-w-xl text-white">
              Comece agora a entender para onde seu dinheiro vai
            </h2>
            <p className="max-w-md text-body text-primary-100">
              Grátis para começar. Sem cartão de crédito, sem complicação.
            </p>
            <Link href="/cadastro">
              <Button size="lg" className="bg-white text-secondary hover:bg-primary-50">
                Criar minha conta grátis
                <ArrowRight size={18} strokeWidth={2} />
              </Button>
            </Link>
          </div>
        </FadeIn>
      </Container>
    </section>
  );
}
