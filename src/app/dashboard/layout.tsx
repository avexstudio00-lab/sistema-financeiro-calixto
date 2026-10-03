"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { DashboardNav } from "@/components/dashboard/DashboardNav";
import { EmpresaProvider, useEmpresa } from "@/lib/empresa/EmpresaProvider";
import { BotaoLancamentoGlobal } from "@/components/dashboard/BotaoLancamentoGlobal";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, perfil, carregando, recuperacaoSenhaAtiva } = useAuth();

  React.useEffect(() => {
    if (carregando) return;
    // Sessão que veio só do link de "esqueci minha senha" não dá acesso ao
    // painel enquanto a senha nova não for definida de verdade — senão dá
    // pra entrar na conta só recebendo esse e-mail, sem provar senha
    // nenhuma (achado do usuário em 11/set/2026, ver também login/page.tsx
    // e redefinir-senha/page.tsx).
    if (recuperacaoSenhaAtiva) {
      router.replace("/redefinir-senha");
      return;
    }
    if (!user) {
      router.replace("/login");
      return;
    }
    if (!perfil || !perfil.tipo_perfil) {
      router.replace("/onboarding");
    }
  }, [carregando, user, perfil, recuperacaoSenhaAtiva, router]);

  if (carregando || recuperacaoSenhaAtiva || !user || !perfil || !perfil.tipo_perfil) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="animate-spin text-primary-500" size={28} />
      </main>
    );
  }

  return (
    <EmpresaProvider>
      <ConteudoDashboard>{children}</ConteudoDashboard>
    </EmpresaProvider>
  );
}

/** Separado só pra poder usar `useEmpresa()` (precisa estar dentro do
 * provider). Na área "Minha empresa", as telas são remontadas quando a
 * empresa escolhida muda (`key`), assim cada uma recarrega os dados certos
 * sem precisar saber disso. */
function ConteudoDashboard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { empresaAtivaId, carregado } = useEmpresa();
  const naEmpresa = pathname?.startsWith("/dashboard/empresa") ?? false;

  return (
    <div className="min-h-screen bg-background">
      <DashboardNav />
      {/* pb maior no celular pra sobrar espaço acima da barra fixa do
          rodapé (MobileTabBar) + área segura do iPhone com notch/indicador
          home; no computador não tem essa barra, então volta ao normal. */}
      {naEmpresa && !carregado ? (
        <main className="flex min-h-[60vh] items-center justify-center">
          <Loader2 className="animate-spin text-primary-500" size={28} />
        </main>
      ) : (
        <main key={naEmpresa ? empresaAtivaId ?? "todas" : "pessoal"} className="pb-32 md:pb-24">
          {children}
        </main>
      )}
      <BotaoLancamentoGlobal />
    </div>
  );
}
