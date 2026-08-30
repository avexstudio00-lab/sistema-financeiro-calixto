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

export default function LoginPage() {
  const router = useRouter();
  const { signIn, user, perfil, carregando } = useAuth();

  const [email, setEmail] = React.useState("");
  const [senha, setSenha] = React.useState("");
  const [erro, setErro] = React.useState<string | null>(null);
  const [enviando, setEnviando] = React.useState(false);

  React.useEffect(() => {
    if (!carregando && user && perfil) {
      router.replace(perfil.tipo_perfil ? "/dashboard" : "/onboarding");
    }
  }, [carregando, user, perfil, router]);

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
      setErro("E-mail ou senha incorretos.");
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
