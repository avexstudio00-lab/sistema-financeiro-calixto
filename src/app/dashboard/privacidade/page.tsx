"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download, FileText, ShieldCheck, Trash2, UserCog, Loader2, AlertTriangle } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useAuth } from "@/lib/auth/AuthProvider";
import {
  baixarArquivo,
  excluirMinhaConta,
  exportarMeusDados,
  FRASE_CONFIRMACAO_EXCLUSAO,
  listarConsentimentos,
  pacoteParaCsv,
  VERSAO_DOCUMENTOS_LEGAIS,
  type Consentimento,
} from "@/lib/data/lgpd";
import { limparDadosLocais } from "@/lib/seguranca/sessaoLocal";
import { supabase } from "@/lib/supabase/client";

/**
 * Painel de autoatendimento LGPD (item 2.4 da especificação de 09/out/2026):
 * acesso/portabilidade (JSON e CSV), retificação (atalho pro Perfil),
 * histórico de consentimentos e exclusão definitiva da conta com dupla
 * confirmação (frase + senha, conferidas de novo no servidor).
 */
export default function PrivacidadeDadosPage() {
  const { user, perfil } = useAuth();
  const router = useRouter();
  const [consentimentos, setConsentimentos] = React.useState<Consentimento[]>([]);
  const [exportando, setExportando] = React.useState<"json" | "csv" | null>(null);
  const [mensagem, setMensagem] = React.useState<string | null>(null);
  const [etapaExclusao, setEtapaExclusao] = React.useState<0 | 1 | 2>(0);
  const [frase, setFrase] = React.useState("");
  const [senha, setSenha] = React.useState("");
  const [excluindo, setExcluindo] = React.useState(false);
  const [erroExclusao, setErroExclusao] = React.useState<string | null>(null);
  const [aceitando, setAceitando] = React.useState(false);

  const carregar = React.useCallback(async () => {
    setConsentimentos(await listarConsentimentos());
  }, []);

  React.useEffect(() => {
    if (user) carregar();
  }, [user, carregar]);

  const aceitouVersaoAtual = consentimentos.some((c) => c.versao_termos === VERSAO_DOCUMENTOS_LEGAIS);

  async function exportar(formato: "json" | "csv") {
    if (!user) return;
    setExportando(formato);
    setMensagem(null);
    try {
      const pacote = await exportarMeusDados(user.id, user.email ?? null);
      const data = new Date().toISOString().slice(0, 10);
      if (formato === "json") {
        baixarArquivo(`meus-dados-${data}.json`, JSON.stringify(pacote, null, 2), "application/json");
      } else {
        baixarArquivo(`meus-dados-${data}.csv`, pacoteParaCsv(pacote), "text/csv;charset=utf-8");
      }
      const total = Object.values(pacote.tabelas).reduce((a, l) => a + l.length, 0);
      setMensagem(`Arquivo gerado com ${total} registro(s).`);
    } catch {
      setMensagem("Não foi possível gerar o arquivo agora. Confira a conexão e tente de novo.");
    } finally {
      setExportando(null);
    }
  }

  async function aceitarVersaoAtual() {
    setAceitando(true);
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) {
      await fetch("/api/lgpd/consentimento", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ versao: VERSAO_DOCUMENTOS_LEGAIS, origem: "aceite_manual" }),
      }).catch(() => {});
    }
    await carregar();
    setAceitando(false);
  }

  async function confirmarExclusao(e: React.FormEvent) {
    e.preventDefault();
    if (frase.trim() !== FRASE_CONFIRMACAO_EXCLUSAO) {
      setErroExclusao(`Digite exatamente: ${FRASE_CONFIRMACAO_EXCLUSAO}`);
      return;
    }
    if (!senha) {
      setErroExclusao("Digite sua senha atual.");
      return;
    }
    setErroExclusao(null);
    setExcluindo(true);
    const r = await excluirMinhaConta(senha, frase.trim());
    setExcluindo(false);
    if (!r.ok) {
      setErroExclusao(r.erro ?? "Não foi possível excluir.");
      return;
    }
    limparDadosLocais({ incluirFilaPendente: true });
    await supabase.auth.signOut({ scope: "local" });
    router.replace("/?conta=excluida");
  }

  const planoPago = perfil && perfil.plano !== "gratis";

  return (
    <Container full className="flex flex-col gap-6 py-8">
      <div>
        <h1 className="text-h2 text-foreground">Privacidade e dados</h1>
        <p className="text-body text-muted">Seus direitos pela LGPD, direto aqui, sem precisar pedir pra ninguém.</p>
      </div>

      <Card padding="lg" className="flex flex-col gap-3">
        <h2 className="flex items-center gap-2 text-h3 text-foreground">
          <Download size={18} className="text-primary-700" />
          Baixar meus dados (portabilidade)
        </h2>
        <p className="text-small text-muted">
          Tudo o que está guardado na sua conta: cadastro, carteiras, lançamentos, metas, dívidas, investimentos e,
          se você tiver, os dados da empresa.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => exportar("json")} disabled={!!exportando}>
            {exportando === "json" ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
            Baixar em JSON
          </Button>
          <Button variant="secondary" onClick={() => exportar("csv")} disabled={!!exportando}>
            {exportando === "csv" ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
            Baixar em CSV (planilha)
          </Button>
        </div>
        {mensagem && <p className="text-small text-foreground">{mensagem}</p>}
      </Card>

      <Card padding="lg" className="flex flex-col gap-3">
        <h2 className="flex items-center gap-2 text-h3 text-foreground">
          <UserCog size={18} className="text-primary-700" />
          Corrigir meus dados
        </h2>
        <p className="text-small text-muted">Nome, foto, tipo de perfil e senha ficam no Perfil. Lançamentos e cadastros você corrige na própria tela de cada um.</p>
        <Link href="/dashboard/perfil" className="self-start text-small font-semibold text-primary-700 underline">
          Abrir meu perfil
        </Link>
      </Card>

      <Card padding="lg" className="flex flex-col gap-3">
        <h2 className="flex items-center gap-2 text-h3 text-foreground">
          <ShieldCheck size={18} className="text-primary-700" />
          Meus aceites
        </h2>
        {consentimentos.length === 0 ? (
          <p className="text-small text-muted">Nenhum aceite registrado ainda nesta conta.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {consentimentos.map((c) => (
              <li key={c.id} className="text-small text-foreground">
                Termos e Privacidade versão {c.versao_termos} — {new Date(c.aceito_em).toLocaleString("pt-BR")}
                {c.ip ? ` · IP ${c.ip}` : ""}
              </li>
            ))}
          </ul>
        )}
        {!aceitouVersaoAtual && (
          <div className="flex flex-col gap-2 rounded-xl border border-border p-3">
            <p className="text-small text-foreground">
              Versão atual: {VERSAO_DOCUMENTOS_LEGAIS}. Leia os{" "}
              <Link href="/termos" target="_blank" className="font-semibold text-primary-700 underline">Termos</Link> e a{" "}
              <Link href="/privacidade" target="_blank" className="font-semibold text-primary-700 underline">Política de privacidade</Link>.
            </p>
            <Button size="sm" className="self-start" onClick={aceitarVersaoAtual} disabled={aceitando}>
              Li e aceito
            </Button>
          </div>
        )}
      </Card>

      <Card padding="lg" className="flex flex-col gap-3 border-rose-300">
        <h2 className="flex items-center gap-2 text-h3 text-rose-700">
          <Trash2 size={18} />
          Excluir minha conta para sempre
        </h2>
        <p className="text-small text-muted">
          Apaga todos os seus dados e arquivos, sem volta. Se você é dono de uma empresa com sócios ou funcionários
          convidados, eles perdem o acesso.
        </p>
        {planoPago && (
          <p className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-small text-amber-900">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            Você tem um plano pago. Cancele a assinatura em <Link href="/dashboard/plano" className="font-semibold underline">Meu plano</Link> antes,
            para não ser cobrado de novo.
          </p>
        )}
        {etapaExclusao === 0 && (
          <Button variant="secondary" className="self-start border-rose-600 text-rose-700 hover:bg-rose-600" onClick={() => setEtapaExclusao(1)}>
            Quero excluir minha conta
          </Button>
        )}
        {etapaExclusao === 1 && (
          <div className="flex flex-col gap-2">
            <p className="text-small font-semibold text-foreground">Tem certeza? Isso não pode ser desfeito.</p>
            <p className="text-small text-muted">Dica: baixe seus dados antes (botões lá em cima).</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="tertiary" onClick={() => setEtapaExclusao(0)}>Não, voltar</Button>
              <Button className="bg-rose-700 hover:bg-rose-800" onClick={() => setEtapaExclusao(2)}>Sim, continuar</Button>
            </div>
          </div>
        )}
        {etapaExclusao === 2 && (
          <form onSubmit={confirmarExclusao} className="flex flex-col gap-3">
            <Input
              label={`Digite: ${FRASE_CONFIRMACAO_EXCLUSAO}`}
              value={frase}
              onChange={(e) => setFrase(e.target.value)}
              autoComplete="off"
            />
            <Input label="Sua senha atual" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="current-password" />
            {erroExclusao && <p className="text-small text-rose-700">{erroExclusao}</p>}
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="tertiary" onClick={() => { setEtapaExclusao(0); setFrase(""); setSenha(""); }}>
                Cancelar
              </Button>
              <Button type="submit" className="bg-rose-700 hover:bg-rose-800" disabled={excluindo}>
                {excluindo ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                Excluir definitivamente
              </Button>
            </div>
          </form>
        )}
      </Card>
    </Container>
  );
}
