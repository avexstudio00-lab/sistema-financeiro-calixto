/**
 * Colunas que o app lê de produtos, serviços e vendas (14/nov/2026).
 *
 * Blindagem do funcionário: no banco, ninguém mais lê direto o custo
 * (produtos.custo, servicos.custo) nem o custo/taxa da venda
 * (vendas.custo_unitario, vendas.taxa_maquininha) — só dono e sócio, pelas
 * funções custos_* (ver src/lib/data/custos.ts). Por isso as consultas
 * listam as colunas em vez de "*": um "*" pediria o custo e o banco negaria.
 *
 * Coluna nova nessas tabelas? Inclua aqui E no "grant select (...)" da
 * migração, senão ninguém consegue ler.
 */
export const COLS_PRODUTO =
  "id, usuario_id, nome, preco_venda, quantidade_estoque, estoque_minimo, ativo, criado_em, empresa_id, fornecedor_id, preco_repasse";

export const COLS_SERVICO =
  "id, usuario_id, empresa_id, nome, descricao, preco_fixo, preco, ativo, criado_em, codigo, tempo_estimado, referencia_preco";

export const COLS_VENDA =
  "id, usuario_id, produto_id, produto_nome, quantidade, valor_unitario, valor_total, forma_pagamento, cliente_id, data, transacao_id, criado_em, empresa_id, servico_id, pagamentos, grupo_venda_id, parcelas_cartao, taxa_transacao_id, vendedor_id, vendedor_nome, repasse_unitario, acrescimo";
