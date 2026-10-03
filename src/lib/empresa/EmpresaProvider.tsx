"use client";

import * as React from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { limiteEmpresas } from "@/lib/planos";
import { listarEmpresas, criarEmpresa, ramoDaEmpresa, type RamoAtividade } from "@/lib/data/empresas";
import {
  definirEmpresaAtivaId,
  lerEmpresaSalva,
  salvarEmpresaEscolhida,
} from "@/lib/empresa/empresaAtiva";
import type { Empresa } from "@/lib/data/tipos";

interface EmpresaContextValue {
  empresas: Empresa[];
  /** Empresa escolhida; `null` = visão consolidada (ou ainda carregando). */
  empresaAtiva: Empresa | null;
  /** Id escolhido (null = consolidado). Use como `key` pra remontar telas. */
  empresaAtivaId: string | null;
  carregado: boolean;
  /** Quantas empresas o plano da conta mestre permite (5.4). */
  limite: number;
  /** Ramo efetivo pra montar o menu: na visão consolidada, soma os ramos. */
  ramo: RamoAtividade;
  selecionarEmpresa: (id: string | null) => void;
  recarregar: () => Promise<void>;
}

const EmpresaContext = React.createContext<EmpresaContextValue | undefined>(undefined);

export function EmpresaProvider({ children }: { children: React.ReactNode }) {
  const { negocio, papel, podeAcessarMinhaEmpresa } = useAuth();
  const [empresas, setEmpresas] = React.useState<Empresa[]>([]);
  const [ativaId, setAtivaId] = React.useState<string | null>(null);
  const [carregado, setCarregado] = React.useState(false);
  const contaMestreId = negocio?.usuarioId ?? null;
  const limite = negocio ? limiteEmpresas(negocio.plano) : 0;

  const recarregar = React.useCallback(async () => {
    if (!contaMestreId || !podeAcessarMinhaEmpresa) {
      setEmpresas([]);
      definirEmpresaAtivaId(null);
      setAtivaId(null);
      setCarregado(true);
      return;
    }
    let lista = await listarEmpresas(contaMestreId);
    // Conta de negócio sem nenhuma empresa ainda (ex: assinou depois da
    // migração multi-empresa): cria a "empresa 1" pra tudo funcionar.
    if (lista.length === 0 && papel === "dono") {
      const { data } = await criarEmpresa(contaMestreId, "Minha empresa", "produtos");
      if (data) lista = [data as Empresa];
    }
    setEmpresas(lista);

    const salva = lerEmpresaSalva(contaMestreId);
    let escolhida: string | null;
    if (lista.length <= 1) {
      escolhida = lista[0]?.id ?? null;
    } else if (salva === null) {
      escolhida = null; // visão consolidada escolhida antes
    } else if (salva && lista.some((e) => e.id === salva)) {
      escolhida = salva;
    } else {
      escolhida = lista[0].id;
    }
    definirEmpresaAtivaId(escolhida);
    setAtivaId(escolhida);
    setCarregado(true);
  }, [contaMestreId, podeAcessarMinhaEmpresa, papel]);

  React.useEffect(() => {
    void recarregar();
  }, [recarregar]);

  const selecionarEmpresa = React.useCallback(
    (id: string | null) => {
      if (!contaMestreId) return;
      definirEmpresaAtivaId(id);
      salvarEmpresaEscolhida(contaMestreId, id);
      setAtivaId(id);
    },
    [contaMestreId]
  );

  const empresaAtiva = empresas.find((e) => e.id === ativaId) ?? null;
  const ramo: RamoAtividade = React.useMemo(() => {
    const base = empresaAtiva ? [empresaAtiva] : empresas;
    if (base.length === 0) return "produtos";
    const produto = base.some((e) => e.vende_produto);
    const servico = base.some((e) => e.vende_servico);
    return ramoDaEmpresa({ vende_produto: produto || !servico, vende_servico: servico });
  }, [empresaAtiva, empresas]);

  const valor = React.useMemo<EmpresaContextValue>(
    () => ({
      empresas,
      empresaAtiva,
      empresaAtivaId: ativaId,
      carregado,
      limite,
      ramo,
      selecionarEmpresa,
      recarregar,
    }),
    [empresas, empresaAtiva, ativaId, carregado, limite, ramo, selecionarEmpresa, recarregar]
  );

  return <EmpresaContext.Provider value={valor}>{children}</EmpresaContext.Provider>;
}

export function useEmpresa(): EmpresaContextValue {
  const ctx = React.useContext(EmpresaContext);
  if (!ctx) throw new Error("useEmpresa precisa estar dentro de <EmpresaProvider>");
  return ctx;
}
