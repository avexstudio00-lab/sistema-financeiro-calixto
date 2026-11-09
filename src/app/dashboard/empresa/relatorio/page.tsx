"use client";

import { RelatorioView } from "@/components/dashboard/RelatorioView";

/** Relatório da empresa: mesmo relatório explicado, só a seção Minha empresa. */
export default function RelatorioEmpresaPage() {
  return <RelatorioView escopoFixo="empresa" />;
}
