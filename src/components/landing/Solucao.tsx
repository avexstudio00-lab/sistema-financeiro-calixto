import { Sparkles } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { FadeIn } from "@/components/ui/FadeIn";
import { Icon } from "@/components/ui/Icon";
import { SectionTitle } from "@/components/ui/SectionTitle";

export function Solucao() {
  return (
    <section className="py-20">
      <Container>
        <FadeIn>
          <div className="grid items-center gap-10 rounded-3xl bg-card p-8 shadow-soft sm:p-12 lg:grid-cols-[auto,1fr]">
            <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-50 text-primary-600">
              <Icon icon={Sparkles} size="lg" />
            </span>
            <div className="flex flex-col gap-3">
              <SectionTitle
                title="Não é uma planilha. É um controle financeiro feito para pessoas comuns."
                description="Anote seus gastos em segundos, direto do celular, e receba tudo organizado
                automaticamente. Sem fórmulas, sem colunas confusas — só a clareza que você precisa
                pra decidir melhor no dia a dia."
              />
            </div>
          </div>
        </FadeIn>
      </Container>
    </section>
  );
}
