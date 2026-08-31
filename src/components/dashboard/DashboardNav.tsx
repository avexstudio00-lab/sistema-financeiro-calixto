"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, Sparkles, PiggyBank, CreditCard, LogOut, Wallet } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth/AuthProvider";

const LINKS = [
  { href: "/dashboard", label: "Painel", icon: LayoutDashboard },
  { href: "/dashboard/resumo", label: "Resumo do mês", icon: Sparkles },
  { href: "/dashboard/metas", label: "Metas", icon: PiggyBank },
  { href: "/dashboard/plano", label: "Meu plano", icon: CreditCard },
];

export function DashboardNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { perfil, signOut } = useAuth();

  async function handleSignOut() {
    await signOut();
    router.push("/");
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
      <Container className="flex h-16 items-center justify-between gap-4">
        <Link href="/dashboard" className="flex shrink-0 items-center gap-2 text-foreground">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-500 text-white">
            <Wallet size={18} strokeWidth={2} />
          </span>
          <span className="hidden text-base font-semibold sm:inline">Meu Controle</span>
        </Link>

        <nav className="flex flex-1 items-center justify-center gap-1 overflow-x-auto">
          {LINKS.map((link) => {
            const ativo = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-small font-medium transition-colors",
                  ativo ? "bg-primary-50 text-primary-700" : "text-muted hover:bg-muted/10 hover:text-foreground"
                )}
              >
                <link.icon size={16} />
                <span className="hidden md:inline">{link.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="flex shrink-0 items-center gap-1">
          <span className="hidden text-small text-muted sm:inline mr-2">
            Olá, {perfil?.nome.split(" ")[0] ?? "..."}
          </span>
          <ThemeToggle />
          <button
            type="button"
            onClick={handleSignOut}
            aria-label="Sair"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-muted/10 hover:text-rose-600"
          >
            <LogOut size={18} />
          </button>
        </div>
      </Container>
    </header>
  );
}
