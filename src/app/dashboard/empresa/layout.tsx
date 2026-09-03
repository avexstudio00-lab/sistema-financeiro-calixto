"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { podeAcessarNegocio } from "@/lib/planos";

/** A área "Minha empresa" só existe pra perfil MEI/ME no plano Avançado —
 * usuário CLT nunca deve ver o seletor de mundo nem essas telas, mesmo
 * digitando a URL direto; e um MEI/ME num plano abaixo do Avançado é
 * mandado pra "Meu plano" (não pra "Meu plano" travado sem explicação —
 * é justamente onde ele consegue evoluir o plano). */
export default function EmpresaLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { perfil, carregando } = useAuth();

  const ehNegocio = perfil?.tipo_perfil === "mei" || perfil?.tipo_perfil === "me";
  const podeAcessar = perfil ? podeAcessarNegocio(perfil.tipo_perfil, perfil.plano) : false;

  React.useEffect(() => {
    if (carregando || !perfil) return;
    if (!ehNegocio) {
      router.replace("/dashboard");
    } else if (!podeAcessar) {
      router.replace("/dashboard/plano");
    }
  }, [carregando, perfil, ehNegocio, podeAcessar, router]);

  if (carregando || !perfil || !podeAcessar) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="animate-spin text-primary-500" size={28} />
      </main>
    );
  }

  return <>{children}</>;
}
