"use client";

import * as React from "react";
import { Delete, Fingerprint, Loader2, Lock, LogOut } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { supabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils";
import {
  MAX_TENTATIVAS,
  bloquearAgora,
  conferirPin,
  lerConfigPin,
  lerTentativas,
  marcarDesbloqueado,
  precisaDesbloquear,
  registrarAtividade,
  registrarFalha,
  removerPin,
  zerarTentativas,
} from "@/lib/seguranca/pin";
import { autenticarComBiometria, biometriaDisponivel, ErroBiometria } from "@/lib/seguranca/webauthnCliente";

/**
 * Barreira de PIN/biometria (Fase 1 da especificação de 03/out/2026).
 *
 * Ao ABRIR o app bloqueado, as telas do painel nem são montadas: nada de
 * dado financeiro é buscado nem fica no DOM, e recarregar a página cai de
 * novo aqui (desbloqueio e tentativas ficam salvos no aparelho).
 * Se o bloqueio acontece com o app já em uso, as telas ficam escondidas
 * (sem desmontar) pra pessoa voltar exatamente de onde parou.
 */
export function PinGate({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const uid = user?.id ?? "";
  const [verificado, setVerificado] = React.useState(false);
  const [bloqueado, setBloqueadoEstado] = React.useState(true);
  // Já desbloqueou nesta abertura do app? A partir daí, bloquear de novo NÃO
  // desmonta as telas: elas ficam escondidas (display:none + inert) atrás da
  // tela de PIN e voltam exatamente como estavam — formulário pela metade,
  // item aberto, posição da rolagem (pedido do usuário em 05/out/2026).
  const [jaDesbloqueou, setJaDesbloqueou] = React.useState(false);
  const rolagemRef = React.useRef(0);
  const conteudoRef = React.useRef<HTMLDivElement>(null);

  const setBloqueado = React.useCallback((valor: boolean) => {
    if (valor) rolagemRef.current = window.scrollY;
    setBloqueadoEstado(valor);
  }, []);

  React.useEffect(() => {
    if (!uid) return;
    setBloqueado(precisaDesbloquear(uid));
    setVerificado(true);
  }, [uid, setBloqueado]);

  // Esconde do teclado/leitor de tela o conteúdo atrás do bloqueio.
  React.useEffect(() => {
    conteudoRef.current?.toggleAttribute("inert", bloqueado);
  }, [bloqueado, jaDesbloqueou]);

  // Inatividade + saída do app ("Manter desbloqueado por").
  React.useEffect(() => {
    if (!uid || bloqueado) return;
    if (!lerConfigPin(uid)) return;

    let ultimoRegistro = 0;
    const atividade = () => {
      const agora = Date.now();
      if (agora - ultimoRegistro < 5000) return;
      ultimoRegistro = agora;
      if (precisaDesbloquear(uid)) {
        setBloqueado(true);
        return;
      }
      registrarAtividade(uid);
    };
    const visibilidade = () => {
      const c = lerConfigPin(uid);
      if (!c) return;
      if (document.visibilityState === "hidden") {
        if (c.minutos <= 0) bloquearAgora(uid);
        else registrarAtividade(uid);
      } else if (precisaDesbloquear(uid)) {
        setBloqueado(true);
      }
    };
    const saindo = () => {
      const c = lerConfigPin(uid);
      if (c && c.minutos <= 0) bloquearAgora(uid);
    };
    const intervalo = window.setInterval(() => {
      if (precisaDesbloquear(uid)) setBloqueado(true);
    }, 15000);

    const eventos = ["pointerdown", "keydown", "touchstart", "wheel"] as const;
    eventos.forEach((e) => window.addEventListener(e, atividade, { passive: true }));
    document.addEventListener("visibilitychange", visibilidade);
    window.addEventListener("pagehide", saindo);
    window.addEventListener("focus", visibilidade);
    return () => {
      window.clearInterval(intervalo);
      eventos.forEach((e) => window.removeEventListener(e, atividade));
      document.removeEventListener("visibilitychange", visibilidade);
      window.removeEventListener("pagehide", saindo);
      window.removeEventListener("focus", visibilidade);
    };
  }, [uid, bloqueado, setBloqueado]);

  if (!uid || !verificado) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="animate-spin text-primary-500" size={28} />
      </main>
    );
  }

  const desbloquear = () => {
    marcarDesbloqueado(uid);
    setBloqueado(false);
    setJaDesbloqueou(true);
    const y = rolagemRef.current;
    // Volta pra mesma altura da tela depois que o conteúdo reaparece.
    requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, y)));
  };

  // Abertura do app já bloqueada: nada do painel é montado nem buscado.
  if (bloqueado && !jaDesbloqueou) {
    return <TelaBloqueio uid={uid} email={user?.email ?? ""} onDesbloquear={desbloquear} />;
  }

  return (
    <>
      <div ref={conteudoRef} className={bloqueado ? "hidden" : undefined} aria-hidden={bloqueado || undefined}>
        {children}
      </div>
      {bloqueado && (
        <div className="fixed inset-0 z-[100] overflow-y-auto bg-background">
          <TelaBloqueio uid={uid} email={user?.email ?? ""} onDesbloquear={desbloquear} />
        </div>
      )}
    </>
  );
}

