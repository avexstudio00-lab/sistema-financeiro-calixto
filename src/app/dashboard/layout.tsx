"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { DashboardNav } from "@/components/dashboard/DashboardNav";

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
    <div className="min-h-screen bg-background">
      <DashboardNav />
      <main className="pb-24">{children}</main>
    </div>
  );
}
