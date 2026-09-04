"use client";

import * as React from "react";
import Link from "next/link";
import { UserPlus, Copy, Check, Trash2, Users, Lock } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { useAuth } from "@/lib/auth/AuthProvider";
import { listarMembros, convidarMembro, removerMembro, atualizarPapelMembro } from "@/lib/data/membros";
import { PLANOS, LIMITE_CONVIDADOS_GRUPO, podeConvidarMembros } from "@/lib/planos";
import type { Membro } from "@/lib/data/tipos";

const LABEL_PAPEL: Record<"socio" | "funcionario", string> = {
  socio: "Sócio",
  funcionario: "Funcionário",
};

const LABEL_STATUS: Record<Membro["status"], { texto: string; variant: "warning" | "primary" | "neutral" }> = {
  pendente: { texto: "Convite pendente", variant: "warning" },
  ativo: { texto: "Ativo", variant: "primary" },
  removido: { texto: "Removido", variant: "neutral" },
};

export default function EquipePage() {
  const { perfil, papel, negocio } = useAuth();

  const [membros, setMembros] = React.useState<Membro[]>([]);
  const [carregando, setCarregando] = React.useState(true);
  const [formAberto, setFormAberto] = React.useState(false);
  const [email, setEmail] = React.useState("");
  const [papelNovo, setPapelNovo] = React.useState<"socio" | "funcionario">("socio");
  const [salvando, setSalvando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  const [linkCopiado, setLinkCopiado] = React.useState<string | null>(null);
  const [confirmandoRemocaoId, setConfirmandoRemocaoId] = React.useState<string | null>(null);

  const carregar = React.useCallback(async () => {
    if (!perfil) return;
    setCarregando(true);
    setMembros(await listarMembros(perfil.id));
    setCarregando(false);
  }, [perfil]);

  React.useEffect(() => {
    carregar();
  }, [carregar]);

  if (!perfil) return null;

  // Só o dono da conta gerencia convites — sócio/funcionário só veem um
  // aviso de quem é a empresa em que estão.
  if (papel !== "dono") {
    return (
      <Container full className="flex flex-col gap-8 py-8">
        <div>
          <h1 className="text-h2 text-foreground">Minha equipe</h1>
          <p className="text-body text-muted">Só o dono da conta pode convidar ou remover pessoas.</p>
        </div>
        <Card className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
            <Users size={20} />
          </span>
          <div>
            <p className="text-body font-medium text-foreground">
              Você está na conta de {negocio?.nome ?? "outra pessoa"} como{" "}
              {papel === "socio" ? "sócio" : "funcionário"}.
            </p>
            <p className="text-small text-muted">Sua vida financeira pessoal continua 100% privada.</p>
          </div>
        </Card>
      </Container>
    );
  }

  const liberado = podeConvidarMembros(perfil.plano);
  const ativosOuPendentes = membros.filter((m) => m.status !== "removido");
  const atingiuLimite = ativosOuPendentes.length >= LIMITE_CONVIDADOS_GRUPO;

  function abrirForm() {
    setEmail("");
    setPapelNovo("socio");
    setErro(null);
    setLinkCopiado(null);
    setFormAberto(true);
  }

  async function handleConvidar(e: React.FormEvent) {
    e.preventDefault();
    if (!perfil) return;
    if (!email.includes("@")) {
      setErro("Digite um e-mail válido.");
      return;
    }
    setErro(null);
    setSalvando(true);
    const { error } = await convidarMembro(perfil.id, email, papelNovo);
    setSalvando(false);
    if (error) {
      setErro(error.message || "Não foi possível enviar o convite. Tente novamente.");
      return;
    }
    setFormAberto(false);
    carregar();
  }

  async function handleRemover(id: string) {
    setSalvando(true);
    await removerMembro(id);
    setSalvando(false);
    setConfirmandoRemocaoId(null);
    carregar();
  }

  async function handleMudarPapel(id: string, novoPapel: "socio" | "funcionario") {
    setSalvando(true);
    await atualizarPapelMembro(id, novoPapel);
    setSalvando(false);
    carregar();
  }

  function copiarLink(token: string) {
    const link = `${window.location.origin}/convite/${token}`;
    navigator.clipboard?.writeText(link).then(() => {
      setLinkCopiado(token);
      setTimeout(() => setLinkCopiado((atual) => (atual === token ? null : atual)), 2500);
    });
  }

  return (
    <Container full className="flex flex-col gap-8 py-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-h2 text-foreground">Minha equipe</h1>
          <p className="text-body text-muted">Convide até {LIMITE_CONVIDADOS_GRUPO} pessoas pro painel compartilhado.</p>
        </div>
        {liberado && (
          <Button onClick={abrirForm} disabled={atingiuLimite}>
            <UserPlus size={18} />
            Convidar pessoa
          </Button>
        )}
      </div>

      {!liberado ? (
        <Card className="flex flex-col items-center gap-3 py-12 text-center">
          <Lock size={28} className="text-primary-400" />
          <p className="text-body text-foreground">
            Convidar sócio ou funcionário é exclusivo do plano <strong>{PLANOS.grupo.nome}</strong> (
            {PLANOS.grupo.precoLabel}).
          </p>
          <p className="text-small text-muted max-w-sm">
            Até 3 pessoas, cada uma com seu próprio login. A vida pessoal de cada um continua 100%
            privada — só o negócio é compartilhado.
          </p>
          <Link href="/dashboard/plano">
            <Button>Ver plano Grupo</Button>
          </Link>
        </Card>
      ) : (
        <>
          {formAberto && (
            <Card padding="lg" className="flex flex-col gap-4">
              <h2 className="text-h3 text-foreground">Convidar pessoa</h2>
              <form onSubmit={handleConvidar} className="flex flex-col gap-4">
                <Input
                  label="E-mail"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="pessoa@email.com"
                  autoFocus
                />
                <div className="flex flex-col gap-1.5">
                  <span className="text-small font-medium text-foreground">Papel</span>
                  <div className="flex gap-2">
                    {(["socio", "funcionario"] as const).map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPapelNovo(p)}
                        className={`flex-1 rounded-xl border-2 px-3 py-2.5 text-left text-small transition-all ${
                          papelNovo === p ? "border-primary-400 bg-primary-50" : "border-border"
                        }`}
                      >
                        <p className="font-semibold text-foreground">{LABEL_PAPEL[p]}</p>
                        <p className="text-xs text-muted">
                          {p === "socio" ? "Acesso completo à empresa" : "Só estoque e vendas"}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
                {erro && <p className="text-small text-rose-600">{erro}</p>}
                <div className="flex gap-2">
                  <Button type="submit" disabled={salvando} className="flex-1">
                    {salvando ? "Enviando..." : "Enviar convite"}
                  </Button>
                  <Button type="button" variant="tertiary" onClick={() => setFormAberto(false)}>
                    Cancelar
                  </Button>
                </div>
              </form>
            </Card>
          )}

          {carregando ? (
            <p className="py-8 text-center text-body text-muted">Carregando...</p>
          ) : ativosOuPendentes.length === 0 ? (
            <Card className="flex flex-col items-center gap-3 py-12 text-center">
              <Users size={28} className="text-primary-400" />
              <p className="text-body text-muted">Você ainda não convidou ninguém.</p>
              <Button onClick={abrirForm}>
                <UserPlus size={18} />
                Convidar primeira pessoa
              </Button>
            </Card>
          ) : (
            <div className="flex flex-col gap-2">
              {ativosOuPendentes.map((m) => (
                <Card key={m.id} padding="sm" className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
                        <Users size={18} />
                      </span>
                      <div>
                        <p className="text-body font-medium text-foreground">{m.email}</p>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={LABEL_STATUS[m.status].variant} size="sm">
                            {LABEL_STATUS[m.status].texto}
                          </Badge>
                          <span className="text-small text-muted">{LABEL_PAPEL[m.papel]}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {m.status === "pendente" && (
                        <Button size="sm" variant="secondary" onClick={() => copiarLink(m.token)}>
                          {linkCopiado === m.token ? <Check size={14} /> : <Copy size={14} />}
                          {linkCopiado === m.token ? "Copiado" : "Copiar link"}
                        </Button>
                      )}
                      <select
                        value={m.papel}
                        onChange={(e) => handleMudarPapel(m.id, e.target.value as "socio" | "funcionario")}
                        disabled={salvando}
                        className="h-9 rounded-lg border border-border bg-card px-2 text-xs text-foreground focus:border-primary-500 focus:outline-none"
                      >
                        <option value="socio">Sócio</option>
                        <option value="funcionario">Funcionário</option>
                      </select>
                      {confirmandoRemocaoId === m.id ? (
                        <div className="flex items-center gap-1">
                          <Button size="sm" variant="tertiary" onClick={() => setConfirmandoRemocaoId(null)}>
                            Não
                          </Button>
                          <Button
                            size="sm"
                            disabled={salvando}
                            onClick={() => handleRemover(m.id)}
                            className="bg-red-500 shadow-none hover:bg-red-600 active:bg-red-700"
                          >
                            Remover
                          </Button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          aria-label="Remover"
                          onClick={() => setConfirmandoRemocaoId(m.id)}
                          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-rose-50 hover:text-red-500"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </Container>
  );
}
