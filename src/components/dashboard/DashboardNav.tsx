"use client";

import { CentralNotificacoes } from "@/components/dashboard/CentralNotificacoes";
import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BadgeDollarSign,
  BarChart3,
  CalendarClock,
  FileUp,
  LayoutDashboard,
  Sparkles,
  PiggyBank,
  Target,
  Repeat,
  HandCoins,
  MessageCircle,
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
  UserPlus,
  ScrollText,
  Boxes,
  Wrench,
  ClipboardList,
  FileDown,
  Settings2,
  type LucideIcon,
} from "lucide-react";
import { Container } from "@/components/ui/Container";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { MobileTabBar } from "@/components/dashboard/MobileTabBar";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useEmpresa } from "@/lib/empresa/EmpresaProvider";
import { BuscaGlobal } from "@/components/dashboard/BuscaGlobal";

interface LinkNav {
  href: string;
  label: string;
  icon: LucideIcon;
}

// Itens que ficam sempre visíveis (com nome) na barra fixa do rodapé no
// celular -- escolhidos pra cobrir o dia a dia mais comum de cada mundo.
// O resto continua acessível, só que atrás do botão "Mais" (ver
// MobileTabBar). No computador isso não é usado: o menu de cima já cabe
// tudo sem aperto.
const HREFS_PRINCIPAIS_MOBILE_PESSOAL = [
  "/dashboard",
  "/dashboard/resumo",
  "/dashboard/metas",
  "/dashboard/carteiras",
];
const HREFS_PRINCIPAIS_MOBILE_EMPRESA = [
  "/dashboard/empresa",
  "/dashboard/empresa/vendas",
  "/dashboard/empresa/estoque",
  "/dashboard/empresa/agenda",
  "/dashboard/empresa/servicos",
  "/dashboard/empresa/clientes-fornecedores",
];

const LINKS_PESSOAL: LinkNav[] = [
  { href: "/dashboard", label: "Painel", icon: LayoutDashboard },
  { href: "/dashboard/extrato", label: "Extrato", icon: ScrollText },
  { href: "/dashboard/importar", label: "Importar extrato", icon: FileUp },
  { href: "/dashboard/resumo", label: "Resumo do mês", icon: Sparkles },
  { href: "/dashboard/meu-relatorio", label: "Meu relatório", icon: BarChart3 },
  { href: "/dashboard/relatorio", label: "Relatório PDF", icon: FileDown },
  {
    href: "/dashboard/investimentos",
    label: "Investimentos",
    icon: TrendingUp,
  },
  { href: "/dashboard/metas", label: "Metas", icon: PiggyBank },
  { href: "/dashboard/orcamento", label: "Orçamento", icon: Target },
  { href: "/dashboard/contas-fixas", label: "Contas fixas", icon: Repeat },
  { href: "/dashboard/dividas", label: "Dívidas", icon: HandCoins },
  { href: "/dashboard/carteiras", label: "Carteiras", icon: Wallet },
  // Meu plano, Segurança e Privacidade viraram abas do Perfil (14/nov/2026,
  // itens 3.1–3.3). Fica um único atalho pro Perfil aqui (no celular ele
  // aparece no "Mais"; no topo também dá pra chegar pela foto).
  { href: "/dashboard/perfil", label: "Perfil e conta", icon: User },
];

// Só quem é dono da própria conta convida gente — sócio/funcionário nunca
// veem esse link, mesmo estando na conta de alguém que tem o plano Grupo.
// Mora dentro de "Minha empresa" desde 14/nov/2026 (item 3.4): convidar
// sócio/funcionário é assunto do negócio, não da vida pessoal.
const LINK_EQUIPE: LinkNav = {
  href: "/dashboard/empresa/equipe",
  label: "Minha equipe",
  icon: UserPlus,
};

// Links do mundo "negócio" que são financeiro (contas a pagar/receber, DAS
// e fluxo de caixa) — escondidos de quem entrou como funcionário, que só
// pode ver/mexer em estoque e vendas (o RLS já bloqueia essas telas por
// trás, isso aqui só evita mostrar um link que vai dar em tela vazia).
const LINKS_EMPRESA_FINANCEIRO = new Set([
  "/dashboard/empresa/contas-fixas",
  "/dashboard/empresa/vendedores",
  "/dashboard/empresa/relatorio",
  "/dashboard/empresa/contas",
  "/dashboard/empresa/cobranca",
  "/dashboard/empresa/das",
  "/dashboard/empresa/fluxo-caixa",
  "/dashboard/empresa/extrato",
  "/dashboard/empresa/orcamentos",
  "/dashboard/empresa/configuracoes",
]);

// Itens que dependem do ramo de atividade da empresa (item 5.5): quem só
// presta serviço não vê estoque/produtos; quem só vende produto não vê o
// catálogo de serviços.
const LINKS_SO_PRODUTO = new Set([
  "/dashboard/empresa/produtos",
  "/dashboard/empresa/estoque",
]);
const LINKS_SO_SERVICO = new Set(["/dashboard/empresa/servicos", "/dashboard/empresa/agenda"]);

