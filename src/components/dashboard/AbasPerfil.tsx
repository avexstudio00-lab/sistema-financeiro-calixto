"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CreditCard, Lock, ShieldCheck, User } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Abas do Perfil (14/nov/2026, itens 3.1–3.3): Meu plano, Segurança e
 * Privacidade saíram do menu principal e viraram abas dentro do Perfil
 * (acessado pela foto no canto de cima). As rotas continuam as mesmas, então
 * links antigos e notificações seguem funcionando.
 */
const ABAS = [
  { href: "/dashboard/perfil", label: "Perfil", icon: User },
  { href: "/dashboard/plano", label: "Meu plano", icon: CreditCard },
  { href: "/dashboard/seguranca", label: "Segurança", icon: ShieldCheck },
  { href: "/dashboard/privacidade", label: "Privacidade", icon: Lock },
] as const;

export function AbasPerfil() {
  const pathname = usePathname();
  return (
    <nav aria-label="Seções do perfil" className="-mx-1 overflow-x-auto pb-1">
      <div className="flex w-max min-w-full gap-1 rounded-2xl bg-muted/10 p-1">
        {ABAS.map((aba) => {
          const ativo = pathname === aba.href;
          return (
            <Link
              key={aba.href}
              href={aba.href}
              aria-current={ativo ? "page" : undefined}
              className={cn(
                "flex flex-1 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-2 text-small font-medium transition-colors",
                ativo ? "bg-card text-foreground shadow-sm" : "text-muted hover:text-foreground",
              )}
            >
              <aba.icon size={15} className="shrink-0" />
              {aba.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
