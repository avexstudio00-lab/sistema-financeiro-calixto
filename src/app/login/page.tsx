"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mail, Lock, ArrowRight, Wallet } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/auth/AuthProvider";
import { MODO_SESSAO_COOKIE } from "@/lib/supabase/sessaoCookie";
import { supabase } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const { signIn, user, perfil, carregando, recuperacaoSenhaAtiva } = useAuth();

  const sessaoAoAbrirRef = React.useRef<boolean | null>(null);
  const cookieConferidoRef = React.useRef(false);
  const [cookieOk, setCookieOk] = React.useState(false);
  const [email, setEmail] = React.useState("");
  const [senha, setSenha] = React.useState("");
  const [erro, setErro] = React.useState<string | null>(null);
  const [enviando, setEnviando] = React.useState(false);

  React.useEffect(() => {
    if (carregando) return;
    // Sessão que veio só do link de "esqueci minha senha" (ainda sem a
    // senha nova de verdade) não conta como login pra este redirecionamento
    // — senão a pessoa entra direto no painel sem nunca ter provado a
    // senha, nem a antiga nem a nova (achado do usuário em 11/set/2026).
    // Manda de volta pra terminar o fluxo em vez de liberar o painel.
    if (recuperacaoSenhaAtiva) {
      router.replace("/redefinir-senha");
      return;
    }
    // Sessão em cookie ligada e o servidor mandou para cá (?proximo=...)
    // com sessão já existente ao abrir a tela. Dois casos:
    //  - migração (sessão antiga do localStorage acabou de ir para o
    //    cookie): o cookie EXISTE → segue normal para o painel;
    //  - o cookie sumiu (ex.: logout em outra aba): encerra só a sessão
    //    DESTE aparelho, senão ficaria indo e voltando /login ↔ /dashboard.
    // (Corrigido em 13/out/2026: antes saía sempre — e com escopo global —,
    // o que deslogava quem estava só migrando.)
    if (sessaoAoAbrirRef.current === null) sessaoAoAbrirRef.current = !!user;
    if (sessaoAoAbrirRef.current && user && MODO_SESSAO_COOKIE && new URLSearchParams(window.location.search).has("proximo")) {
      sessaoAoAbrirRef.current = false;
      if (!cookieConferidoRef.current) {
        cookieConferidoRef.current = true;
        void fetch("/api/auth/sessao", { credentials: "same-origin", cache: "no-store" })
          .then((r) => (r.ok ? r.json() : { sessao: null }))
          .then((corpo: { sessao: unknown }) => {
            if (corpo.sessao) {
              setCookieOk(true); // reexecuta o efeito e segue para o painel
            } else {
              void supabase.auth.signOut({ scope: "local" });
            }
          })
          .catch(() => setCookieOk(true));
        return;
      }
    }
    if (sessaoAoAbrirRef.current === false && MODO_SESSAO_COOKIE && user && !cookieOk && cookieConferidoRef.current) return;
    if (user && perfil) {
      // Volta para a página que a pessoa tentou abrir antes do login (o
      // middleware manda ?proximo=/dashboard/...). Só aceita caminho interno
      // do painel — nunca um endereço de fora (evita redirecionamento aberto).
      let proximo = "/dashboard";
      try {
        const p = new URLSearchParams(window.location.search).get("proximo");
        if (p && /^\/dashboard(\/[A-Za-z0-9\-_/]*)?$/.test(p)) proximo = p;
      } catch {
        // sem parâmetro: vai para o painel
      }
      router.replace(perfil.tipo_perfil ? proximo : "/onboarding");
    }
  }, [carregando, user, perfil, recuperacaoSenhaAtiva, router, cookieOk]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);

    if (!email.includes("@") || senha.length === 0) {
      setErro("Preencha seu e-mail e senha.");
      return;
    }

    setEnviando(true);
    const resultado = await signIn(email.trim(), senha);
    setEnviando(false);

    if (resultado.error) {
      setErro(resultado.error.includes("sessão segura") ? resultado.error : "E-mail ou senha incorretos.");
      return;
    }
    // O redirecionamento acontece pelo efeito acima assim que o perfil carregar.
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background py-16">
      <Container className="flex max-w-md flex-col">
        <Card padding="lg" className="flex flex-col gap-6">
          <div className="flex flex-col items-center gap-2 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-500 text-white">
              <Wallet size={22} />
            </span>
            <h1 className="text-h2 text-foreground">Bem-vindo de volta</h1>
            <p className="text-body text-muted">Entre para continuar seu controle financeiro.</p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Input
              label="E-mail"
              type="email"
              leftIcon={Mail}
              placeholder="voce@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
            <div className="flex flex-col gap-1.5">
              <Input
                label="Senha"
                type="password"
                leftIcon={Lock}
                placeholder="Sua senha"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                autoComplete="current-password"
              />
              <Link
                href="/esqueci-senha"
                className="self-end text-small font-medium text-primary-600"
              >
                Esqueci minha senha
              </Link>
            </div>

            {erro && <p className="text-small text-rose-600">{erro}</p>}

            <Button type="submit" size="lg" disabled={enviando} className="mt-2 w-full">
              {enviando ? "Entrando..." : "Entrar"}
              {!enviando && <ArrowRight size={18} />}
            </Button>
          </form>

          <p className="text-center text-small text-muted">
            Ainda não tenho conta?{" "}
            <Link href="/cadastro" className="font-semibold text-primary-600">
              Criar conta grátis
            </Link>
          </p>
        </Card>
      </Container>
    </main>
  );
}
