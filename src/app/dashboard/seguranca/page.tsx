"use client";

import * as React from "react";
import { Check, EyeOff, Fingerprint, KeyRound, Loader2, Lock, ShieldCheck, Trash2 } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { useAuth } from "@/lib/auth/AuthProvider";
import { supabase } from "@/lib/supabase/client";
import { NotificacoesPush } from "@/components/dashboard/NotificacoesPush";
import {
  TEMPOS_DESBLOQUEIO,
  atualizarConfigPin,
  bloquearAgora,
  conferirPin,
  definirPin,
  lerConfigPin,
  lerTentativas,
  pinValido,
  registrarFalha,
  removerPin,
  zerarTentativas,
  type ConfigPin,
} from "@/lib/seguranca/pin";
import {
  biometriaDisponivel,
  cadastrarBiometria,
  ErroBiometria,
  removerBiometriaServidor,
} from "@/lib/seguranca/webauthnCliente";
import { lerOcultarPrevia, salvarOcultarPrevia } from "@/lib/data/privacidade";

interface CredencialConta {
  credential_id: string;
  apelido: string | null;
  criado_em: string;
  ultimo_uso_em: string | null;
}

function somenteDigitos(v: string) {
  return v.replace(/\D/g, "").slice(0, 6);
}

function apelidoDoAparelho(): string {
  const ua = navigator.userAgent;
  if (/iPhone/i.test(ua)) return "iPhone";
  if (/iPad/i.test(ua)) return "iPad";
  if (/Android/i.test(ua)) return "Android";
  if (/Macintosh/i.test(ua)) return "Mac";
  if (/Windows/i.test(ua)) return "Windows";
  return "Este aparelho";
}

/** Segurança e privacidade (Fase 1 da especificação de 03/out/2026). */
export default function SegurancaPage() {
  const { user } = useAuth();
  const uid = user?.id ?? "";
  const [config, setConfig] = React.useState<ConfigPin | null>(null);
  const [carregado, setCarregado] = React.useState(false);

  const recarregarConfig = React.useCallback(() => {
    if (uid) setConfig(lerConfigPin(uid));
  }, [uid]);

  React.useEffect(() => {
    recarregarConfig();
    setCarregado(true);
  }, [recarregarConfig]);

  if (!carregado || !uid) {
    return (
      <Container full className="flex justify-center py-16">
        <Loader2 className="animate-spin text-primary-500" size={28} />
      </Container>
    );
  }

  return (
    <Container full className="flex flex-col gap-6 py-8">
      <div>
        <h1 className="text-h2 text-foreground">Segurança e privacidade</h1>
        <p className="text-small text-muted">
          Proteja o app com PIN ou biometria e escolha o que aparece nas notificações da tela de bloqueio.
        </p>
      </div>

      <CardPin uid={uid} config={config} onMudou={recarregarConfig} />
      <CardBiometria uid={uid} config={config} onMudou={recarregarConfig} />
      <CardPrivacidade uid={uid} />
      <NotificacoesPush />
    </Container>
  );
}

function Cabecalho({ icone, titulo, texto }: { icone: typeof Lock; titulo: string; texto: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-700 dark:text-primary-300">
        <Icon icon={icone} />
      </span>
      <div className="min-w-0">
        <h2 className="text-h3 text-foreground">{titulo}</h2>
        <p className="text-small text-muted">{texto}</p>
      </div>
    </div>
  );
}

