export function formatarMoeda(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatarMoedaCompacta(valor: number): string {
  const abs = Math.abs(valor);
  if (abs >= 1000) {
    return `${valor < 0 ? "-" : ""}R$${(abs / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}k`;
  }
  return formatarMoeda(valor);
}

export const NOMES_MES = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
] as const;
