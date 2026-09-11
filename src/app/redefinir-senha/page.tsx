"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Lock, ArrowLeft, KeyRound, CheckCircle2 } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/auth/AuthProvider";
import { supabase } from "@/lib/supabase/client";

/**
 * Página de destino do link "Recuperar senha" enviado por e-mail (ver
 * `resetPassword` em AuthProvider.tsx, que manda o `redirectTo` pra cá).
 * Clicar no link do e-mail já autentica o usuário — o Supabase troca o
 * token de recuperação por uma sessão de verdade ao carregar a página.
 * O que faltava antes (bug relatado pelo usuário em 10/set/2026) era um
 * passo pra realmente escolher a nova senha: sem esta página, o
 * `redirectTo` apontava pra `/login`, que redireciona sozinho qualquer
 * usuário já autenticado pro painel — ou seja, o usuário caía direto no
 * painel com a senha ANTIGA intacta, e teria que repetir o processo de
 * recuperação pra sempre, porque a senha nunca era trocada de verdade.
 *
 * Não pede a senha antiga — ninguém que esqueceu a senha tem ela pra
 * digitar. É o próprio link de e-mail (só quem tem acesso à caixa de
 * entrada recebe) que prova que é o dono da conta, o mesmo padrão usado
 * por qualquer serviço com fluxo de "esqueci minha senha". Pra trocar a
 * senha já sabendo a atual, ver a seção "Trocar senha" em
 * `/dashboard/perfil` — essa sim pede a senha atual antes.
 */
export default function RedefinirSenhaPage() {
  const router = useRouter();
  const { carregando, recuperacaoSenhaAtiva, signOut } = useAuth();

  const [novaSenha, setNovaSenha] = React.useState("");
  const [confirmarSenha, setConfirmarSenha] = React.useState("");
  const [erro, setErro] = React.useState<string | null>(null);
  const [salvando, setSalvando] = React.useState(false);
  const [concluido, setConcluido] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);

    if (novaSenha.length < 8) {
      setErro("A senha precisa ter pelo menos 8 caracteres.");
      return;
    }
    if (novaSenha !== confirmarSenha) {
      setErro("As senhas não coincidem.");
      return;
    }

    setSalvando(true);
    const { error } = await supabase.auth.updateUser({ password: novaSenha });
    setSalvando(false);

    if (error) {
      setErro("Não foi possível trocar a senha. Peça um novo link de recuperação e tente de novo.");
      return;
    }

    setConcluido(true);
    // Encerra a sessão criada pelo link de recuperação por segurança — o
    // usuário faz login de novo já com a senha nova, em vez de ficar
    // logado silenciosamente por causa de um link de e-mail que pode ter
    // sido aberto em outro dispositivo/navegador.
    await signOut();
    setTimeout(() => router.replace("/login"), 2500);
  }

  if (carregando) return null;

  // IMPORTANTE: checar `concluido` antes de `recuperacaoSenhaAtiva` — depois
  // de trocar a senha com sucesso, esta página desloga o usuário de
  // propósito (ver handleSubmit), o que zera `recuperacaoSenhaAtiva` junto.
  // Checar na ordem errada faria a tela de sucesso nunca aparecer: o
  // usuário trocaria a senha e veria "link inválido" no lugar da
  // confirmação (achado da revisão adversarial de 10/set/2026).
  if (!concluido && !recuperacaoSenhaAtiva) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background py-16">
        <Container className="flex max-w-md flex-col">
          <Card padding="lg" className="flex flex-col items-center gap-4 text-center">
            <h1 className="text-h2 text-foreground">Link inválido ou expirado</h1>
            <p className="text-body text-muted">
              Peça um novo link de recuperação de senha e abra o e-mail mais recente.
            </p>
            <Link href="/esqueci-senha" className="text-small font-semibold text-primary-600">
              Pedir novo link
            </Link>
          </Card>
        </Container>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background py-16">
      <Container className="flex max-w-md flex-col">
        <Card padding="lg" className="flex flex-col gap-6">
          {concluido ? (
            <div className="flex flex-col items-center gap-4 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary-600">
                <CheckCircle2 size={26} />
              </span>
              <h1 className="text-h2 text-foreground">Senha alterada</h1>
              <p className="text-body text-muted">Redirecionando para o login...</p>
            </div>
          ) : (
            <>
              <div className="flex flex-col items-center gap-2 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-500 text-white">
                  <KeyRound size={22} />
                </span>
                <h1 className="text-h2 text-foreground">Criar nova senha</h1>
                <p className="text-body text-muted">Escolha uma nova senha para sua conta.</p>
              </div>

              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <Input
                  label="Nova senha"
                  type="password"
                  leftIcon={Lock}
                  placeholder="Pelo menos 8 caracteres"
                  value={novaSenha}
                  onChange={(e) => setNovaSenha(e.target.value)}
                  autoComplete="new-password"
                />
                <Input
                  label="Confirmar nova senha"
                  type="password"
                  leftIcon={Lock}
                  placeholder="Digite a senha de novo"
                  value={confirmarSenha}
                  onChange={(e) => setConfirmarSenha(e.target.value)}
                  autoComplete="new-password"
                />
                {erro && <p className="text-small text-rose-600">{erro}</p>}
                <Button type="submit" size="lg" disabled={salvando} className="w-full">
                  {salvando ? "Salvando..." : "Salvar nova senha"}
                </Button>
              </form>
            </>
          )}

          {!concluido && (
            <Link
              href="/login"
              className="flex items-center justify-center gap-1.5 text-small font-medium text-muted"
            >
              <ArrowLeft size={16} />
              Voltar para o login
            </Link>
          )}
        </Card>
      </Container>
    </main>
  );
}
