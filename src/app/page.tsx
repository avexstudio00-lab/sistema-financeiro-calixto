import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { SectionTitle } from "@/components/ui/SectionTitle";

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background">
      <Container className="flex max-w-2xl flex-col items-center gap-6 py-24 text-center">
        <Badge variant="accent">Fase 1 · Design system</Badge>
        <SectionTitle
          align="center"
          title="A base do seu controle financeiro está pronta"
          description="Cores, tipografia e componentes já estão no ar. As telas de lançamentos e o dashboard vêm na próxima etapa."
        />
        <Link href="/design-system">
          <Button size="lg">
            Ver design system
            <ArrowRight size={18} strokeWidth={2} />
          </Button>
        </Link>
      </Container>
    </main>
  );
}
