"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Mail, User, Lock, ArrowRight, MailCheck, Wallet } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/auth/AuthProvider";

function CadastroConteudo() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { signUp, user, perfil } = useAuth();

  const planoPretendido = searchParams.get("plano");

  const [nome, setNome] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [senha, setSenha] = React.useState("");
  const [confirmacao, setConfirmacao] = React.useState("");
  const [erro, setErro] = React.useState<string | null>(null);
  const [enviando, setEnviando] = React.useState(false);
  const [precisaConfirmarEmail, setPrecisaConfirmarEmail] = React.useState(false);

  React.useEffect(() => {
    if (user && perfil) {
      router.replace(perfil.tipo_perfil ? "/dashboard" : "/onboarding");
    }
  }, [user, perfil, router]);

  function validar(): string | null {
    if (nome.trim().length < 2) return "Digite seu nome completo.";
    if (!email.includes("@")) return "Digite um e-mail válido.";
    if (senha.length < 6) return "A senha precisa ter pelo menos 6 caracteres.";
    if (senha !== confirmacao) return "As senhas não coincidem.";
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);

    const validacao = validar();
    if (validacao) {
      setErro(validacao);
      return;
    }

    setEnviando(true);
    const resultado = await signUp(nome.trim(), email.trim(), senha);
    setEnviando(false);

    if (resultado.error) {
      setErro(resultado.error);
      return;
    }

    if (planoPretendido === "mensal" || planoPretendido === "clt" || planoPretendido === "avancado" || planoPretendido === "grupo") {
      try {
        window.localStorage.setItem("plano_pretendido", planoPretendido);
      } catch {
        // localStorage indisponível — segue sem lembrar o plano pretendido.
      }
    }

    if (resultado.precisaConfirmarEmail) {
      setPrecisaConfirmarEmail(true);
    } else {
      router.push("/onboarding");
    }
  }

  if (precisaConfirmarEmail) {
    return (
      <Card padding="lg" className="flex flex-col items-center gap-4 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary-600">
          <MailCheck size={26} />
        </span>
        <h1 className="text-h2 text-foreground">Confirme seu e-mail</h1>
        <p className="text-body text-muted">
          Enviamos um link de confirmação para <strong>{email}</strong>. Abra sua caixa de
          entrada e clique no link para ativar sua conta.
        </p>
        <Link href="/login" className="text-small font-semibold text-primary-600">
          Já confirmei, quero entrar
        </Link>
      </Card>
    );
  }

  return (
    <Card padding="lg" className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-500 text-white">
          <Wallet size={22} />
        </span>
        <h1 className="text-h2 text-foreground">Crie sua conta grátis</h1>
        <p className="text-body text-muted">Leva menos de um minuto, sem cartão de crédito.</p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input
          label="Nome completo"
          leftIcon={User}
          placeholder="Como podemos te chamar?"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          autoComplete="name"
        />
        <Input
          label="E-mail"
          type="email"
          leftIcon={Mail}
          placeholder="voce@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />
        <Input
          label="Senha"
          type="password"
          leftIcon={Lock}
          placeholder="Pelo menos 6 caracteres"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          autoComplete="new-password"
        />
        <Input
          label="Confirmar senha"
          type="password"
          leftIcon={Lock}
          placeholder="Repita a senha"
          value={confirmacao}
          onChange={(e) => setConfirmacao(e.target.value)}
          autoComplete="new-password"
        />

        {erro && <p className="text-small text-rose-600">{erro}</p>}

        <Button type="submit" size="lg" disabled={enviando} className="mt-2 w-full">
          {enviando ? "Criando conta..." : "Criar minha conta"}
          {!enviando && <ArrowRight size={18} />}
        </Button>
      </form>

      <p className="text-center text-small text-muted">
        Já tem uma conta?{" "}
        <Link href="/login" className="font-semibold text-primary-600">
          Entrar
        </Link>
      </p>
    </Card>
  );
}

export default function CadastroPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background py-16">
      <Container className="flex max-w-md flex-col">
        <React.Suspense fallback={null}>
          <CadastroConteudo />
        </React.Suspense>
      </Container>
    </main>
  );
}
