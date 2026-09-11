"use client";

import * as React from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";
import { podeAcessarNegocio, type Plano } from "@/lib/planos";
import { iniciarTrial, verificarExpiracaoTrial } from "@/lib/data/assinaturas";

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
  /** True só quando a sessão atual veio do link de e-mail de "esqueci
   * minha senha" (evento `PASSWORD_RECOVERY` do Supabase Auth) — usado por
   * `/redefinir-senha` pra decidir se mostra o formulário de nova senha.
   * Sem isso, qualquer usuário já logado normalmente que abrisse aquela
   * URL conseguiria trocar a senha sem confirmar a atual (achado da
   * revisão adversarial de 10/set/2026). Fica `false` de novo assim que um
   * login normal (`SIGNED_IN`) ou logout (`SIGNED_OUT`) acontecer. */
  recuperacaoSenhaAtiva: boolean;
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
  const [recuperacaoSenhaAtiva, setRecuperacaoSenhaAtiva] = React.useState(false);

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
      let perfilCarregado = data as Perfil | null;

      // Verificação preguiçosa do trial (mesmo padrão de contas fixas):
      // se o trial grátis desse usuário já venceu, rebaixa pra "gratis"
      // agora e relê o perfil atualizado antes de publicar no estado.
      if (perfilCarregado) {
        const trialExpirouAgora = await verificarExpiracaoTrial(userId);
        if (trialExpirouAgora) {
          const { data: atualizado } = await supabase.from("usuarios").select("*").eq("id", userId).maybeSingle();
          perfilCarregado = atualizado as Perfil | null;
        }
      }

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

    const { data: listener } = supabase.auth.onAuthStateChange(async (evento, novaSessao) => {
      // Registrado aqui de propósito (o ponto mais cedo possível do app,
      // dentro do AuthProvider que envolve todo o layout raiz) — é o único
      // jeito confiável de pegar o evento `PASSWORD_RECOVERY` disparado
      // pelo Supabase ao processar o token do link de e-mail, que acontece
      // assim que o client é criado, antes de qualquer página específica
      // (ex: /redefinir-senha) montar o próprio listener.
      if (evento === "PASSWORD_RECOVERY") {
        setRecuperacaoSenhaAtiva(true);
      } else if (evento === "SIGNED_IN" || evento === "SIGNED_OUT") {
        setRecuperacaoSenhaAtiva(false);
      }

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
      const { error: erroPerfil } = await supabase.from("usuarios").insert({
        id: data.user.id,
        nome,
        email,
        plano: "gratis",
      });
      if (erroPerfil) {
        // Erro real (não só "não deu pra dar trial"): loga em vez de
        // seguir como se tivesse dado certo — sem a linha em `usuarios`, a
        // FK de `assinaturas` não tem o que referenciar e o trial abaixo
        // falharia de qualquer forma.
        console.error("Erro ao criar perfil no cadastro:", erroPerfil.message);
      } else {
        // Trial grátis de DIAS_TRIAL dias no plano PLANO_TRIAL — ver
        // src/lib/data/assinaturas.ts. Roda depois do insert acima (precisa
        // da linha em `usuarios` já existir) e antes de carregar o perfil,
        // pra `plano` já vir liberado na primeira leitura.
        await iniciarTrial();
      }
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
        const { error: erroPerfil } = await supabase.from("usuarios").insert({
          id: data.user.id,
          nome,
          email: data.user.email,
          plano: "gratis",
        });
        if (erroPerfil) {
          // Ex.: duas abas fazendo login juntas pela primeira vez — a
          // segunda esbarra na PK de `usuarios.id` já criada pela primeira.
          // Não é motivo pra tentar de novo aqui nem pra dar um segundo
          // trial; só loga.
          console.error("Erro ao criar perfil no primeiro login:", erroPerfil.message);
        } else {
          // Mesmo trial grátis do cadastro normal (ver signUp acima) — esse
          // caminho cobre quem confirmou o e-mail e só ganha a linha em
          // `usuarios` no primeiro login (confirmação de e-mail ativada no
          // projeto).
          await iniciarTrial();
        }
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
    // Antes mandava pra `/login` — como o link de recuperação já autentica
    // o usuário (o Supabase troca o token do e-mail por uma sessão de
    // verdade ao carregar a página), ele caía direto no painel logado com
    // a senha ANTIGA intacta, sem nunca ter escolhido uma nova (bug
    // relatado pelo usuário em 10/set/2026: "clico no email e ele já me
    // volta pro site" — sem passar por trocar a senha, ele teria que
    // repetir isso pra sempre). Agora manda pra uma página dedicada que
    // pede a nova senha antes de liberar o painel — ver
    // src/app/redefinir-senha/page.tsx.
    const redirectTo =
      typeof window !== "undefined" ? `${window.location.origin}/redefinir-senha` : undefined;
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
    recuperacaoSenhaAtiva,
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