function CardPin({ uid, config, onMudou }: { uid: string; config: ConfigPin | null; onMudou: () => void }) {
  const [modo, setModo] = React.useState<"nenhum" | "criar" | "alterar" | "desativar">("nenhum");
  const [atual, setAtual] = React.useState("");
  const [novo, setNovo] = React.useState("");
  const [confirmar, setConfirmar] = React.useState("");
  const [salvando, setSalvando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  const [mensagem, setMensagem] = React.useState<string | null>(null);

  function limpar() {
    setAtual("");
    setNovo("");
    setConfirmar("");
    setErro(null);
  }

  async function conferirAtual(): Promise<boolean> {
    if (lerTentativas(uid).bloqueadoAte > Date.now()) {
      setErro("Muitas tentativas erradas. Aguarde alguns minutos.");
      return false;
    }
    const ok = await conferirPin(uid, atual);
    if (!ok) {
      registrarFalha(uid);
      setErro("PIN atual incorreto.");
      return false;
    }
    zerarTentativas(uid);
    return true;
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setMensagem(null);
    setSalvando(true);
    try {
      if (modo === "desativar") {
        if (!(await conferirAtual())) return;
        const credenciais = config?.biometria ?? [];
        removerPin(uid);
        for (const c of credenciais) await removerBiometriaServidor(c);
        setMensagem("PIN desativado neste aparelho.");
      } else {
        if (modo === "alterar" && !(await conferirAtual())) return;
        if (!pinValido(novo)) {
          setErro("O PIN precisa ter de 4 a 6 números.");
          return;
        }
        if (novo !== confirmar) {
          setErro("Os dois PINs digitados não são iguais.");
          return;
        }
        await definirPin(uid, novo);
        setMensagem(modo === "criar" ? "PIN criado. O app vai pedir esse PIN ao abrir." : "PIN alterado.");
      }
      limpar();
      setModo("nenhum");
      onMudou();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Card padding="lg" className="flex flex-col gap-5">
      <Cabecalho
        icone={KeyRound}
        titulo="PIN de acesso"
        texto="Um código de 4 a 6 números pedido ao abrir o app. Fica guardado só neste aparelho, criptografado — nunca vai para o servidor."
      />

      {config ? (
        <p className="flex items-center gap-2 text-small font-medium text-primary-700 dark:text-primary-300">
          <ShieldCheck size={16} /> PIN ativado neste aparelho ({config.digitos} dígitos)
        </p>
      ) : (
        <p className="text-small text-muted">PIN desativado neste aparelho.</p>
      )}

      {config && (
        <label className="flex flex-col gap-1.5 sm:max-w-xs">
          <span className="text-small font-medium text-foreground">Manter desbloqueado por</span>
          <select
            value={config.minutos}
            onChange={(e) => {
              atualizarConfigPin(uid, { minutos: Number(e.target.value) });
              onMudou();
            }}
            className="h-11 rounded-xl border border-border bg-card px-4 text-small text-foreground"
          >
            {TEMPOS_DESBLOQUEIO.map((t) => (
              <option key={t.minutos} value={t.minutos}>
                {t.rotulo}
              </option>
            ))}
          </select>
          <span className="text-xs text-muted">
            Depois desse tempo sem mexer no app (ou fora dele), o PIN é pedido de novo. &quot;Imediatamente&quot; bloqueia sempre que você sai do app.
          </span>
        </label>
      )}

      {modo !== "nenhum" ? (
        <form onSubmit={salvar} className="flex flex-col gap-3 sm:max-w-xs">
          {(modo === "alterar" || modo === "desativar") && (
            <Input
              label="PIN atual"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              value={atual}
              onChange={(e) => setAtual(somenteDigitos(e.target.value))}
            />
          )}
          {(modo === "criar" || modo === "alterar") && (
            <>
              <Input
                label="Novo PIN (4 a 6 números)"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                value={novo}
                onChange={(e) => setNovo(somenteDigitos(e.target.value))}
              />
              <Input
                label="Repita o novo PIN"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                value={confirmar}
                onChange={(e) => setConfirmar(somenteDigitos(e.target.value))}
              />
            </>
          )}
          {erro && <p className="text-small font-medium text-rose-700 dark:text-rose-300">{erro}</p>}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={salvando}>
              {salvando && <Loader2 size={18} className="animate-spin" />}
              {modo === "criar" ? "Criar PIN" : modo === "alterar" ? "Salvar novo PIN" : "Desativar PIN"}
            </Button>
            <Button
              type="button"
              variant="tertiary"
              onClick={() => {
                limpar();
                setModo("nenhum");
              }}
            >
              Cancelar
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          {config ? (
            <>
              <Button type="button" variant="tertiary" onClick={() => setModo("alterar")}>
                Alterar PIN
              </Button>
              <Button
                type="button"
                variant="tertiary"
                onClick={() => {
                  bloquearAgora(uid);
                  window.location.reload();
                }}
              >
                <Lock size={16} /> Bloquear agora
              </Button>
              <button
                type="button"
                onClick={() => setModo("desativar")}
                className="h-11 rounded-xl px-4 text-small font-medium text-rose-700 hover:bg-rose-50 dark:text-rose-300"
              >
                Desativar PIN
              </button>
            </>
          ) : (
            <Button type="button" onClick={() => setModo("criar")}>
              Criar PIN
            </Button>
          )}
        </div>
      )}

      {mensagem && (
        <p className="flex items-center gap-2 text-small text-primary-700 dark:text-primary-300">
          <Check size={16} /> {mensagem}
        </p>
      )}
    </Card>
  );
}

function CardBiometria({ uid, config, onMudou }: { uid: string; config: ConfigPin | null; onMudou: () => void }) {
  const [disponivel, setDisponivel] = React.useState<boolean | null>(null);
  const [credenciais, setCredenciais] = React.useState<CredencialConta[]>([]);
  const [salvando, setSalvando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  const [mensagem, setMensagem] = React.useState<string | null>(null);

  const carregar = React.useCallback(async () => {
    const { data } = await supabase
      .from("user_authenticators")
      .select("credential_id, apelido, criado_em, ultimo_uso_em")
      .eq("user_id", uid)
      .order("criado_em", { ascending: false });
    setCredenciais((data as CredencialConta[]) ?? []);
  }, [uid]);

  React.useEffect(() => {
    biometriaDisponivel().then(setDisponivel);
    void carregar();
  }, [carregar]);

  const ativaNeste = (config?.biometria.length ?? 0) > 0;

  async function ativar() {
    setErro(null);
    setMensagem(null);
    setSalvando(true);
    try {
      const id = await cadastrarBiometria(apelidoDoAparelho());
      atualizarConfigPin(uid, { biometria: [...(config?.biometria ?? []), id] });
      setMensagem("Biometria ativada. Na próxima vez, o app pede seu rosto ou digital.");
      onMudou();
      await carregar();
    } catch (e) {
      if (!(e instanceof ErroBiometria && e.cancelado)) {
        setErro(e instanceof Error ? e.message : "Não foi possível ativar.");
      }
    } finally {
      setSalvando(false);
    }
  }

  async function remover(credentialId: string) {
    setSalvando(true);
    await removerBiometriaServidor(credentialId);
    atualizarConfigPin(uid, { biometria: (config?.biometria ?? []).filter((c) => c !== credentialId) });
    onMudou();
    await carregar();
    setSalvando(false);
  }

  return (
    <Card padding="lg" className="flex flex-col gap-5">
      <Cabecalho
        icone={Fingerprint}
        titulo="Biometria / Face ID"
        texto="Desbloqueie com Face ID, Touch ID, digital do Android ou Windows Hello. O PIN continua valendo como alternativa."
      />

      {!config ? (
        <p className="text-small text-muted">Crie um PIN primeiro — ele é a alternativa quando a biometria não funcionar.</p>
      ) : disponivel === null ? (
        <p className="flex items-center gap-2 text-small text-muted">
          <Loader2 size={16} className="animate-spin" /> Verificando o aparelho...
        </p>
      ) : !disponivel ? (
        <p className="text-small text-muted">
          Este aparelho ou navegador não tem leitor biométrico compatível. No iPhone, use o app instalado na Tela de Início (Safari).
        </p>
      ) : ativaNeste ? (
        <p className="flex items-center gap-2 text-small font-medium text-primary-700 dark:text-primary-300">
          <ShieldCheck size={16} /> Biometria ativada neste aparelho
        </p>
      ) : (
        <Button type="button" onClick={ativar} disabled={salvando} className="self-start">
          {salvando ? <Loader2 size={18} className="animate-spin" /> : <Fingerprint size={18} />}
          Ativar neste aparelho
        </Button>
      )}

      {credenciais.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-small font-medium text-foreground">Aparelhos com biometria nesta conta</p>
          {credenciais.map((c) => (
            <div key={c.credential_id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-small text-foreground">
                  {c.apelido ?? "Aparelho"}
                  {config?.biometria.includes(c.credential_id) ? " (este)" : ""}
                </p>
                <p className="text-xs text-muted">
                  Cadastrado em {new Date(c.criado_em).toLocaleDateString("pt-BR")}
                  {c.ultimo_uso_em ? ` · último uso ${new Date(c.ultimo_uso_em).toLocaleDateString("pt-BR")}` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void remover(c.credential_id)}
                disabled={salvando}
                className="flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50 dark:text-rose-300"
              >
                <Trash2 size={14} /> Remover
              </button>
            </div>
          ))}
        </div>
      )}

      {erro && <p className="text-small font-medium text-rose-700 dark:text-rose-300">{erro}</p>}
      {mensagem && (
        <p className="flex items-center gap-2 text-small text-primary-700 dark:text-primary-300">
          <Check size={16} /> {mensagem}
        </p>
      )}
    </Card>
  );
}

function CardPrivacidade({ uid }: { uid: string }) {
  const [ocultar, setOcultar] = React.useState<boolean | null>(null);
  const [salvando, setSalvando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);

  React.useEffect(() => {
    lerOcultarPrevia(uid).then(setOcultar);
  }, [uid]);

  async function alternar() {
    if (ocultar === null) return;
    const novo = !ocultar;
    setSalvando(true);
    setErro(null);
    const { error } = await salvarOcultarPrevia(uid, novo);
    setSalvando(false);
    if (error) {
      setErro("Não foi possível salvar. Tente de novo.");
      return;
    }
    setOcultar(novo);
  }

  return (
    <Card padding="lg" className="flex flex-col gap-5">
      <Cabecalho
        icone={EyeOff}
        titulo="Bloqueio de prévia das notificações"
        texto="Escolha se valores e descrições aparecem nas notificações da tela de bloqueio do celular."
      />
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-small font-medium text-foreground">Ocultar prévia das notificações</p>
          <p className="text-xs text-muted">
            {ocultar
              ? "Ligado: aparece só “Você tem uma notificação do Calixto”."
              : "Desligado: aparece o detalhe, ex.: “Conta de Luz vence amanhã — R$ 150,00”."}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={!!ocultar}
          aria-label="Ocultar prévia das notificações"
          disabled={ocultar === null || salvando}
          onClick={alternar}
          className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50 ${ocultar ? "bg-primary-700" : "bg-slate-400 dark:bg-slate-600"}`}
        >
          <span
            className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${ocultar ? "left-[1.375rem]" : "left-0.5"}`}
          />
        </button>
      </div>
      {erro && <p className="text-small font-medium text-rose-700 dark:text-rose-300">{erro}</p>}
    </Card>
  );
}
