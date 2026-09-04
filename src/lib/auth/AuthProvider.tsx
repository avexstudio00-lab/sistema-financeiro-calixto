"use client";

import * as React from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";
import { podeAcessarNegocio, type Plano } from "@/lib/planos";

export interface Perfil {
  id: string;
  nome: string;
  email: string;
  tipo_perfil: "clt" | "mei" | "me" | null;
  plano: Plano;
  data_criacao: string;
  foto_url: string | null;
}

/** "dono" é quem assina a conta; "socio" e "funcionario" são convidados no
 * plano Grupo (ver src/lib/data/membros.ts). Todo mundo sem vínculo de
 * membro ativo é "dono" da própria conta, mesmo em planos sem grupo. */
export type Papel = "dono" | "socio" | "funcionario";

/**
 * Dados da conta que efetivamente dona os dados de "Minha empresa" pra
 * quem está logado agora. Pra um "dono", é sempre a própria conta. Pra um
 * "socio"/"funcionario", é a conta de quem convidou. Toda leitura/escrita
 * em tabelas do mundo negócio (produtos, vendas, clientes, fornecedores,
 * contas a pagar/receber, categorias novas, transações com
 * tipo_negocio "negocio") deve usar `negocio.usuarioId` — NUNCA `user.id`
 * diretamente — pra funcionar tanto pro dono quanto pra quem foi convidado.
 * Já o mundo pessoal (metas, investimentos, carteiras, transações
 * pessoais) continua usando `user.id` normalmente: é sempre 100% privado,
 * mesmo pra quem foi convidado — "pessoal é pessoal".
 */
export interface NegocioInfo {
  usuarioId: string;
  nome: string;
  plano: Plano;
}

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  perfil: Perfil | null;
  papel: Papel;
  negocio: NegocioInfo | null;
  podeAcessarMinhaEmpresa: boolean;
  carregando: boolean;
  recarregarPerfil: () => Promise<void>;
  signUp: (nome: string, email: string, senha: string) => Promise<{ error: string | null; precisaConfirmarEmail: boolean }>;
  signIn: (email: string, senha: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
}

const AuthContext = React.createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<User | null>(null);
  const [session, setSession] = React.useState<Session | null>(null);
  const [perfil, setPerfil] = React.useState<Perfil | null>(null);
  const [papel, setPapel] = React.useState<Papel>("dono");
  const [negocio, setNegocio] = React.useState<NegocioInfo | null>(null);
  const [carregando, setCarregando] = React.useState(true);

  /** Descobre se quem está logado é dono da própria conta ou foi convidado
   * (sócio/funcionário) — e, nesse caso, busca os dados básicos (nome,
   * plano) da conta de quem convidou, pra liberar "Minha empresa" e mostrar
   * de quem é a empresa que a pessoa está vendo. */
  const carregarPapelENegocio = React.useCallback(async (userId: string, perfilAtual: Perfil | null) => {
    const { data: papelData } = await supabase.rpc("papel_do_membro");
    const papelResolvido = ((papelData as string | null) ?? "dono") as Papel;
    setPapel(papelResolvido);

    if (papelResolvido === "dono") {
      setNegocio(perfilAtual ? { usuarioId: perfilAtual.id, nome: perfilAtual.nome, plano: perfilAtual.plano } : null);
      return;
    }

    const { data: mestreId } = await supabase.rpc("conta_mestre_do_usuario", { p_usuario_id: userId });
    if (!mestreId) {
      setNegocio(null);
      return;
    }
    const { data: mestre } = await supabase
      .from("usuarios")
      .select("id, nome, plano")
      .eq("id", mestreId as string)
      .maybeSingle();
    setNegocio(mestre ? { usuarioId: mestre.id, nome: mestre.nome, plano: mestre.plano as Plano } : null);
  }, []);

  const carregarPerfil = React.useCallback(
    async (userId: string) => {
      const { data } = await supabase.from("usuarios").select("*").eq("id", userId).maybeSingle();
      const perfilCarregado = data as Perfil | null;
      setPerfil(perfilCarregado);
      await carregarPapelENegocio(userId, perfilCarregado);
    },
    [carregarPapelENegocio]
  );

  React.useEffect(() => {
    let ativo = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!ativo) return;
      setSession(data.session);
      setUser(data.session?.user ?? null);
      if (data.session?.user) {
        await carregarPerfil(data.session.user.id);
      }
      setCarregando(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, novaSessao) => {
      setSession(novaSessao);
      setUser(novaSessao?.user ?? null);
      if (novaSessao?.user) {
        await carregarPerfil(novaSessao.user.id);
      } else {
        setPerfil(null);
        setPapel("dono");
        setNegocio(null);
      }
    });

    return () => {
      ativo = false;
      listener.subscription.unsubscribe();
    };
  }, [carregarPerfil]);

  const recarregarPerfil = React.useCallback(async () => {
    if (user) await carregarPerfil(user.id);
  }, [user, carregarPerfil]);

  const podeAcessarMinhaEmpresa = React.useMemo(
    () => (negocio ? podeAcessarNegocio(negocio.plano) : false),
    [negocio]
  );

  const signUp = React.useCallback(async (nome: string, email: string, senha: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password: senha,
      options: { data: { nome } },
    });
    if (error) return { error: error.message, precisaConfirmarEmail: false };

    // Se já existe sessão (confirmação de e-mail desativada no projeto), cria o perfil na hora.
    if (data.session && data.user) {
      await supabase.from("usuarios").insert({
        id: data.user.id,
        nome,
        email,
        plano: "gratis",
      });
      await carregarPerfil(data.user.id);
      return { error: null, precisaConfirmarEmail: false };
    }

    return { error: null, precisaConfirmarEmail: true };
  }, [carregarPerfil]);

  const signIn = React.useCallback(async (email: string, senha: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password: senha });
    if (error) return { error: error.message };

    if (data.user) {
      const { data: perfilExistente } = await supabase
        .from("usuarios")
        .select("id")
        .eq("id", data.user.id)
        .maybeSingle();

      if (!perfilExistente) {
        const nome = (data.user.user_metadata?.nome as string) || data.user.email || "Usuário";
        await supabase.from("usuarios").insert({
          id: data.user.id,
          nome,
          email: data.user.email,
          plano: "gratis",
        });
      }
      await carregarPerfil(data.user.id);
    }

    return { error: null };
  }, [carregarPerfil]);

  const signOut = React.useCallback(async () => {
    await supabase.auth.signOut();
    setPerfil(null);
    setPapel("dono");
    setNegocio(null);
  }, []);

  const resetPassword = React.useCallback(async (email: string) => {
    const redirectTo = typeof window !== "undefined" ? `${window.location.origin}/login` : undefined;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    return { error: error?.message ?? null };
  }, []);

  const value: AuthContextValue = {
    user,
    session,
    perfil,
    papel,
    negocio,
    podeAcessarMinhaEmpresa,
    carregando,
    recarregarPerfil,
    signUp,
    signIn,
    signOut,
    resetPassword,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve ser usado dentro de <AuthProvider>");
  return ctx;
}
