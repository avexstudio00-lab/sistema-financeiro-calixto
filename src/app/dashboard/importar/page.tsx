"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { Container } from "@/components/ui/Container";
import { ImportadorCsv } from "@/components/dashboard/importar/ImportadorCsv";

function Conteudo() {
  const parametros = useSearchParams();
  const mundo = parametros?.get("mundo") === "negocio" ? "negocio" : "pessoal";
  return <ImportadorCsv mundoInicial={mundo} />;
}

/** Importar lançamentos de um CSV (especificação de 05/out/2026). */
export default function ImportarPage() {
  return (
    <Container full className="flex flex-col gap-6 py-8">
      <div>
        <h1 className="text-h2 text-foreground">Importar CSV</h1>
        <p className="text-body text-muted">Traga lançamentos de um extrato do banco ou de uma planilha. Você confere tudo antes de gravar.</p>
      </div>
      <React.Suspense fallback={null}>
        <Conteudo />
      </React.Suspense>
    </Container>
  );
}
