import Link from "next/link";
import { Wallet } from "lucide-react";
import { Container } from "@/components/ui/Container";

const ANO = new Date().getFullYear();

export function Footer() {
  return (
    <footer className="border-t border-border py-10">
      <Container className="flex flex-col items-center gap-6 sm:flex-row sm:justify-between">
        <Link href="/" className="flex items-center gap-2 text-foreground">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-500 text-white">
            <Wallet size={18} strokeWidth={2} />
          </span>
          <span className="text-body font-semibold">Meu Controle</span>
        </Link>

        <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
          <a href="#funcionalidades" className="text-small text-muted hover:text-foreground">
            Funcionalidades
          </a>
          <a href="#planos" className="text-small text-muted hover:text-foreground">
            Planos
          </a>
          <a href="#duvidas" className="text-small text-muted hover:text-foreground">
            Dúvidas
          </a>
          <Link href="/login" className="text-small text-muted hover:text-foreground">
            Entrar
          </Link>
        </nav>

        <p className="text-small text-muted">
          © {ANO} Avex Studio. Todos os direitos reservados.
        </p>
      </Container>
    </footer>
  );
}
