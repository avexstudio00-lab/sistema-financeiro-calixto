export interface Conta {
  id: string;
  usuario_id: string;
  nome: string;
  tipo: "corrente" | "poupanca" | "dinheiro" | "cartao_credito" | "carteira_digital";
  saldo_inicial: number;
  saldo_atual: number;
  limite: number | null;
  /** Só fazem sentido pra `tipo === "cartao_credito"` (nulos em qualquer
   * outro tipo) -- dia do mês (1-31) em que a fatura fecha e em que ela
   * vence. Usados só pra agrupar as transações da conta por ciclo de fatura
   * na tela de fatura (ver src/lib/data/faturaCartao.ts) -- nunca mudam
   * como o saldo em si é calculado. */
  dia_fechamento: number | null;
  dia_vencimento: number | null;
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
  /** Preenchido só quando a transação foi gerada automaticamente por uma
   * conta fixa recorrente (ver ContaFixa abaixo) — nulo em todo lançamento
   * manual, como sempre foi. */
  conta_fixa_id: string | null;
  /** Preenchido só quando essa saída foi anotada na categoria "Dívida"
   * escolhendo pra qual dívida é o pagamento (ver Divida acima) — nulo em
   * qualquer outro lançamento. */
  divida_id: string | null;
  /** Opcional: data em que esse lançamento vence de verdade (ex: fatura
   * anotada hoje mas que só vence mês que vem). Nunca usada pra agrupar o
   * Extrato (isso continua sendo `data`, a data do lançamento em si) — serve
   * só pra um lembrete futuro de vencimento e pra mostrar "vence em ..." na
   * lista. Nulo em qualquer lançamento sem vencimento (a maioria). */
  data_vencimento: string | null;
  /** Preenchidos só quando esse lançamento é uma parcela de uma "compra
   * parcelada comum" (ex: "celular em 10x", sem ser investimento — ver
   * `criarCompraParcelada` em transacoes.ts). `grupo_parcela_id` é o mesmo
   * UUID em todas as parcelas da mesma compra; `parcela_numero`/
   * `parcela_total` identificam a posição (ex: 3/10). Nulos em qualquer
   * lançamento avulso, como sempre foi. Cada parcela é uma `transacao`
   * normal e independente — editar/apagar uma delas usa exatamente o mesmo
   * fluxo de qualquer outro lançamento (Bloco 1), sem código novo. */
  grupo_parcela_id: string | null;
  parcela_numero: number | null;
  parcela_total: number | null;
  categorias?: Categoria | null;
}

/** Limite mensal opcional que o usuário define pra uma categoria de despesa
 * (ver src/lib/data/limitesCategoria.ts) -- usado pro alerta de "perto de
 * estourar orçamento". Sempre amarrado ao usuário (nunca na `categoria` em
 * si), porque categorias padrão são compartilhadas entre todo mundo. */
export interface LimiteCategoria {
  id: string;
  usuario_id: string;
  categoria_id: string;
  limite_mensal: number;
  criado_em: string;
}

/** Conta fixa recorrente (aluguel, assinatura de streaming etc.) — o usuário
 * define uma vez e o app lança o gasto/receita em `transacoes` sozinho, todo
 * mês, no dia de vencimento (ver src/lib/data/contasFixas.ts). Conceito de
 * vida pessoal (mesma regra "pessoal é pessoal" de metas/orçamento). */
