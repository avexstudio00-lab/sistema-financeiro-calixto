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
  plano: "gratis" | "mensal" | "clt" | "avancado";
  status: "ativa" | "cancelada" | "atrasada";
  data_inicio: string;
  data_proximo_pagamento: string | null;
  id_pagamento_externo: string | null;
}

export interface Investimento {
  id: string;
  usuario_id: string;
  nome: string;
  tipo: "cdi" | "tesouro" | "bolsa" | "emprestimo" | "revenda";
  valor_investido: number;
  valor_atual: number;
  taxa: number | null;
  descricao: string | null;
  tipo_ganho: "fixo" | "mensal" | null;
  data_inicio: string;
  data_criacao: string;
  forma_pagamento: "vista" | "parcelado" | null;
  numero_parcelas: number | null;
  valor_parcela: number | null;
  periodicidade_parcelas: "mensal" | "quinzenal" | "semanal" | null;
}

/** Uma parcela de um investimento com forma_pagamento "parcelado" (ex:
 * empréstimo recebido de volta aos poucos, celular financiado). O usuário
 * marca manualmente quando paga — nunca é assumido automaticamente. */
export interface ParcelaInvestimento {
  id: string;
  investimento_id: string;
  usuario_id: string;
  numero: number;
  data_vencimento: string;
  valor: number;
  pago: boolean;
  data_pagamento: string | null;
  data_criacao: string;
}

// ---------------------------------------------------------------------------
// Área "Minha empresa" (negócio) — só existe pra perfil MEI/ME.
// ---------------------------------------------------------------------------

export interface Cliente {
  id: string;
  usuario_id: string;
  nome: string;
  telefone: string | null;
  email: string | null;
  criado_em: string;
}

export interface Fornecedor {
  id: string;
  usuario_id: string;
  nome: string;
  telefone: string | null;
  email: string | null;
  criado_em: string;
}

export interface Produto {
  id: string;
  usuario_id: string;
  nome: string;
  custo: number;
  preco_venda: number;
  quantidade_estoque: number;
  estoque_minimo: number;
  ativo: boolean;
  criado_em: string;
}

export interface Venda {
  id: string;
  usuario_id: string;
  produto_id: string | null;
  produto_nome: string;
  quantidade: number;
  valor_unitario: number;
  custo_unitario: number;
  valor_total: number;
  forma_pagamento: "pix" | "debito" | "credito" | "dinheiro" | "boleto" | null;
  cliente_id: string | null;
  data: string;
  transacao_id: string | null;
  criado_em: string;
  clientes?: Cliente | null;
}

export interface ContaPagar {
  id: string;
  usuario_id: string;
  fornecedor_id: string | null;
  categoria: "fornecedor" | "das" | "outro";
  descricao: string;
  valor: number;
  vencimento: string;
  status: "pendente" | "pago";
  data_pagamento: string | null;
  criado_em: string;
  fornecedores?: Fornecedor | null;
}

export interface ContaReceber {
  id: string;
  usuario_id: string;
  cliente_id: string | null;
  descricao: string;
  valor: number;
  vencimento: string;
  status: "pendente" | "recebido";
  data_recebimento: string | null;
  criado_em: string;
  clientes?: Cliente | null;
}
