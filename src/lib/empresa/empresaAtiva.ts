/**
 * "Qual empresa estou vendo" (itens 5.4/5.5 da especificação de 03/out/2026).
 *
 * Guardado num módulo (não só no React) de propósito: as funções de dados de
 * `src/lib/data/*` (produtos, vendas, clientes, contas...) leem daqui pra
 * filtrar listas e marcar novos registros com a empresa certa, sem precisar
 * passar o id por todas as telas. O `EmpresaProvider` mantém este valor em
 * sincronia e remonta as telas da área "Minha empresa" quando ele muda.
 *
 * `null` = sem filtro: conta com 1 empresa só, ou a "visão consolidada"
 * (as 2 empresas somadas) dos planos Bi-Empresa. O isolamento real entre
 * empresas continua garantido pelo RLS no banco — isto aqui é só a escolha
 * do que mostrar.
 */
let empresaAtivaAtual: string | null = null;

export function definirEmpresaAtivaId(id: string | null) {
  empresaAtivaAtual = id;
}

export function empresaAtivaId(): string | null {
  return empresaAtivaAtual;
}

const PREFIXO = "meucontrole:empresa-ativa:";

export function lerEmpresaSalva(contaMestreId: string): string | null | undefined {
  try {
    const v = window.localStorage.getItem(PREFIXO + contaMestreId);
    if (v === null) return undefined;
    return v === "todas" ? null : v;
  } catch {
    return undefined;
  }
}

export function salvarEmpresaEscolhida(contaMestreId: string, id: string | null) {
  try {
    window.localStorage.setItem(PREFIXO + contaMestreId, id ?? "todas");
  } catch {
    // localStorage indisponível — a escolha vale só pra esta visita.
  }
}

/** Aplica o filtro de empresa numa consulta do Supabase, se houver empresa
 * escolhida. Tipado de forma solta de propósito pra servir a qualquer
 * builder de consulta (`.eq` existe em todos). */
export function filtrarPorEmpresa<Q>(query: Q): Q {
  const id = empresaAtivaAtual;
  if (!id) return query;
  return (query as unknown as { eq: (coluna: string, valor: string) => Q }).eq("empresa_id", id);
}

/** Campo extra pra incluir num insert: a empresa escolhida, quando houver.
 * Sem empresa escolhida, o banco preenche sozinho (trigger
 * `preencher_empresa_id`) com a empresa principal. */
export function campoEmpresa(): { empresa_id?: string } {
  return empresaAtivaAtual ? { empresa_id: empresaAtivaAtual } : {};
}