function formatarEspera(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function TelaBloqueio({ uid, email, onDesbloquear }: { uid: string; email: string; onDesbloquear: () => void }) {
  const { signOut } = useAuth();
  const config = React.useMemo(() => lerConfigPin(uid), [uid]);
  const digitos = config?.digitos ?? 4;
  const [pin, setPin] = React.useState("");
  const [conferindo, setConferindo] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  const [agora, setAgora] = React.useState(() => Date.now());
  const [tentativas, setTentativas] = React.useState(() => lerTentativas(uid));
  const [temBiometria, setTemBiometria] = React.useState(false);
  const [lendoBiometria, setLendoBiometria] = React.useState(false);
  const [esqueci, setEsqueci] = React.useState(false);
  const [senha, setSenha] = React.useState("");
  const [erroSenha, setErroSenha] = React.useState<string | null>(null);
  const [confirmandoSenha, setConfirmandoSenha] = React.useState(false);
  const tentouAuto = React.useRef(false);
  // O PIN digitado fica também num ref: a conferência roda fora do
  // "updater" do setState (no modo estrito do React ele roda duas vezes e
  // contaria duas falhas por erro).
  const pinRef = React.useRef("");


  const congeladoMs = tentativas.bloqueadoAte - agora;
  const congelado = congeladoMs > 0;

  React.useEffect(() => {
    if (!congelado) return;
    const t = window.setInterval(() => setAgora(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [congelado]);

  const usarBiometria = React.useCallback(async () => {
    if (!config || config.biometria.length === 0) return;
    setLendoBiometria(true);
    setErro(null);
    try {
      await autenticarComBiometria(config.biometria);
      zerarTentativas(uid);
      onDesbloquear();
    } catch (e) {
      // Cancelou ou não reconheceu: volta pro PIN em silêncio.
      if (!(e instanceof ErroBiometria && e.cancelado)) {
        setErro(e instanceof Error ? e.message : "Não foi possível usar a biometria.");
      }
    } finally {
      setLendoBiometria(false);
    }
  }, [config, uid, onDesbloquear]);

  // Ao abrir a tela, se este aparelho tem biometria cadastrada e suportada,
  // já chama o Face ID/digital/Windows Hello sozinho (uma vez).
  React.useEffect(() => {
    let cancelado = false;
    if (!config || config.biometria.length === 0) return;
    biometriaDisponivel().then((ok) => {
      if (cancelado || !ok) return;
      setTemBiometria(true);
      if (!tentouAuto.current) {
        tentouAuto.current = true;
        void usarBiometria();
      }
    });
    return () => {
      cancelado = true;
    };
  }, [config, usarBiometria]);

  const conferir = React.useCallback(
    async (valor: string) => {
      if (lerTentativas(uid).bloqueadoAte > Date.now()) return;
      setConferindo(true);
      const ok = await conferirPin(uid, valor);
      setConferindo(false);
      if (ok) {
        zerarTentativas(uid);
        onDesbloquear();
        return;
      }
      const novo = registrarFalha(uid);
      setTentativas(novo);
      setAgora(Date.now());
      pinRef.current = "";
      setPin("");
      if (novo.bloqueadoAte > Date.now()) {
        setErro("Muitas tentativas erradas. Aguarde para tentar de novo.");
      } else {
        const restam = MAX_TENTATIVAS - novo.falhas;
        setErro(`PIN incorreto. ${restam} ${restam === 1 ? "tentativa" : "tentativas"} antes de uma pausa.`);
      }
    },
    [uid, onDesbloquear]
  );

  const digitar = React.useCallback(
    (d: string) => {
      if (conferindo || congelado || esqueci) return;
      const atual = pinRef.current;
      if (atual.length >= digitos) return;
      const novo = atual + d;
      pinRef.current = novo;
      setErro(null);
      setPin(novo);
      if (novo.length === digitos) void conferir(novo);
    },
    [conferindo, congelado, esqueci, digitos, conferir]
  );

  const apagar = React.useCallback(() => {
    pinRef.current = pinRef.current.slice(0, -1);
    setPin(pinRef.current);
  }, []);

  // Teclado físico (computador).
  React.useEffect(() => {
    if (esqueci) return;
    const tecla = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) {
        e.preventDefault();
        digitar(e.key);
      } else if (e.key === "Backspace") {
        e.preventDefault();
        apagar();
      }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [digitar, apagar, esqueci]);

  async function confirmarSenhaEsqueci(e: React.FormEvent) {
    e.preventDefault();
    if (!senha) return;
    setConfirmandoSenha(true);
    setErroSenha(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
    setConfirmandoSenha(false);
    if (error) {
      setErroSenha(/invalid login/i.test(error.message) ? "Senha incorreta." : "Não foi possível confirmar agora.");
      return;
    }
    removerPin(uid);
    onDesbloquear();
  }

  const teclas = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-10">
      <div className="flex w-full max-w-xs flex-col items-center gap-6">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-700 text-white shadow-soft">
          <Lock size={26} />
        </span>
        <div className="text-center">
          <h1 className="text-h2 text-foreground">App bloqueado</h1>
          <p className="text-small text-muted">{esqueci ? "Confirme a senha da sua conta" : "Digite seu PIN para continuar"}</p>
        </div>

        {esqueci ? (
          <form onSubmit={confirmarSenhaEsqueci} className="flex w-full flex-col gap-3">
            <Input
              label="Senha da conta"
              type="password"
              autoComplete="current-password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              error={erroSenha ?? undefined}
              autoFocus
            />
            <p className="text-xs text-muted">Confirmando a senha, o PIN deste aparelho é apagado. Você pode criar outro em Segurança.</p>
            <Button type="submit" disabled={confirmandoSenha || !senha}>
              {confirmandoSenha ? <Loader2 size={18} className="animate-spin" /> : null}
              Confirmar e desbloquear
            </Button>
            <Button type="button" variant="tertiary" onClick={() => setEsqueci(false)}>
              Voltar ao PIN
            </Button>
          </form>
        ) : (
          <>
            <div className="flex items-center gap-3" aria-label={`${pin.length} de ${digitos} dígitos`}>
              {Array.from({ length: digitos }).map((_, i) => (
                <span
                  key={i}
                  className={cn(
                    "h-3.5 w-3.5 rounded-full border-2 border-primary-700 transition-colors",
                    i < pin.length ? "bg-primary-700" : "bg-transparent"
                  )}
                />
              ))}
            </div>

            <div className="min-h-[2.5rem] text-center" aria-live="polite">
              {congelado ? (
                <p className="text-small font-medium text-rose-700 dark:text-rose-300">
                  Muitas tentativas erradas. Tente de novo em {formatarEspera(congeladoMs)}.
                </p>
              ) : erro ? (
                <p className="text-small font-medium text-rose-700 dark:text-rose-300">{erro}</p>
              ) : conferindo ? (
                <p className="flex items-center gap-2 text-small text-muted">
                  <Loader2 size={14} className="animate-spin" /> Conferindo...
                </p>
              ) : null}
            </div>

            <div className="grid w-full grid-cols-3 gap-3">
              {teclas.map((t) => (
                <TeclaPin key={t} onClick={() => digitar(t)} disabled={congelado || conferindo}>
                  {t}
                </TeclaPin>
              ))}
              {temBiometria ? (
                <TeclaPin onClick={() => void usarBiometria()} disabled={lendoBiometria} rotulo="Usar biometria">
                  {lendoBiometria ? <Loader2 size={22} className="animate-spin" /> : <Fingerprint size={24} />}
                </TeclaPin>
              ) : (
                <span />
              )}
              <TeclaPin onClick={() => digitar("0")} disabled={congelado || conferindo}>
                0
              </TeclaPin>
              <TeclaPin onClick={apagar} disabled={pin.length === 0 || conferindo} rotulo="Apagar">
                <Delete size={22} />
              </TeclaPin>
            </div>

            <div className="flex w-full flex-col items-center gap-1">
              <button
                type="button"
                onClick={() => setEsqueci(true)}
                className="h-10 text-small font-medium text-primary-700 hover:underline dark:text-primary-300"
              >
                Esqueci o PIN
              </button>
              <button
                type="button"
                onClick={() => void signOut()}
                className="flex h-10 items-center gap-1.5 text-small text-muted hover:text-foreground"
              >
                <LogOut size={14} /> Sair da conta
              </button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

function TeclaPin({
  children,
  onClick,
  disabled,
  rotulo,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  rotulo?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={rotulo}
      className="flex h-16 items-center justify-center rounded-2xl border border-border bg-card text-2xl font-semibold text-foreground shadow-sm transition-colors hover:bg-muted/10 active:bg-muted/20 disabled:opacity-40"
    >
      {children}
    </button>
  );
}
