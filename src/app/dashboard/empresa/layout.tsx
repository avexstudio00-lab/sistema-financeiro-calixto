"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthProvider";

/** A área "Minha empresa" só existe pra perfil MEI/ME — usuário CLT nunca
 * deve ver o seletor de mundo nem essas telas, mesmo digitando a URL direto. */
export default function EmpresaLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { perfil, carregando } = useAuth();

  const ehNegocio = perfil?.tipo_perfil === "mei" || perfil?.tipo_perfil === "me";

  React.useEffect(() => {
    if (carregando || !perfil) return;
    if (!ehNegocio) {
      router.replace("/dashboard");
    }
  }, [carregando, perfil, ehNegocio, router]);

  if (carregando || !perfil || !ehNegocio) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="animate-spin text-primary-500" size={28} />
      </main>
    );
  }

  return <>{children}</>;
}
