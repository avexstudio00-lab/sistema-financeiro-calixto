"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthProvider";
import { ExtratoCompleto } from "@/components/dashboard/ExtratoCompleto";

export default function ExtratoEmpresaPage() {
  const { papel } = useAuth();
  const router = useRouter();

  // Extrato do negócio é financeiro (mesma categoria de Contas/DAS/Fluxo de
  // caixa) — escondido de funcionário, que só vê Estoque/produtos e Vendas
  // (o RLS já bloqueia no banco; isso aqui só evita uma tela quebrada se a
  // pessoa digitar a URL direto).
  React.useEffect(() => {
    if (papel === "funcionario") router.replace("/dashboard/empresa");
  }, [papel, router]);

  return <ExtratoCompleto mundo="negocio" />;
}
