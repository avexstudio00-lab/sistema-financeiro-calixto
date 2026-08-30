export interface Conta {
  id: string;
  usuario_id: string;
  nome: string;
  tipo: "corrente" | "poupanca" | "dinheiro" | "cartao_credito" | "carteira_digital";
  saldo_inicial: number;
  saldo_atual: number;
  limite: number | null;
}

export interface Categoria {
  id: string;
  usuario_id: string | null;
  nome: string;
  icone: string | null;
  cor: string | null;
  tipo: "receita" | "despesa";
  is_padrao: boolean;
  is_personalizada: boolean;
}

export interface Transacao {
  id: string;
  usuario_id: string;
  conta_id: string | null;
  categoria_id: string | null;
  tipo: "receita" | "despesa";
  valor: number;
  descricao: string | null;
  data: string;
  forma_pagamento: "pix" | "debito" | "credito" | "dinheiro" | "boleto" | null;
  tipo_negocio: "pessoal" | "negocio" | null;
  is_recorrente: boolean;
  recorrencia: "mensal" | "semanal" | "diaria" | null;
  categorias?: Categoria | null;
}

export interface Meta {
  id: string;
  usuario_id: string;
  nome: string;
  valor_meta: number;
  valor_atual: number;
  data_inicio: string;
  data_fim: string | null;
  status: "em_andamento" | "concluida";
}

export interface AnaliseIA {
  id: string;
  usuario_id: string;
  mes: number;
  ano: number;
  resumo: string | null;
  entradas_total: number;
  saidas_total: number;
  saldo: number;
  variacao_percentual: number | null;
  data_geracao: string;
}

export interface Assinatura {
  id: string;
  usuario_id: string;
  plano: "gratis" | "mensal" | "avancado";
  status: "ativa" | "cancelada" | "atrasada";
  data_inicio: string;
  data_proximo_pagamento: string | null;
  id_pagamento_externo: string | null;
}