const LINKS_EMPRESA: LinkNav[] = [
  // Rótulo curto de propósito ("Empresa", não "Painel da empresa"): esse
  // mesmo texto alimenta tanto o menu de cima (onde cabia sem problema)
  // quanto a barra fixa do rodapé no celular (MobileTabBar) -- lá, sendo
  // o primeiro item (encostado na borda esquerda da tela), um rótulo
  // comprido centralizado sem largura própria vazava pra fora da tela e
  // ficava cortado pelo `overflow-x: hidden` global (ver também o fix do
  // `<span>` em MobileTabBar.tsx). O título da própria página continua
  // "Painel da empresa" (h1 em dashboard/empresa/page.tsx) -- só o rótulo
  // do menu/barra mudou.
  { href: "/dashboard/empresa", label: "Empresa", icon: LayoutDashboard },
  { href: "/dashboard/empresa/vendas", label: "Vendas", icon: ShoppingCart },
  { href: "/dashboard/empresa/agenda", label: "Agenda", icon: CalendarClock },
  { href: "/dashboard/empresa/vendedores", label: "Vendedores", icon: BadgeDollarSign },
  {
    href: "/dashboard/empresa/orcamentos",
    label: "Orçamentos",
    icon: ClipboardList,
  },
  { href: "/dashboard/empresa/servicos", label: "Serviços", icon: Wrench },
  { href: "/dashboard/empresa/produtos", label: "Produtos", icon: Package },
  { href: "/dashboard/empresa/estoque", label: "Estoque", icon: Boxes },
  {
    href: "/dashboard/empresa/clientes-fornecedores",
    label: "Clientes",
    icon: Users,
  },
  { href: "/dashboard/empresa/contas", label: "Contas", icon: Receipt },
  {
    href: "/dashboard/empresa/cobranca",
    label: "Cobrança",
    icon: MessageCircle,
  },
  {
    href: "/dashboard/empresa/contas-fixas",
    label: "Contas fixas",
    icon: Repeat,
  },
  { href: "/dashboard/empresa/extrato", label: "Extrato", icon: ScrollText },
  { href: "/dashboard/empresa/das", label: "DAS / Impostos", icon: FileText },
  {
    href: "/dashboard/empresa/fluxo-caixa",
    label: "Fluxo de caixa",
    icon: ArrowLeftRight,
  },
  { href: "/dashboard/empresa/relatorio", label: "Relatório", icon: BarChart3 },
  {
    href: "/dashboard/empresa/configuracoes",
    label: "Perfil da empresa",
    icon: Settings2,
  },
];