export interface ContaFixa {
  id: string;
  usuario_id: string;
  descricao: string;
  valor: number;
  tipo: "receita" | "despesa";
  categoria_id: string | null;
  conta_id: string | null;
  dia_vencimento: number;
  ativa: boolean;
  data_inicio: string;
  data_fim: string | null;
  ultimo_ano_gerado: number | null;
  ultimo_mes_gerado: number | null;
  criado_em: string;
  categorias?: Categoria | null;
  contas?: Conta | null;
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

/** Dívida pessoal que o usuário quer quitar (ex: "Dívida com meu pai") —
 * pedido do usuário em 17/set/2026: diferente de uma categoria solta, cada
 * dívida tem um valor total e vai sendo abatida sozinha conforme o usuário
 * anota pagamentos na categoria "Dívida" escolhendo a ela (ver
 * src/lib/data/dividas.ts, que soma os pagamentos ligados por
 * `transacoes.divida_id` — nunca um valor digitado à mão, pra nunca
 * dessincronizar do extrato real). Conceito de vida pessoal (mesma regra
 * "pessoal é pessoal" de metas/orçamento/contas fixas). */
export interface Divida {
  id: string;
  usuario_id: string;
  nome: string;
  valor_total: number;
  /** Marcada manualmente (quitação sem pagar tudo, ex: dívida perdoada) ou
   * automaticamente quando o valor pago alcança o total — ver
   * src/lib/data/dividas.ts. */
  quitada: boolean;
  /** true quando essa dívida tem parcelas cadastradas em `divida_parcelas`
   * (feature "dívida parcelada", 23/set/2026) — dívidas antigas continuam
   * `false`, sem nenhuma parcela, e funcionam exatamente como sempre. */
  parcelada: boolean;
  /** Quanto a pessoa pegou emprestado de verdade (principal), só preenchido
   * quando ela quer ver o simulador estático "vale a pena" (juros total =
   * valor_total - valor_emprestado). Opcional mesmo em dívida parcelada —
   * ver `calcularCustoJuros` em src/lib/data/dividas.ts. */
  valor_emprestado: number | null;
  criado_em: string;
}

/** Uma parcela de uma dívida parcelada — mesma forma de `ParcelaInvestimento`,
 * mas SEM campo `pago`: o status de cada parcela nunca é guardado à parte,
 * é sempre derivado (waterfall) a partir do `valor_pago` já somado ao vivo
 * de `transacoes.divida_id` (ver `calcularStatusParcelasDivida` em
 * src/lib/data/dividas.ts) — assim um pagamento manual cobrindo 2+ parcelas
 * de uma vez já abate as duas sozinho, sem precisar marcar nada na mão. */
export interface DividaParcela {
  id: string;
  divida_id: string;
  usuario_id: string;
  numero: number;
  valor: number;
  data_vencimento: string;
  data_criacao: string;
}

/** `Divida` com o progresso já calculado a partir da soma de
 * `transacoes.divida_id` (nunca armazenado, sempre derivado na hora —
 * ver `listarDividasComProgresso`). */
export interface DividaComProgresso extends Divida {
  valor_pago: number;
  valor_restante: number;
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
  plano: "gratis" | "mensal" | "clt" | "avancado" | "grupo";
  status: "ativa" | "cancelada" | "atrasada";
  data_inicio: string;
  data_proximo_pagamento: string | null;
  id_pagamento_externo: string | null;
}

export interface Investimento {
  id: string;
  usuario_id: string;
  nome: string;
  tipo: "cdi" | "tesouro" | "bolsa" | "emprestimo" | "revenda" | "poupanca" | "cdb" | "lci" | "lca";
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
  /** Só para tipo "emprestimo": quanto a pessoa vai devolver no total, já
   * com o combinado embutido (ex: emprestou 1000, combinaram 1300 de volta
   * → valor_retornavel = 1300). O ganho é sempre `valor_retornavel -
   * valor_investido`, sem precisar de taxa/tipo_ganho. Nulo em empréstimos
   * antigos criados antes dessa mudança (esses continuam calculando pelo
   * taxa/tipo_ganho legado, ver `calcularValorAtualEstimado`). */
  valor_retornavel: number | null;
  /** Só para tipo "emprestimo": data em que o valor_retornavel completo é
   * atingido — o ganho cresce linearmente de 0 (na data_inicio) até o total
   * combinado (nessa data). Pra empréstimo à vista é a própria data de
   * pagamento combinada; pra parcelado é sempre igual ao vencimento da
   * última parcela (mantido em sincronia automaticamente, inclusive quando
   * o usuário edita manualmente a data de uma parcela). Nulo em empréstimos
   * antigos. */
  data_vencimento_final: string | null;
  /** Só para tipo "emprestimo": valor cobrado por dia de atraso (ex: 15 =
   * R$15/dia), somado automaticamente ao valor de um pagamento (juros ou
   * quitação) registrado depois do vencimento. Nulo = sem diária
   * configurada pra esse empréstimo. */
  valor_diaria: number | null;
  /** Só para tipo "emprestimo" à vista (o parcelado infere isso a partir
   * de `investimento_parcelas.pago`): true quando a pessoa quitou o
   * empréstimo inteiro (nunca mais "só juros" depois disso). */
  quitado: boolean;
  /** Valor realmente recebido na quitação (pode ser diferente do
   * `valor_retornavel` combinado, ex: incluiu diária de atraso, ou foi
   * renegociado). Nulo até `quitado` virar true. */
  valor_quitado: number | null;
  /** Data em que a quitação foi registrada. Nula até `quitado` virar true. */
  data_quitacao: string | null;
  /** Só para tipo "tesouro": qual título do Tesouro Direto foi comprado
   * (chave "Tipo Titulo|Data Vencimento ISO", ex: "Tesouro Selic|2029-03-01"),
   * usado pra buscar o preço/taxa atual em `cotacoes_mercado` (ver
   * src/lib/mercado/cotacoes.ts). Nulo em investimentos "tesouro" antigos,
   * que continuam usando o cálculo legado por taxa digitada na criação. */
  titulo_tesouro: string | null;
  /** Só para tipo "tesouro" com `titulo_tesouro` preenchido: quantas cotas
   * (podem ser fracionadas, ex: 0,53) desse título foram compradas -- valor
   * atual = quantidade_cotas × PU de venda ao vivo do título. */
  quantidade_cotas: number | null;
}

/** Um título do Tesouro Direto disponível hoje, com preço/taxa de venda
 * mais recentes -- ver `obterTitulosTesouro` em src/lib/mercado/cotacoes.ts. */
export interface TituloTesouro {
  /** Chave única pra casar com `Investimento.titulo_tesouro`. */
  chave: string;
  nomeExibicao: string;
  tipoTitulo: string;
  dataVencimento: string;
  taxaVenda: number;
  puVenda: number;
  dataBase: string;
}

/** Cotações de mercado ao vivo (Bloco 9+10) -- CDI, câmbio USD/EUR e a
 * lista de títulos do Tesouro Direto, todas cacheadas 1x por dia (ver
 * src/lib/mercado/cotacoes.ts e /api/mercado/cotacoes). Qualquer campo
 * pode vir `null`/vazio se a fonte externa estiver fora do ar e ainda não
 * houver nenhum cache -- nesses casos quem usa cai pro cálculo legado. */
export interface CotacoesMercado {
  cdi: number | null;
  cdiAtualizadoEm: string | null;
  usd: number | null;
  eur: number | null;
  cambioAtualizadoEm: string | null;
  titulosTesouro: TituloTesouro[];
  titulosAtualizadoEm: string | null;
  /** Rendimento anualizado da poupança, já calculado a partir da Selic + TR
   * (regra oficial, ver `obterCotacaoPoupanca` em src/lib/mercado/cotacoes.ts)
   * -- pronto pra usar do mesmo jeito que `cdi`. */
  poupanca: number | null;
  poupancaAtualizadoEm: string | null;
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

/** Um evento de pagamento registrado num empréstimo — "só paguei o juros"
 * (a dívida rola pro próximo vencimento) ou "quitação" (fecha o
 * empréstimo à vista, ou fecha antecipadamente um parcelado inteiro).
 * `parcela_id` nulo = evento sobre o empréstimo à vista (ou quitação
 * antecipada cobrindo várias parcelas de um parcelado de uma vez);
 * preenchido = evento sobre UMA parcela específica de um parcelado. */
export interface PagamentoInvestimento {
  id: string;
  investimento_id: string;
  usuario_id: string;
  parcela_id: string | null;
  tipo: "juros" | "quitacao";
  data_pagamento: string;
  dias_atraso: number;
  valor_juros: number | null;
  valor_diaria: number | null;
  valor_pago: number;
  vencimento_referencia: string | null;
  proximo_vencimento: string | null;
  criado_em: string;
}

// ---------------------------------------------------------------------------
// Área "Minha empresa" (negócio) — liberada pra qualquer perfil no plano
// Avançado, ver `podeAcessarNegocio` em src/lib/planos.ts.
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

// ---------------------------------------------------------------------------
// Painel compartilhado (plano Grupo) — convites de sócio/funcionário. Ver
// `src/lib/data/membros.ts` e o RLS no Supabase (funções
// conta_mestre_do_usuario / papel_do_membro).
// ---------------------------------------------------------------------------

export interface Membro {
  id: string;
  conta_mestre_id: string;
  membro_usuario_id: string | null;
  email: string;
  papel: "socio" | "funcionario";
  status: "pendente" | "ativo" | "removido";
  token: string;
  criado_em: string;
  aceito_em: string | null;
}

/** Retorno de `consultar_convite` — o que a tela de convite mostra antes de
 * a pessoa aceitar (não expõe dados sensíveis, só o necessário pra decidir). */
export interface DetalheConvite {
  email: string;
  papel: "socio" | "funcionario";
  nome_convidante: string;
  status: "pendente" | "ativo" | "removido";
}
