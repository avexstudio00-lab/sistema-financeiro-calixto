"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Sparkles,
  PiggyBank,
  CreditCard,
  LogOut,
  Wallet,
  TrendingUp,
  Home,
  Building2,
  ShoppingCart,
  Package,
  Receipt,
  Users,
  FileText,
  ArrowLeftRight,
  User,
  type LucideIcon,
} from "lucide-react";
import { Container } from "@/components/ui/Container";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth/AuthProvider";

interface LinkNav {
  href: string;
  label: string;
  icon: LucideIcon;
}

const LINKS_PESSOAL: LinkNav[] = [
  { href: "/dashboard", label: "Painel", icon: LayoutDashboard },
  { href: "/dashboard/resumo", label: "Resumo do mês", icon: Sparkles },
  { href: "/dashboard/investimentos", label: "Investimentos", icon: TrendingUp },
  { href: "/dashboard/metas", label: "Metas", icon: PiggyBank },
  { href: "/dashboard/plano", label: "Meu plano", icon: CreditCard },
];

const LINKS_EMPRESA: LinkNav[] = [
  { href: "/dashboard/empresa", label: "Painel da empresa", icon: LayoutDashboard },
  { href: "/dashboard/empresa/vendas", label: "Vendas", icon: ShoppingCart },
  { href: "/dashboard/empresa/produtos", label: "Estoque", icon: Package },
  { href: "/dashboard/empresa/contas", label: "Contas", icon: Receipt },
  { href: "/dashboard/empresa/clientes-fornecedores", label: "Clientes", icon: Users },
  { href: "/dashboard/empresa/das", label: "DAS / Impostos", icon: FileText },
  { href: "/dashboard/empresa/fluxo-caixa", label: "Fluxo de caixa", icon: ArrowLeftRight },
];

export function DashboardNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { perfil, signOut } = useAuth();

  const ehNegocio = perfil?.tipo_perfil === "mei" || perfil?.tipo_perfil === "me";
  const mundo: "pessoal" | "negocio" = pathname?.startsWith("/dashboard/empresa") ? "negocio" : "pessoal";
  const links = mundo === "negocio" ? LINKS_EMPRESA : LINKS_PESSOAL;
  const corAtiva = mundo === "negocio" ? "bg-accent-50 text-accent-700" : "bg-primary-50 text-primary-700";
  const iniciais = perfil?.nome
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase())
    .join("");

  async function handleSignOut() {
    await signOut();
    router.push("/");
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
      <Container className="flex h-16 items-center justify-between gap-4">
        <Link href="/dashboard" className="flex shrink-0 items-center gap-2 text-foreground">
          <span
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-lg text-white",
              mundo === "negocio" ? "bg-accent-500" : "bg-primary-500"
            )}
          >
            <Wallet size={18} strokeWidth={2} />
          </span>
          <span className="hidden text-base font-semibold sm:inline">Meu Controle</span>
        </Link>

        {ehNegocio && (
          <div className="flex shrink-0 gap-1 rounded-full bg-muted/10 p-1">
            <Link
              href="/dashboard"
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-small font-medium transition-colors",
                mundo === "pessoal" ? "bg-card text-foreground shadow-sm" : "text-muted hover:text-foreground"
              )}
            >
              <Home size={14} />
              <span className="hidden sm:inline">Minha vida</span>
            </Link>
            <Link
              href="/dashboard/empresa"
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-small font-medium transition-colors",
                mundo === "negocio" ? "bg-card text-accent-700 shadow-sm" : "text-muted hover:text-foreground"
              )}
            >
              <Building2 size={14} />
              <span className="hidden sm:inline">Minha empresa</span>
            </Link>
          </div>
        )}

        <nav className="flex flex-1 items-center justify-center gap-1 overflow-x-auto">
          {links.map((link) => {
            const ativo = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-small font-medium transition-colors",
                  ativo ? corAtiva : "text-muted hover:bg-muted/10 hover:text-foreground"
                )}
              >
                <link.icon size={16} />
                <span className="hidden md:inline">{link.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="flex shrink-0 items-center gap-1">
          <ThemeToggle />
          <Link
            href="/dashboard/perfil"
            className="flex items-center gap-2 rounded-full py-1 pl-1 pr-1 text-small font-medium text-muted transition-colors hover:bg-muted/10 hover:text-foreground sm:pr-3"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-100 text-xs font-semibold text-primary-700">
              {perfil?.foto_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={perfil.foto_url} alt="" className="h-full w-full object-cover" />
              ) : (
                iniciais || <User size={14} />
              )}
            </span>
            <span className="hidden sm:inline">{perfil?.nome.split(" ")[0] ?? "..."}</span>
          </Link>
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
