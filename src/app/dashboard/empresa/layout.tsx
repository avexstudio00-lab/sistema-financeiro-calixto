"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { podeAcessarNegocio } from "@/lib/planos";

/** A área "Minha empresa" é liberada pra qualquer perfil (CLT, MEI ou ME)
 * que estiver no plano Avançado — não é mais travada por tipo de perfil,
 * só por plano (ver `podeAcessarNegocio`). Quem não está no Avançado é
 * mandado pra "Meu plano" (não é um bloqueio sem explicação — é
 * justamente onde dá pra evoluir o plano). */
export default function EmpresaLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { perfil, carregando } = useAuth();

  const podeAcessar = perfil ? podeAcessarNegocio(perfil.plano) : false;

  React.useEffect(() => {
    if (carregando || !perfil) return;
    if (!podeAcessar) {
      router.replace("/dashboard/plano");
    }
  }, [carregando, perfil, podeAcessar, router]);

  if (carregando || !perfil || !podeAcessar) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="animate-spin text-primary-500" size={28} />
      </main>
    );
  }

  return <>{children}</>;
}
