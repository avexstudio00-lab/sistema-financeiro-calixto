"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MoreHorizontal, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface LinkNav {
  href: string;
  label: string;
  icon: LucideIcon;
}

interface MobileTabBarProps {
  /** Itens que ficam sempre visíveis, com ícone + nome, na barra de baixo. */
  principais: LinkNav[];
  /** Itens secundários, acessíveis pelo botão "Mais". */
  mais: LinkNav[];
  mundo: "pessoal" | "negocio";
}

// Barra de navegação fixa no rodapé, só pro celular (o menu de cima
// continua igual no computador, onde já cabe tudo direitinho). Resolve a
// reclamação de "fica apertado, tenho que chutar onde vou clicar": em vez
// de ícones espremidos rolando na horizontal, os itens principais ficam
// sempre visíveis com nome embaixo do ícone, e o resto mora atrás do
// botão "Mais" -- nada some, só fica organizado.
export function MobileTabBar({ principais, mais, mundo }: MobileTabBarProps) {
  const pathname = usePathname();
  const [maisAberto, setMaisAberto] = React.useState(false);

  // Fecha o painel "Mais" sempre que a rota muda -- sem isso ele ficaria
  // aberto flutuando por cima da página nova depois de clicar num link.
  React.useEffect(() => {
    setMaisAberto(false);
  }, [pathname]);

  // Fecha com Esc, igual qualquer menu/sheet -- acessibilidade básica.
  React.useEffect(() => {
    if (!maisAberto) return;
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === "Escape") setMaisAberto(false);
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [maisAberto]);

  const corAtiva = mundo === "negocio" ? "text-accent-600" : "text-primary-600";
  const maisTemAtivo = mais.some((link) => link.href === pathname);

  return (
    <>
      {maisAberto && (
        <button
          type="button"
          aria-label="Fechar menu"
          className="fixed inset-0 z-40 bg-slate-950/40 md:hidden"
          onClick={() => setMaisAberto(false)}
        />
      )}

      {maisAberto && (
        <div
          role="menu"
          className="fixed inset-x-0 bottom-16 z-50 max-h-[60vh] overflow-y-auto rounded-t-2xl border-t border-border bg-card p-3 shadow-lg md:hidden"
        >
          <div className="grid grid-cols-2 gap-2">
            {mais.map((link) => {
              const ativo = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  role="menuitem"
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-3 text-small font-medium transition-colors",
                    ativo ? corAtiva : "text-muted hover:bg-muted/10 hover:text-foreground"
                  )}
                >
                  <link.icon size={18} />
                  {link.label}
                </Link>
              );
            })}
          </div>
        </div>
      )}

      <nav
        aria-label="Navegação principal"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur pb-[env(safe-area-inset-bottom)] print:hidden md:hidden"
      >
        <div className="flex items-stretch justify-around">
          {principais.map((link) => {
            const ativo = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 py-2.5 text-[12px] font-medium leading-none transition-colors",
                  ativo ? corAtiva : "text-muted"
                )}
              >
                <link.icon size={22} strokeWidth={ativo ? 2.25 : 2} />
                {/* `w-full` é o que faz o `truncate` funcionar de verdade:
                    sem largura própria, um <span> filho de flex-col com
                    items-center cresce pro tamanho do próprio texto (sem
                    quebrar linha) e ignora a largura da coluna -- pro
                    primeiro item da barra (encostado em x=0), isso fazia o
                    texto vazar pra fora da tela à esquerda e ser cortado
                    pelo `overflow-x: hidden` global (mesma causa raiz da
                    seção 23 do doc de contexto, só que aqui em vez do
                    cabeçalho). Com `w-full`, o texto fica preso à largura
                    real da coluna e agora sim trunca com reticências
                    quando não cabe, sem nunca sair da tela. */}
                <span className="w-full truncate px-0.5 text-center">{link.label}</span>
              </Link>
            );
          })}
          {mais.length > 0 && (
            <button
              type="button"
              onClick={() => setMaisAberto((v) => !v)}
              aria-expanded={maisAberto}
              className={cn(
                "flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 py-2.5 text-[12px] font-medium leading-none transition-colors",
                maisAberto || maisTemAtivo ? corAtiva : "text-muted"
              )}
            >
              <MoreHorizontal size={22} strokeWidth={maisAberto || maisTemAtivo ? 2.25 : 2} />
              <span>Mais</span>
            </button>
          )}
        </div>
      </nav>
    </>
  );
}
