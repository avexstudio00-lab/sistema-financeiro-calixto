"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthProvider";

/** A área "Minha empresa" é liberada pra qualquer perfil (CLT, MEI ou ME)
 * que estiver no plano Avançado ou Grupo — não é travada por tipo de
 * perfil, só por plano. Quem foi convidado (sócio/funcionário) também
 * acessa aqui, mesmo com o próprio plano pessoal sendo Grátis — o que
 * importa é o plano de quem convidou (`podeAcessarMinhaEmpresa`, calculado
 * no AuthProvider a partir do papel e da conta mestre). Quem não tem
 * acesso é mandado pra "Meu plano" (não é um bloqueio sem explicação — é
 * justamente onde dá pra evoluir o plano). */
export default function EmpresaLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { perfil, carregando, podeAcessarMinhaEmpresa } = useAuth();

  React.useEffect(() => {
    if (carregando || !perfil) return;
    if (!podeAcessarMinhaEmpresa) {
      router.replace("/dashboard/plano");
    }
  }, [carregando, perfil, podeAcessarMinhaEmpresa, router]);

  if (carregando || !perfil || !podeAcessarMinhaEmpresa) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="animate-spin text-primary-500" size={28} />
      </main>
    );
  }

  return <>{children}</>;
}
