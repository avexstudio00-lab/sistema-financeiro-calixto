"use client";

import * as React from "react";
import Link from "next/link";
import { Menu, X, Wallet } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/auth/AuthProvider";

const LINKS = [
  { href: "#funcionalidades", label: "Funcionalidades" },
  { href: "#planos", label: "Planos" },
  { href: "#duvidas", label: "Dúvidas" },
];

export function Header() {
  const [menuAberto, setMenuAberto] = React.useState(false);
  const { user, perfil } = useAuth();

  return (
    <header className="sticky top-0 z-50 border-b border-slate-100 bg-background/90 backdrop-blur">
      <Container className="flex h-16 items-center justify-between">
        <Link href="/" className="flex items-center gap-2 text-foreground">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-500 text-white">
            <Wallet size={18} strokeWidth={2} />
          </span>
          <span className="text-h3 text-base font-semibold">Meu Controle</span>
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-small font-medium text-muted transition-colors hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          {user ? (
            <Link href="/dashboard">
              <Button variant="secondary" size="sm">
                {perfil?.nome ? `Olá, ${perfil.nome.split(" ")[0]}` : "Meu painel"}
              </Button>
            </Link>
          ) : (
            <Link href="/cadastro">
              <Button size="sm">Começar grátis</Button>
            </Link>
          )}
        </div>

        <button
          type="button"
          aria-label={menuAberto ? "Fechar menu" : "Abrir menu"}
          className="flex h-10 w-10 items-center justify-center rounded-lg text-foreground md:hidden"
          onClick={() => setMenuAberto((v) => !v)}
        >
          {menuAberto ? <X size={22} /> : <Menu size={22} />}
        </button>
      </Container>

      {menuAberto && (
        <div className="border-t border-slate-100 bg-background md:hidden">
          <Container className="flex flex-col gap-1 py-4">
            {LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setMenuAberto(false)}
                className="rounded-lg px-3 py-3 text-body font-medium text-foreground hover:bg-primary-50"
              >
                {link.label}
              </a>
            ))}
            <div className="mt-2 px-3">
              {user ? (
                <Link href="/dashboard" onClick={() => setMenuAberto(false)}>
                  <Button className="w-full">Meu painel</Button>
                </Link>
              ) : (
                <Link href="/cadastro" onClick={() => setMenuAberto(false)}>
                  <Button className="w-full">Começar grátis</Button>
                </Link>
              )}
            </div>
          </Container>
        </div>
      )}
    </header>
  );
}