export function DashboardNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { perfil, papel, signOut } = useAuth();
  const { empresas, empresaAtivaId, selecionarEmpresa, ramo } = useEmpresa();

  const mundo: "pessoal" | "negocio" = pathname?.startsWith(
    "/dashboard/empresa",
  )
    ? "negocio"
    : "pessoal";
  // IMPORTANTE: os links da empresa são memoizados por `papel`/`ramo` — um
  // array novo a cada render faria o useEffect que depende de `links` rodar
  // em loop (isso já travou a navegação por clique no menu uma vez).
  const linksPessoal = LINKS_PESSOAL;
  const linksEmpresa = React.useMemo(
    () =>
      (papel === "dono" ? [...LINKS_EMPRESA, LINK_EQUIPE] : LINKS_EMPRESA).filter(
        (l) =>
          !(papel === "funcionario" && LINKS_EMPRESA_FINANCEIRO.has(l.href)),
      )
        .filter((l) => !(ramo === "servicos" && LINKS_SO_PRODUTO.has(l.href)))
        .filter((l) => !(ramo === "produtos" && LINKS_SO_SERVICO.has(l.href))),
    [papel, ramo],
  );
  const links = mundo === "negocio" ? linksEmpresa : linksPessoal;
  const corAtiva =
    mundo === "negocio"
      ? "bg-accent-50 text-accent-700"
      : "bg-primary-50 text-primary-700";

  // Divide os links do mundo atual entre "principais" (barra fixa do
  // rodapé no celular) e "mais" (o resto, atrás do botão "Mais") --
  // reaproveitando `links`, que já respeita o filtro por papel
  // (funcionário não vê os financeiros da empresa, só dono vê "Minha
  // equipe").
  const hrefsPrincipaisMobile =
    mundo === "negocio"
      ? HREFS_PRINCIPAIS_MOBILE_EMPRESA
      : HREFS_PRINCIPAIS_MOBILE_PESSOAL;
  const principaisMobile = hrefsPrincipaisMobile
    .map((href) => links.find((link) => link.href === href))
    .filter((link): link is LinkNav => Boolean(link))
    .slice(0, 4);
  const maisMobile = links.filter(
    (link) => !principaisMobile.some((p) => p.href === link.href),
  );
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
    <>
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur print:hidden md:static">
        {/* Sem "justify-between": no celular, com o menu de cima escondido (vira
          a barra fixa do rodapé), sobrava um vão vazio grande no meio do
          cabeçalho porque cada bloco (logo, seletor de mundo, ícones) ficava
          espalhado em pontos fixos da largura toda. Agrupando logo + seletor
          à esquerda (sem justify-between) e empurrando os ícones pra direita
          só com "ml-auto" no bloco deles, o cabeçalho fica com dois grupos
          compactos em vez de três pontos soltos -- no computador o menu
          `flex-1` do meio continua absorvendo o espaço extra normalmente,
          então nada muda lá. */}
        <Container full className="flex h-16 items-center gap-4">
          <Link
            href="/dashboard"
            className="flex shrink-0 items-center gap-2 text-foreground"
          >
            <span
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-lg text-white",
                mundo === "negocio" ? "bg-accent-500" : "bg-primary-500",
              )}
            >
              <Wallet size={18} strokeWidth={2} />
            </span>
            <span className="hidden text-base font-semibold sm:inline">
              Meu Controle
            </span>
          </Link>

          {/* Seletor de mundo — visível pra qualquer perfil (CLT, MEI ou ME).
            "Minha empresa" é liberada só no plano Avançado, mas o seletor
            aparece pra todo mundo como convite: quem ainda não tem o plano
            cai em "Meu plano" ao clicar (ver empresa/layout.tsx). */}
          <div className="flex shrink-0 gap-1 rounded-full bg-muted/10 p-1">
            <Link
              href="/dashboard"
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-small font-medium transition-colors",
                mundo === "pessoal"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted hover:text-foreground",
              )}
            >
              <Home size={14} />
              <span className="hidden sm:inline">Minha vida</span>
            </Link>
            <Link
              href="/dashboard/empresa"
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-small font-medium transition-colors",
                mundo === "negocio"
                  ? "bg-card text-accent-700 shadow-sm"
                  : "text-muted hover:text-foreground",
              )}
            >
              <Building2 size={14} />
              <span className="hidden sm:inline">Minha empresa</span>
            </Link>
          </div>

          {/* Seletor de empresa (planos Bi-Empresa, item 5.4) — só aparece na
            área "Minha empresa" e só pra quem tem mais de uma empresa. */}
          {mundo === "negocio" && empresas.length > 1 && (
            <select
              aria-label="Empresa"
              value={empresaAtivaId ?? "todas"}
              onChange={(e) =>
                selecionarEmpresa(
                  e.target.value === "todas" ? null : e.target.value,
                )
              }
              className="h-9 min-w-0 max-w-[150px] shrink truncate rounded-full border border-border bg-card px-3 text-small font-medium text-foreground focus:border-primary-500 focus:outline-none"
            >
              {empresas.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome_fantasia}
                </option>
              ))}
              <option value="todas">Todas (consolidado)</option>
            </select>
          )}

          <div className="ml-auto flex shrink-0 items-center gap-1">
            <BuscaGlobal />
            <CentralNotificacoes />
            <ThemeToggle />
            <Link
              href="/dashboard/perfil"
              className="flex items-center gap-2 rounded-full py-1 pl-1 pr-1 text-small font-medium text-muted transition-colors hover:bg-muted/10 hover:text-foreground sm:pr-3"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-100 text-xs font-semibold text-primary-700">
                {perfil?.foto_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={perfil.foto_url}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  iniciais || <User size={14} />
                )}
              </span>
              <span className="hidden sm:inline">
                {perfil?.nome.split(" ")[0] ?? "..."}
              </span>
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
        {/* Menu do computador/tablet (13/nov/2026): ganhou uma linha própria
          embaixo do cabeçalho e QUEBRA LINHA quando não cabe. Antes ele
          dividia a mesma linha com o seletor de empresa e os ícones e, numa
          janela estreita no PC, era espremido até sumir (sem barra de
          rolagem e sem gesto de arrastar no mouse, não tinha como chegar em
          Vendas, Orçamentos, Serviços...). Abaixo do `md` quem cuida é a
          barra fixa do rodapé (MobileTabBar). */}
        <Container full className="hidden pb-2 md:block">
          <nav aria-label="Menu" className="flex flex-wrap items-center gap-1">
            {links.map((link) => {
              const ativo = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={ativo ? "page" : undefined}
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-small font-medium transition-colors",
                    ativo
                      ? corAtiva
                      : "text-muted hover:bg-muted/10 hover:text-foreground",
                  )}
                >
                  <link.icon size={15} className="shrink-0" />
                  <span>{link.label}</span>
                </Link>
              );
            })}
          </nav>
        </Container>
      </header>

      <MobileTabBar
        principais={principaisMobile}
        mais={maisMobile}
        mundo={mundo}
      />
    </>
  );
}
