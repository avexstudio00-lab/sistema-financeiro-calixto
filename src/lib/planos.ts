export type Plano = "gratis" | "mensal" | "clt" | "avancado";

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
  clt: {
    nome: "CLT",
    preco: 30,
    precoLabel: "R$ 30/mês",
    recursos: [
      "Tudo do plano Mensal",
      "Dashboard diário ao vivo",
      "Gráficos interativos",
      "Sugestões de corte e melhoria",
      "Sem controle de estoque/negócio — ideal pra quem é CLT",
    ],
  },
  avancado: {
    nome: "Avançado",
    preco: 50,
    precoLabel: "R$ 50/mês",
    recursos: [
      "Tudo do plano CLT",
      "Minha empresa: vendas, estoque, contas e fluxo de caixa do negócio",
      "Ideal pra quem é MEI ou ME",
    ],
  },
};

export const LIMITE_TRANSACOES_GRATIS = 30;

export function podeUsarRecurso(plano: Plano, recurso: "analiseIA" | "metas" | "dashboardAvancado" | "graficos") {
  if (recurso === "dashboardAvancado" || recurso === "graficos") return plano === "clt" || plano === "avancado";
  return plano === "mensal" || plano === "clt" || plano === "avancado";
}

/**
 * Nível numérico do plano, usado para liberar recursos de forma gradual
 * (ex: gráficos do painel). 0 = Grátis, 1 = Mensal, 2 = CLT/Avançado (ambos
 * têm o mesmo nível de dashboard/gráficos — o que diferencia CLT de
 * Avançado não é o dashboard, é o acesso a "Minha empresa", ver
 * `podeAcessarNegocio` abaixo).
 */
export function nivelPlano(plano: Plano): number {
  if (plano === "avancado" || plano === "clt") return 2;
  if (plano === "mensal") return 1;
  return 0;
}

/**
 * "Minha empresa" (vendas, estoque, contas, DAS, fluxo de caixa) só é
 * liberada pra quem É MEI/ME *e* está no plano Avançado — mesmo um perfil
 * MEI/ME nos planos Grátis/Mensal/CLT não tem acesso a essa área, porque
 * o controle de estoque/negócio é justamente o que diferencia o Avançado.
 */
export function podeAcessarNegocio(tipoPerfil: "clt" | "mei" | "me" | null | undefined, plano: Plano): boolean {
  return (tipoPerfil === "mei" || tipoPerfil === "me") && plano === "avancado";
}
