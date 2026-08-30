export type Plano = "gratis" | "mensal" | "avancado";

export const PLANOS: Record<
  Plano,
  {
    nome: string;
    preco: number;
    precoLabel: string;
    recursos: string[];
  }
> = {
  gratis: {
    nome: "Grátis",
    preco: 0,
    precoLabel: "R$ 0",
    recursos: ["Anote até 30 gastos por mês", "Categorias de gastos", "Resumo simples do mês"],
  },
  mensal: {
    nome: "Mensal",
    preco: 20,
    precoLabel: "R$ 20/mês",
    recursos: [
      "Anotações ilimitadas",
      "Análise de IA no fim do mês",
      "Dashboard mensal",
      "Comparativo com o mês anterior",
      "Metas de economia",
    ],
  },
  avancado: {
    nome: "Avançado",
    preco: 40,
    precoLabel: "R$ 40/mês",
    recursos: [
      "Tudo do plano Mensal",
      "Dashboard diário ao vivo",
      "Análise por perfil (CLT ou MEI/ME)",
      "Gráficos interativos",
      "Sugestões de corte e melhoria",
    ],
  },
};

export const LIMITE_TRANSACOES_GRATIS = 30;

export function podeUsarRecurso(plano: Plano, recurso: "analiseIA" | "metas" | "dashboardAvancado" | "graficos") {
  if (recurso === "dashboardAvancado" || recurso === "graficos") return plano === "avancado";
  return plano === "mensal" || plano === "avancado";
}
