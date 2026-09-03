"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Briefcase, Building2, User, Camera, Check, Loader2, LogOut, Trash2 } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth/AuthProvider";
import { atualizarNome, atualizarTipoPerfil, deletarFotoPerfil, enviarFotoPerfil } from "@/lib/data/usuarios";

type TipoPerfil = "clt" | "mei" | "me";

const PERFIS: { id: TipoPerfil; icon: typeof User; titulo: string; texto: string }[] = [
  { id: "clt", icon: User, titulo: "CLT", texto: "Trabalho com carteira assinada." },
  { id: "mei", icon: Briefcase, titulo: "MEI", texto: "Sou microempreendedor individual." },
  { id: "me", icon: Building2, titulo: "ME", texto: "Tenho uma pequena empresa." },
];

const TAMANHO_MAXIMO_MB = 3;
const TIPOS_ACEITOS = ["image/jpeg", "image/png", "image/webp"];

export default function PerfilPage() {
  const router = useRouter();
  const { user, perfil, signOut, recarregarPerfil } = useAuth();

  const [nome, setNome] = React.useState("");
  const [tipoPerfil, setTipoPerfil] = React.useState<TipoPerfil | null>(null);
  const [salvando, setSalvando] = React.useState(false);
  const [enviandoFoto, setEnviandoFoto] = React.useState(false);
  const [mensagem, setMensagem] = React.useState<string | null>(null);
  const [erro, setErro] = React.useState<string | null>(null);
  const inputFotoRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (perfil) {
      setNome(perfil.nome);
      setTipoPerfil(perfil.tipo_perfil);
    }
  }, [perfil]);

  async function handleEscolherFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    e.target.value = ""; // permite escolher o mesmo arquivo de novo depois, se precisar

    if (!arquivo || !user) return;

    if (!TIPOS_ACEITOS.includes(arquivo.type)) {
      setErro("Escolha uma imagem JPG, PNG ou WEBP.");
      return;
    }
    if (arquivo.size > TAMANHO_MAXIMO_MB * 1024 * 1024) {
      setErro(`A imagem precisa ter até ${TAMANHO_MAXIMO_MB}MB.`);
      return;
    }

    setErro(null);
    setMensagem(null);
    setEnviandoFoto(true);
    const { error } = await enviarFotoPerfil(user.id, arquivo);
    setEnviandoFoto(false);
    if (error) {
      setErro("Não foi possível enviar a foto. Tente novamente.");
      return;
    }
    await recarregarPerfil();
    setMensagem("Foto atualizada.");
  }

  async function handleRemoverFoto() {
    if (!user) return;
    setErro(null);
    setMensagem(null);
    setEnviandoFoto(true);
    const { error } = await deletarFotoPerfil(user.id);
    setEnviandoFoto(false);
    if (error) {
      setErro("Não foi possível remover a foto. Tente novamente.");
      return;
    }
    await recarregarPerfil();
    setMensagem("Foto removida.");
  }

  async function handleSalvar() {
    if (!user || !perfil) return;
    const nomeLimpo = nome.trim();
    if (nomeLimpo.length < 2) {
      setErro("Digite seu nome.");
      return;
    }
    if (!tipoPerfil) {
      setErro("Escolha um tipo de perfil.");
      return;
    }

    setErro(null);
    setMensagem(null);
    setSalvando(true);

    if (nomeLimpo !== perfil.nome) {
      const { error } = await atualizarNome(user.id, nomeLimpo);
      if (error) {
        setSalvando(false);
        setErro("Não foi possível salvar o nome. Tente novamente.");
        return;
      }
    }
    if (tipoPerfil !== perfil.tipo_perfil) {
      const { error } = await atualizarTipoPerfil(user.id, tipoPerfil);
      if (error) {
        setSalvando(false);
        setErro("Não foi possível salvar o tipo de perfil. Tente novamente.");
        return;
      }
    }

    await recarregarPerfil();
    setSalvando(false);
    setMensagem("Perfil atualizado.");
  }

  async function handleSignOut() {
    await signOut();
    router.push("/");
  }

  if (!perfil) return null;

  const iniciais = perfil.nome
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase())
    .join("");

  return (
    <Container className="flex max-w-2xl flex-col gap-8 py-8">
      <div>
        <h1 className="text-h2 text-foreground">Seu perfil</h1>
        <p className="text-body text-muted">Seus dados, sua foto e o tipo de perfil.</p>
      </div>

      {mensagem && (
        <Card className="flex items-center gap-3 border-primary-200 bg-primary-50">
          <Check size={20} className="text-primary-600" />
          <p className="text-body text-primary-800">{mensagem}</p>
        </Card>
      )}

      <Card padding="lg" className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center gap-5">
          <div className="relative shrink-0">
            <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-primary-100 text-h3 font-semibold text-primary-700">
              {perfil.foto_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={perfil.foto_url}
                  alt="Sua foto de perfil"
                  className="h-full w-full object-cover"
                />
              ) : (
                iniciais || <User size={28} />
              )}
            </div>
            {enviandoFoto && (
              <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40">
                <Loader2 size={20} className="animate-spin text-white" />
              </div>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="tertiary"
                onClick={() => inputFotoRef.current?.click()}
                disabled={enviandoFoto || salvando}
              >
                <Camera size={16} />
                {perfil.foto_url ? "Trocar foto" : "Adicionar foto"}
              </Button>
              {perfil.foto_url && (
                <Button
                  type="button"
                  size="sm"
                  variant="tertiary"
                  onClick={handleRemoverFoto}
                  disabled={enviandoFoto || salvando}
                >
                  <Trash2 size={16} />
                  Remover
                </Button>
              )}
            </div>
            <p className="text-small text-muted">JPG, PNG ou WEBP, até {TAMANHO_MAXIMO_MB}MB.</p>
            <input
              ref={inputFotoRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleEscolherFoto}
            />
          </div>
        </div>

        <Input label="Nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Seu nome" />

        <div className="flex flex-col gap-1.5">
          <span className="text-small font-medium text-foreground">E-mail</span>
          <p className="text-body text-muted">{perfil.email}</p>
        </div>
      </Card>

      <Card padding="lg" className="flex flex-col gap-5">
        <div>
          <h2 className="text-h3 text-foreground">Tipo de perfil</h2>
          <p className="text-small text-muted">
            Isso deixa o app com a cara certa pro seu dia a dia. A área &quot;Minha empresa&quot;
            é liberada pra qualquer perfil que estiver no plano Avançado.
          </p>
        </div>
        <div className="flex flex-col gap-3">
          {PERFIS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setTipoPerfil(p.id)}
              className={cn(
                "flex items-center gap-4 rounded-2xl border-2 p-4 text-left transition-all duration-200",
                tipoPerfil === p.id
                  ? "border-primary-500 bg-primary-50"
                  : "border-border bg-card hover:border-muted/40"
              )}
            >
              <span
                className={cn(
                  "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
                  tipoPerfil === p.id ? "bg-primary-500 text-white" : "bg-muted/15 text-muted"
                )}
              >
                <Icon icon={p.icon} />
              </span>
              <span className="flex-1">
                <span className="block text-body font-semibold text-foreground">{p.titulo}</span>
                <span className="block text-small text-muted">{p.texto}</span>
              </span>
              {tipoPerfil === p.id && <Check size={20} className="text-primary-600" />}
            </button>
          ))}
        </div>
      </Card>

      {erro && <p className="text-small text-rose-600">{erro}</p>}

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button
          size="lg"
          onClick={handleSalvar}
          disabled={salvando || enviandoFoto}
          className="w-full sm:w-auto"
        >
          {salvando ? "Salvando..." : "Salvar alterações"}
        </Button>
        <Button size="lg" variant="tertiary" onClick={handleSignOut} className="w-full sm:w-auto">
          <LogOut size={18} />
          Sair da conta
        </Button>
      </div>
    </Container>
  );
}
