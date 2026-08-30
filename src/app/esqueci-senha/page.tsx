"use client";

import * as React from "react";
import Link from "next/link";
import { Mail, ArrowLeft, MailCheck, Wallet } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/auth/AuthProvider";

export default function EsqueciSenhaPage() {
  const { resetPassword } = useAuth();
  const [email, setEmail] = React.useState("");
  const [erro, setErro] = React.useState<string | null>(null);
  const [enviando, setEnviando] = React.useState(false);
  const [enviado, setEnviado] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);

    if (!email.includes("@")) {
      setErro("Digite um e-mail válido.");
      return;
    }

    setEnviando(true);
    const resultado = await resetPassword(email.trim());
    setEnviando(false);

    if (resultado.error) {
      setErro(resultado.error);
      return;
    }
    setEnviado(true);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background py-16">
      <Container className="flex max-w-md flex-col">
        <Card padding="lg" className="flex flex-col gap-6">
          {enviado ? (
            <div className="flex flex-col items-center gap-4 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary-600">
                <MailCheck size={26} />
              </span>
              <h1 className="text-h2 text-foreground">Verifique seu e-mail</h1>
              <p className="text-body text-muted">
                Se <strong>{email}</strong> estiver cadastrado, você vai receber um link para
                criar uma nova senha.
              </p>
            </div>
          ) : (
            <>
              <div className="flex flex-col items-center gap-2 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-500 text-white">
                  <Wallet size={22} />
                </span>
                <h1 className="text-h2 text-foreground">Recuperar senha</h1>
                <p className="text-body text-muted">
                  Informe seu e-mail e enviaremos um link para você criar uma nova senha.
                </p>
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
                {erro && <p className="text-small text-rose-600">{erro}</p>}
                <Button type="submit" size="lg" disabled={enviando} className="w-full">
                  {enviando ? "Enviando..." : "Enviar link de recuperação"}
                </Button>
              </form>
            </>
          )}

          <Link
            href="/login"
            className="flex items-center justify-center gap-1.5 text-small font-medium text-muted"
          >
            <ArrowLeft size={16} />
            Voltar para o login
          </Link>
        </Card>
      </Container>
    </main>
  );
}
