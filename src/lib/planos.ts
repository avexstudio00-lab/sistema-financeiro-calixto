export type Plano = "gratis" | "mensal" | "clt" | "avancado" | "avancado_multi" | "grupo" | "grupo_multi";

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
    preco: 10,
    precoLabel: "R$ 10/mês",
    recursos: [
      "Anotações ilimitadas",
      "Análise de IA no fim do mês",
      "Dashboard mensal",
      "Comparativo com o mês anterior",
      "Metas de economia",
    ],
  },
  clt: {
    nome: "Completo",
    preco: 20,
    precoLabel: "R$ 20/mês",
    recursos: [
      "Tudo do plano Mensal",
      "Dashboard diário ao vivo",
      "Gráficos interativos",
      "Sugestões de corte e melhoria",
      "Sem controle de estoque/negócio — vale pra CLT, MEI ou ME",
    ],
  },
  avancado: {
    nome: "Avançado",
    preco: 40,
    precoLabel: "R$ 40/mês",
    recursos: [
      "Tudo do plano Completo",
      "Minha empresa: vendas, estoque, contas e fluxo de caixa do negócio",
      "Ideal pra quem tem negócio — MEI, ME ou CLT investindo por conta própria",
    ],
  },
  avancado_multi: {
    nome: "Negócio Bi-Empresa",
    preco: 45,
    precoLabel: "R$ 45/mês",
    recursos: [
      "Módulo pessoal completo",
      "Até 2 contas PJ distintas + 1 perfil pessoal",
      "Fluxo de caixa, estoque, vendas, clientes e DRE (resultado do mês) em cada empresa",
      "Troque de empresa num clique, no topo da área Minha empresa",
    ],
  },
  grupo: {
    nome: "Grupo",
    preco: 50,
    precoLabel: "R$ 50/mês",
    recursos: [
      "Tudo do plano Avançado",
      "Até 3 pessoas (você + 2 convidados), cada uma com seu próprio login",
      "Convide sócio (acesso completo à empresa) ou funcionário (só estoque e vendas)",
      "A vida pessoal de cada um continua 100% privada — ninguém vê a de ninguém",
      "Ideal pra negócio em dupla ou com casal, ou pra quem já tem funcionário",
    ],
  },
  grupo_multi: {
    nome: "Negócio Bi-Empresa + Grupo",
    preco: 55,
    precoLabel: "R$ 55/mês",
    recursos: [
      "Até 2 contas PJ + 1 perfil pessoal + gestão de grupo",
      "Todos os recursos corporativos do Negócio Bi-Empresa",
      "Acesso multiusuário: até 2 convidados (sócio ou funcionário), cada um vinculado a uma empresa",
      "Visão consolidada do grupo econômico (as 2 empresas somadas)",
      "A vida pessoal de cada um continua 100% privada",
    ],
  },
};

export const LIMITE_TRANSACOES_GRATIS = 30;

/** Quantas pessoas, além de quem assina, podem ser convidadas no plano
 * Grupo — 2 convidados + o dono = até 3 pessoas, como combinado. Também
 * validado no banco (trigger em `membros`), essa constante é só pra UI
 * (ex: desabilitar o botão de convidar quando já bateu o limite). */
export const LIMITE_CONVIDADOS_GRUPO = 2;

/** Planos que incluem a área "Minha empresa" (qualquer variante). */
const PLANOS_NEGOCIO: readonly Plano[] = ["avancado", "avancado_multi", "grupo", "grupo_multi"];

export function podeUsarRecurso(plano: Plano, recurso: "analiseIA" | "metas" | "dashboardAvancado" | "graficos") {
  if (recurso === "dashboardAvancado" || recurso === "graficos") {
    return plano === "clt" || PLANOS_NEGOCIO.includes(plano);
  }
  return plano === "mensal" || plano === "clt" || PLANOS_NEGOCIO.includes(plano);
}

