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

/** Importar extrato (OFX/CSV) — 05/out/2026, leitura inteligente em 09/nov/2026. */
export default function ImportarPage() {
  return (
    <Container full className="flex flex-col gap-6 py-8">
      <div>
        <h1 className="text-h2 text-foreground">Importar extrato</h1>
        <p className="text-body text-muted">Jogue o extrato do banco ou a fatura do cartão (dos últimos 15 dias, do mês...) e o app lança tudo sozinho: separa PIX, cartão, boleto e fatura, sugere categoria e liga às suas dívidas. Você confere antes de gravar.</p>
      </div>
      <React.Suspense fallback={null}>
        <Conteudo />
      </React.Suspense>
    </Container>
  );
}
