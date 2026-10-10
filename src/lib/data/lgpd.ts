import { supabase } from "@/lib/supabase/client";

/**
 * LGPD — Lei nº 13.709/2018 (item 2.4 da especificação de 09/out/2026).
 *
 * - Versão vigente dos Termos de uso e da Política de privacidade. Ao mudar
 *   o texto de qualquer um dos dois, suba esta versão: quem já aceitou a
 *   anterior passa a ter o aceite da nova registrado no próximo cadastro.
 * - Portabilidade (art. 18, V): `exportarMeusDados` junta tudo o que é do
 *   titular, lido com o próprio login (o RLS garante que só vem o que é dele).
 * - Eliminação (art. 18, VI): `excluirMinhaConta` chama a rota de servidor
 *   que apaga de vez (hard delete) todas as linhas e arquivos do titular.
 */
import { VERSAO_DOCUMENTOS_LEGAIS } from "@/lib/legal/versao";
export { VERSAO_DOCUMENTOS_LEGAIS };

async function tokenAtual(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

let consentimentoEmAndamento = false;

/** Registra no servidor (com IP e hora UTC) o aceite feito no cadastro, se
 * ainda não registrado. Idempotente; nunca lança erro. */
export async function registrarConsentimentoPendente(): Promise<void> {
  if (consentimentoEmAndamento) return;
  consentimentoEmAndamento = true;
  try {
    const token = await tokenAtual();
    if (!token) return;
    await fetch("/api/lgpd/consentimento", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ versao: VERSAO_DOCUMENTOS_LEGAIS, origem: "automatico" }),
    });
  } catch (erro) {
    console.error("Falha ao registrar consentimento LGPD:", erro);
  } finally {
    consentimentoEmAndamento = false;
  }
}

export interface Consentimento {
  id: string;
  versao_termos: string;
  versao_privacidade: string;
  ip: string | null;
  aceito_em: string;
}

export async function listarConsentimentos(): Promise<Consentimento[]> {
  const { data } = await supabase
    .from("user_consents")
    .select("id, versao_termos, versao_privacidade, ip, aceito_em")
    .order("aceito_em", { ascending: false });
  return (data as Consentimento[]) ?? [];
}

/** Tabelas com dados do titular (todas com coluna `usuario_id`). */
const TABELAS_DO_TITULAR = [
  "usuarios",
  "contas",
  "categorias",
  "transacoes",
  "contas_fixas",
  "limites_categoria",
  "metas",
  "dividas",
  "divida_parcelas",
  "investimentos",
  "investimento_parcelas",
  "investimento_pagamentos",
  "modelos_lancamento",
  "analises_ia",
  "assinaturas",
  "empresas",
  "clientes",
  "fornecedores",
  "produtos",
  "servicos",
  "vendas",
  "orcamentos",
  "notas_fiscais",
  "contas_pagar",
  "contas_receber",
  "config_negocio",
  "preferencias_privacidade",
] as const;

async function lerTudo(tabela: string, usuarioId: string): Promise<Record<string, unknown>[]> {
  const coluna = tabela === "usuarios" ? "id" : "usuario_id";
  const linhas: Record<string, unknown>[] = [];
  const pagina = 1000;
  for (let inicio = 0; inicio < 200000; inicio += pagina) {
    const { data, error } = await supabase
      .from(tabela)
      .select("*")
      .eq(coluna, usuarioId)
      .range(inicio, inicio + pagina - 1);
    if (error || !data) break;
    linhas.push(...(data as Record<string, unknown>[]));
    if (data.length < pagina) break;
  }
  return linhas;
}

export interface PacoteDados {
  gerado_em: string;
  titular: { id: string; email: string | null };
  base_legal: string;
  tabelas: Record<string, Record<string, unknown>[]>;
}

export async function exportarMeusDados(usuarioId: string, email: string | null): Promise<PacoteDados> {
  const tabelas: Record<string, Record<string, unknown>[]> = {};
  for (const t of TABELAS_DO_TITULAR) {
    tabelas[t] = await lerTudo(t, usuarioId);
  }
  // Consentimentos (coluna user_id).
  const { data: consent } = await supabase.from("user_consents").select("*").eq("user_id", usuarioId);
  tabelas.user_consents = (consent as Record<string, unknown>[]) ?? [];
  const token = await tokenAtual();
  if (token) {
    // Só registra o evento (auditoria); não envia dado nenhum.
    fetch("/api/lgpd/consentimento", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ versao: VERSAO_DOCUMENTOS_LEGAIS, origem: "exportacao" }),
    }).catch(() => {});
  }
  return {
    gerado_em: new Date().toISOString(),
    titular: { id: usuarioId, email },
    base_legal: "LGPD, art. 18, V — portabilidade dos dados a pedido do titular",
    tabelas,
  };
}

function celulaCsv(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s = typeof v === "object" ? JSON.stringify(v) : String(v);
  // Neutraliza fórmula em planilha (CSV injection).
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Um CSV por tabela, todos num único arquivo de texto separado por seções. */
export function pacoteParaCsv(pacote: PacoteDados): string {
  const partes: string[] = [`# Exportação de dados — gerado em ${pacote.gerado_em}`];
  for (const [tabela, linhas] of Object.entries(pacote.tabelas)) {
    partes.push("", `# ${tabela} (${linhas.length} linha(s))`);
    if (linhas.length === 0) continue;
    const colunas = Array.from(new Set(linhas.flatMap((l) => Object.keys(l))));
    partes.push(colunas.join(";"));
    for (const l of linhas) partes.push(colunas.map((c) => celulaCsv(l[c])).join(";"));
  }
  return "﻿" + partes.join("\r\n");
}

export function baixarArquivo(nome: string, conteudo: string, tipo: string) {
  const blob = new Blob([conteudo], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Exclusão definitiva. Exige a senha atual (reautenticação) e a frase de
 * confirmação digitada; o servidor confere as duas coisas de novo. */
export async function excluirMinhaConta(senha: string, frase: string): Promise<{ ok: boolean; erro?: string }> {
  const token = await tokenAtual();
  if (!token) return { ok: false, erro: "Sessão expirada. Entre de novo." };
  const resp = await fetch("/api/lgpd/excluir-conta", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ senha, confirmacao: frase }),
  });
  const corpo = (await resp.json().catch(() => ({}))) as { erro?: string };
  if (!resp.ok) return { ok: false, erro: corpo.erro ?? "Não foi possível excluir a conta." };
  return { ok: true };
}

export const FRASE_CONFIRMACAO_EXCLUSAO = "EXCLUIR MINHA CONTA";
