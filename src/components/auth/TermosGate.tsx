"use client";

import * as React from "react";
import Link from "next/link";
import { FileCheck2, Loader2, LogOut } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { supabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { VERSAO_DOCUMENTOS_LEGAIS } from "@/lib/legal/versao";

/**
 * LGPD (27/out/2026): ninguém usa o painel sem ter aceitado a versão vigente
 * dos Termos de uso e da Política de privacidade.
 *
 * - Cadastro normal e cadastro pelo convite já exigem o aceite no formulário
 *   (fica nos metadados e o servidor registra com IP e hora no 1º acesso).
 * - Contas antigas (criadas antes do registro existir) ou quando a versão dos
 *   documentos mudar: aparece este aviso; a pessoa aceita e depois entra.
 *
 * O que vale é a linha em `user_consents` (gravada só pelo servidor). A marca
 * no aparelho é só para não consultar o banco a cada abertura.
 */
type Estado = "verificando" | "ok" | "pendente";

function chaveMarca(usuarioId: string) {
  return `calixto:termos-aceitos:${usuarioId}:${VERSAO_DOCUMENTOS_LEGAIS}`;
}

function lerMarca(usuarioId: string) {
  try {
    return localStorage.getItem(chaveMarca(usuarioId)) === "1";
  } catch {
    return false;
  }
}

function gravarMarca(usuarioId: string) {
  try {
    localStorage.setItem(chaveMarca(usuarioId), "1");
  } catch {
    /* sem localStorage: só consulta o banco de novo na próxima vez */
  }
}

async function jaAceitou(): Promise<boolean | null> {
  const { data, error } = await supabase
    .from("user_consents")
    .select("id")
    .eq("versao_termos", VERSAO_DOCUMENTOS_LEGAIS)
    .limit(1);
  if (error) return null;
  return (data?.length ?? 0) > 0;
}

async function enviarAceite(origem: "automatico" | "aceite_manual"): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return false;
  try {
    const resp = await fetch("/api/lgpd/consentimento", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ versao: VERSAO_DOCUMENTOS_LEGAIS, origem }),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

export function TermosGate({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth();
  const usuarioId = user?.id;
  const [estado, setEstado] = React.useState<Estado>(() => (usuarioId && lerMarca(usuarioId) ? "ok" : "verificando"));
  const [marcou, setMarcou] = React.useState(false);
  const [enviando, setEnviando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!usuarioId) return;
    if (lerMarca(usuarioId)) {
      setEstado("ok");
      return;
    }
    let cancelado = false;
    (async () => {
      let aceitou = await jaAceitou();
      // Cadastro recente: o aceite foi marcado no formulário e o registro
      // no servidor pode ainda estar a caminho — registra agora e confere.
      if (aceitou === false && user?.user_metadata?.consentimento_versao === VERSAO_DOCUMENTOS_LEGAIS) {
        if (await enviarAceite("automatico")) aceitou = await jaAceitou();
      }
      if (cancelado) return;
      if (aceitou === true) {
        gravarMarca(usuarioId);
        setEstado("ok");
      } else if (aceitou === null) {
        // Sem rede/erro de leitura: não trava o app; confere de novo na próxima abertura.
        setEstado("ok");
      } else {
        setEstado("pendente");
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [usuarioId, user?.user_metadata?.consentimento_versao]);

  async function aceitar() {
    if (!usuarioId || !marcou) return;
    setErro(null);
    setEnviando(true);
    const ok = await enviarAceite("aceite_manual");
    const confirmado = ok ? await jaAceitou() : false;
    setEnviando(false);
    if (confirmado) {
      gravarMarca(usuarioId);
      setEstado("ok");
    } else {
      setErro("Não foi possível registrar o aceite agora. Confira a conexão e tente de novo.");
    }
  }

  if (estado === "ok") return <>{children}</>;

  if (estado === "verificando") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="animate-spin text-primary-500" size={28} />
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-16">
      <Card padding="lg" className="flex w-full max-w-md flex-col gap-5" role="dialog" aria-modal="true" aria-labelledby="titulo-termos">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-500 text-white">
            <FileCheck2 size={22} />
          </span>
          <h1 id="titulo-termos" className="text-h3 font-semibold text-foreground">
            Termos de uso e privacidade
          </h1>
        </div>
        <p className="text-body text-muted">
          Para continuar usando o app, leia e aceite a versão atual dos nossos documentos. Eles explicam como seus dados
          são usados para prestar o serviço e quais são os seus direitos pela LGPD.
        </p>
        <label className="flex items-start gap-3 rounded-xl border border-border p-3 text-small text-foreground">
          <input
            type="checkbox"
            checked={marcou}
            onChange={(e) => setMarcou(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-emerald-700"
          />
          <span>
            Li e aceito os{" "}
            <Link href="/termos" target="_blank" className="font-semibold text-primary-700 underline">
              Termos de uso
            </Link>{" "}
            e a{" "}
            <Link href="/privacidade" target="_blank" className="font-semibold text-primary-700 underline">
              Política de privacidade
            </Link>
            , incluindo o tratamento dos meus dados para prestação do serviço.
          </span>
        </label>
        {erro && <p className="text-small text-rose-700">{erro}</p>}
        <Button size="lg" className="w-full" disabled={!marcou || enviando} onClick={aceitar}>
          {enviando ? "Registrando..." : "Aceitar e continuar"}
        </Button>
        <Button variant="tertiary" size="md" className="w-full" onClick={() => void signOut()}>
          <LogOut size={16} />
          Sair
        </Button>
      </Card>
    </main>
  );
}