/**
 * Nível numérico do plano, usado para liberar recursos de forma gradual
 * (ex: gráficos do painel). 0 = Grátis, 1 = Mensal, 2 = Completo/Avançado/
 * Grupo (os três têm o mesmo nível de dashboard/gráficos — o que diferencia
 * um do outro não é o dashboard, é o acesso a "Minha empresa" e ao
 * compartilhamento, ver `podeAcessarNegocio`/`podeConvidarMembros` abaixo).
 */
export function nivelPlano(plano: Plano): number {
  if (plano === "clt" || PLANOS_NEGOCIO.includes(plano)) return 2;
  if (plano === "mensal") return 1;
  return 0;
}

/**
 * "Minha empresa" (vendas, estoque, contas, DAS, fluxo de caixa) é liberada
 * pra qualquer perfil — CLT, MEI ou ME — desde que esteja no plano Avançado
 * ou Grupo. Não é mais travada por tipo de perfil: um CLT que compra e
 * revende por conta própria (ou está começando um negócio informal) pode
 * querer o mesmo controle de estoque/vendas que um MEI/ME, então o gate é
 * só o plano. Nos planos Grátis/Mensal/Completo, ninguém tem acesso a essa
 * área, independente do tipo de perfil.
 */
export function podeAcessarNegocio(plano: Plano): boolean {
  return PLANOS_NEGOCIO.includes(plano);
}

/** Só o plano Grupo libera convidar sócio/funcionário pro painel
 * compartilhado — Avançado continua sendo uso individual. */
export function podeConvidarMembros(plano: Plano): boolean {
  return plano === "grupo" || plano === "grupo_multi";
}

/** Quantas empresas (CNPJs/negócios independentes) o plano permite —
 * item 5.4 da especificação de 03/out/2026: os planos "Bi-Empresa"
 * (`avancado_multi` R$45, `grupo_multi` R$55) liberam 2; os demais, 1. */
export function limiteEmpresas(plano: Plano): number {
  if (plano === "avancado_multi" || plano === "grupo_multi") return 2;
  return podeAcessarNegocio(plano) ? 1 : 0;
}

/** Lista de planos pagos válidos (usada na validação do checkout). */
export const PLANOS_PAGOS = ["mensal", "clt", "avancado", "avancado_multi", "grupo", "grupo_multi"] as const;

/**
 * Identificadores comerciais dos planos corporativos (item 4.1 da
 * especificação de 09/out/2026). No banco e no checkout os ids continuam
 * `avancado_multi`/`grupo_multi` (já existem assinaturas e checagens de RLS
 * com eles — renomear quebraria dados); estes nomes servem para links de
 * venda, campanhas e integrações externas, e são traduzidos aqui.
 */
export const IDENTIFICADOR_COMERCIAL: Partial<Record<Plano, string>> = {
  avancado_multi: "plano_duas_empresas",
  grupo_multi: "plano_duas_empresas_grupo",
};

/** Matriz de acesso (RBAC) por plano corporativo. */
export const LIMITES_PLANO_CORPORATIVO: Partial<Record<Plano, { contasPJ: number; perfisPessoais: number; multiusuario: boolean; modulos: string[] }>> = {
  avancado_multi: { contasPJ: 2, perfisPessoais: 1, multiusuario: false, modulos: ["fluxo_caixa", "estoque", "vendas", "clientes", "dre"] },
  grupo_multi: { contasPJ: 2, perfisPessoais: 1, multiusuario: true, modulos: ["fluxo_caixa", "estoque", "vendas", "clientes", "dre", "grupo", "multiusuario"] },
};

/** Aceita tanto o id interno quanto o identificador comercial. */
export function resolverPlano(valor: string | null | undefined): Plano | null {
  if (!valor) return null;
  if (valor in PLANOS) return valor as Plano;
  const achado = (Object.entries(IDENTIFICADOR_COMERCIAL) as [Plano, string][]).find(([, id]) => id === valor);
  return achado ? achado[0] : null;
}
