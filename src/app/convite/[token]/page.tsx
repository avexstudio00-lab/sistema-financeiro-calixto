"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { Mail, User, Lock, ArrowRight, Wallet, Users, ShieldCheck, LogOut, XCircle } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { useAuth } from "@/lib/auth/AuthProvider";
import { consultarConvite, aceitarConvite } from "@/lib/data/membros";
import type { DetalheConvite } from "@/lib/data/tipos";

const LABEL_PAPEL: Record<"socio" | "funcionario", string> = {
  socio: "Sócio (acesso completo à empresa)",
  funcionario: "Funcionário (estoque e vendas)",
};

export default function ConvitePage() {
  const params = useParams<{ token: string }>();
  const token = params?.token ?? "";
  const router = useRouter();
  const { user, signIn, signUp, signOut, recarregarPerfil, carregando: carregandoAuth } = useAuth();

  const [detalhe, setDetalhe] = React.useState<DetalheConvite | null | undefined>(undefined);
  const [modo, setModo] = React.useState<"entrar" | "criar">("entrar");
  const [nome, setNome] = React.useState("");
  const [senha, setSenha] = React.useState("");
  const [confirmacao, setConfirmacao] = React.useState("");
  const [erroForm, setErroForm] = React.useState<string | null>(null);
  const [enviando, setEnviando] = React.useState(false);
  const [aceitando, setAceitando] = React.useState(false);
  const [erroAceitar, setErroAceitar] = React.useState<string | null>(null);
  const [aceito, setAceito] = React.useState(false);

  React.useEffect(() => {
    if (!token) return;
    consultarConvite(token).then(setDetalhe);
  }, [token]);

  async function handleEntrar(e: React.FormEvent) {
    e.preventDefault();
    if (!detalhe) return;
    setErroForm(null);
    setEnviando(true);
    const resultado = await signIn(detalhe.email, senha);
    setEnviando(false);
    if (resultado.error) setErroForm("Senha incorreta pra esse e-mail.");
  }

  async function handleCriarConta(e: React.FormEvent) {
    e.preventDefault();
    if (!detalhe) return;
    if (nome.trim().length < 2) {
      setErroForm("Digite seu nome completo.");
      return;
    }
    if (senha.length < 6) {
      setErroForm("A senha precisa ter pelo menos 6 caracteres.");
      return;
    }
    if (senha !== confirmacao) {
      setErroForm("As senhas não coincidem.");
      return;
    }
    setErroForm(null);
    setEnviando(true);
    const resultado = await signUp(nome.trim(), detalhe.email, senha);
    setEnviando(false);
    if (resultado.error) {
      setErroForm(resultado.error);
      return;
    }
    if (resultado.precisaConfirmarEmail) {
      setErroForm(
        "Enviamos um link de confirmação pro seu e-mail. Confirme e volte nessa mesma página pra aceitar o convite."
      );
    }
  }

  async function handleAceitar() {
    setErroAceitar(null);
    setAceitando(true);
    const { error } = await aceitarConvite(token);
    if (error) {
      setAceitando(false);
      setErroAceitar(error.message || "Não foi possível aceitar o convite. Tente novamente.");
      return;
    }
    await recarregarPerfil();
    setAceitando(false);
    setAceito(true);
    setTimeout(() => router.push("/dashboard"), 1200);
  }

  const emailBate = !!user?.email && !!detalhe && user.email.toLowerCase() === detalhe.email.toLowerCase();

  return (
    <main className="flex min-h-screen items-center justify-center bg-background py-16">
      <Container className="flex max-w-md flex-col">
        {detalhe === undefined || carregandoAuth ? (
          <Card padding="lg" className="flex flex-col items-center gap-3 py-12 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-500 text-white">
              <Wallet size={22} />
            </span>
            <p className="text-body text-muted">Carregando convite...</p>
          </Card>
        ) : detalhe === null || detalhe.status !== "pendente" ? (
          <Card padding="lg" className="flex flex-col items-center gap-4 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-red-500">
              <XCircle size={26} />
            </span>
            <h1 className="text-h2 text-foreground">Convite indisponível</h1>
            <p className="text-body text-muted">
              {detalhe?.status === "ativo"
                ? "Esse convite já foi aceito."
                : detalhe?.status === "removido"
                ? "Esse convite não é mais válido."
                : "Esse link de convite não existe ou expirou."}
            </p>
          </Card>
        ) : aceito ? (
          <Card padding="lg" className="flex flex-col items-center gap-4 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary-600">
              <ShieldCheck size={26} />
            </span>
            <h1 className="text-h2 text-foreground">Convite aceito!</h1>
            <p className="text-body text-muted">Te levando pro painel...</p>
          </Card>
        ) : user && !emailBate ? (
          <Card padding="lg" className="flex flex-col items-center gap-4 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
              <XCircle size={26} />
            </span>
            <h1 className="text-h2 text-foreground">E-mail diferente</h1>
            <p className="text-body text-muted">
              Esse convite foi enviado para <strong>{detalhe.email}</strong>, mas você está logado
              como <strong>{user.email}</strong>.
            </p>
            <Button variant="secondary" onClick={() => signOut()} className="w-full">
              <LogOut size={18} />
              Sair e entrar com outra conta
            </Button>
          </Card>
        ) : user && emailBate ? (
          <Card padding="lg" className="flex flex-col gap-6">
            <div className="flex flex-col items-center gap-2 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-500 text-white">
                <Users size={22} />
              </span>
              <h1 className="text-h2 text-foreground">Você foi convidado(a)</h1>
              <p className="text-body text-muted">
                <strong>{detalhe.nome_convidante}</strong> te convidou pra participar do painel
                compartilhado da empresa dela(e).
              </p>
              <Badge variant="primary">{LABEL_PAPEL[detalhe.papel]}</Badge>
            </div>
            <p className="text-small text-muted text-center">
              Sua vida financeira pessoal continua 100% privada — ninguém, nem quem te convidou, vê
              suas contas, metas ou investimentos pessoais.
            </p>
            {erroAceitar && <p className="text-small text-rose-600 text-center">{erroAceitar}</p>}
            <Button size="lg" onClick={handleAceitar} disabled={aceitando} className="w-full">
              {aceitando ? "Aceitando..." : "Aceitar convite"}
              {!aceitando && <ArrowRight size={18} />}
            </Button>
          </Card>
        ) : (
          <Card padding="lg" className="flex flex-col gap-6">
            <div className="flex flex-col items-center gap-2 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-500 text-white">
                <Users size={22} />
              </span>
              <h1 className="text-h2 text-foreground">Você foi convidado(a)</h1>
              <p className="text-body text-muted">
                <strong>{detalhe.nome_convidante}</strong> te convidou como{" "}
                <strong>{LABEL_PAPEL[detalhe.papel]}</strong>. Entre ou crie sua conta com o e-mail{" "}
                <strong>{detalhe.email}</strong> pra aceitar.
              </p>
            </div>

            <div className="flex gap-1 rounded-full bg-muted/10 p-1 self-center">
              <button
                type="button"
                onClick={() => {
                  setModo("entrar");
                  setErroForm(null);
                }}
                className={`rounded-full px-4 py-2 text-small font-medium transition-colors ${
                  modo === "entrar" ? "bg-card text-foreground shadow-sm" : "text-muted hover:text-foreground"
                }`}
              >
                Já tenho conta
              </button>
              <button
                type="button"
                onClick={() => {
                  setModo("criar");
                  setErroForm(null);
                }}
                className={`rounded-full px-4 py-2 text-small font-medium transition-colors ${
                  modo === "criar" ? "bg-card text-foreground shadow-sm" : "text-muted hover:text-foreground"
                }`}
              >
                Criar conta
              </button>
            </div>

            {modo === "entrar" ? (
              <form onSubmit={handleEntrar} className="flex flex-col gap-4">
                <Input label="E-mail" type="email" leftIcon={Mail} value={detalhe.email} disabled />
                <Input
                  label="Senha"
                  type="password"
                  leftIcon={Lock}
                  placeholder="Sua senha"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  autoComplete="current-password"
                  autoFocus
                />
                {erroForm && <p className="text-small text-rose-600">{erroForm}</p>}
                <Button type="submit" size="lg" disabled={enviando} className="w-full">
                  {enviando ? "Entrando..." : "Entrar e continuar"}
                  {!enviando && <ArrowRight size={18} />}
                </Button>
              </form>
            ) : (
              <form onSubmit={handleCriarConta} className="flex flex-col gap-4">
                <Input label="E-mail" type="email" leftIcon={Mail} value={detalhe.email} disabled />
                <Input
                  label="Nome completo"
                  leftIcon={User}
                  placeholder="Como podemos te chamar?"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  autoComplete="name"
                  autoFocus
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
                {erroForm && <p className="text-small text-rose-600">{erroForm}</p>}
                <Button type="submit" size="lg" disabled={enviando} className="w-full">
                  {enviando ? "Criando conta..." : "Criar minha conta"}
                  {!enviando && <ArrowRight size={18} />}
                </Button>
              </form>
            )}
          </Card>
        )}
      </Container>
    </main>
  );
}
