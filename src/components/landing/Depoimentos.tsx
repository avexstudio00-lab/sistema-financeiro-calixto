import { Quote } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { FadeIn } from "@/components/ui/FadeIn";
import { SectionTitle } from "@/components/ui/SectionTitle";

// Espaços reservados para depoimentos reais de clientes.
// Nenhum nome, cargo ou frase abaixo é de uma pessoa real — substituir
// pelos depoimentos verdadeiros assim que estiverem disponíveis.
const DEPOIMENTOS = [
  {
    texto: "[Depoimento a ser adicionado]",
    nome: "[Nome do cliente]",
    perfil: "CLT",
  },
  {
    texto: "[Depoimento a ser adicionado]",
    nome: "[Nome do cliente]",
    perfil: "MEI",
  },
  {
    texto: "[Depoimento a ser adicionado]",
    nome: "[Nome do cliente]",
    perfil: "ME",
  },
];

export function Depoimentos() {
  return (
    <section className="py-20">
      <Container className="flex flex-col gap-10">
        <SectionTitle
          align="center"
          eyebrow="Depoimentos"
          title="Quem usa, recomenda"
          className="mx-auto items-center text-center"
        />
        <div className="grid gap-6 lg:grid-cols-3">
          {DEPOIMENTOS.map((item, i) => (
            <FadeIn key={item.nome + item.perfil} delay={i * 100}>
              <Card className="flex h-full flex-col gap-4">
                <Quote size={22} className="text-primary-300" />
                <p className="flex-1 text-body italic text-muted">{item.texto}</p>
                <div className="flex items-center gap-2">
                  <p className="text-small font-semibold text-foreground">{item.nome}</p>
                  <Badge variant="neutral" size="sm">
                    {item.perfil}
                  </Badge>
                </div>
              </Card>
            </FadeIn>
          ))}
        </div>
      </Container>
    </section>
  );
}
