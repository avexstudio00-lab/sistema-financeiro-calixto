"use client";

import * as React from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";
import type { Plano } from "@/lib/planos";

export interface Perfil {
  id: string;
  nome: string;
  email: string;
  tipo_perfil: "clt" | "mei" | "me" | null;
  plano: Plano;
  data_criacao: string;
  foto_url: string | null;
}

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  perfil: Perfil | null;
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
  const [carregando, setCarregando] = React.useState(true);

  const carregarPerfil = React.useCallback(async (userId: string) => {
    const { data } = await supabase.from("usuarios").select("*").eq("id", userId).maybeSingle();
    setPerfil(data as Perfil | null);
  }, []);

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
