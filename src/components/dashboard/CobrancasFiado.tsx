"use client";

import * as React from "react";
import { HandCoins, MessageCircle, Settings2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { formatarMoeda } from "@/lib/format";
import { linkWhatsApp, diasEntre, hojeIso } from "@/lib/util/texto";
import {
  fiadosParaCobrar,
  lerMensagemCobranca,
  montarMensagemCobranca,
  MENSAGEM_COBRANCA_PADRAO,
  registrarCobrancaFeita,
  salvarMensagemCobranca,
} from "@/lib/data/cobranca";
import type { ContaReceber } from "@/lib/data/tipos";

/**
 * Card "Cobrar hoje" do painel da empresa (itens 6.4 / 12.4): fiados vencidos
 * ou vencendo hoje, com botão de WhatsApp e texto configurável.
 */
export function CobrancasFiado({
  contaMestreId,
  nomeEmpresa,
  titulos,
  onAlterado,
}: {
  contaMestreId: string;
  nomeEmpresa: string;
  titulos: ContaReceber[];
  onAlterado?: () => void;
}) {
  const [modelo, setModelo] = React.useState<string | null>(null);
  const [editando, setEditando] = React.useState(false);
  const [texto, setTexto] = React.useState("");
  const hoje = hojeIso();
  const lista = fiadosParaCobrar(titulos, hoje);

  React.useEffect(() => {
    lerMensagemCobranca(contaMestreId).then(setModelo);
  }, [contaMestreId]);

  if (lista.length === 0) return null;

  async function salvarModelo() {
    await salvarMensagemCobranca(contaMestreId, texto);
    setModelo(texto.trim() || null);
    setEditando(false);
  }

  return (
    <Card className="flex flex-col gap-3 border-amber-300">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-h3 text-foreground">
          <HandCoins size={18} className="text-amber-700" />
          Cobrar vendas fiadas
        </h2>
        <button
          type="button"
          onClick={() => {
            setTexto(modelo ?? MENSAGEM_COBRANCA_PADRAO);
            setEditando((v) => !v);
          }}
          className="flex items-center gap-1 text-xs font-semibold text-primary-700 hover:underline"
        >
          <Settings2 size={13} /> Mensagem de cobrança
        </button>
      </div>
      {editando && (
        <div className="flex flex-col gap-2 rounded-xl border border-border p-3">
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={4}
            maxLength={600}
            className="rounded-xl border border-border bg-card p-3 text-small text-foreground"
          />
          <p className="text-xs text-muted">Use {"{nome}"}, {"{empresa}"}, {"{descricao}"}, {"{valor}"} e {"{vencimento}"} — são trocados pelos dados de cada cliente.</p>
          <div className="flex gap-2">
            <Button size="sm" onClick={salvarModelo}>Salvar mensagem</Button>
            <Button size="sm" variant="tertiary" onClick={() => setEditando(false)}>Cancelar</Button>
          </div>
        </div>
      )}
      {lista.slice(0, 8).map((t) => {
        const atraso = diasEntre(t.vencimento, hoje);
        const link = linkWhatsApp(t.clientes?.telefone, montarMensagemCobranca(modelo, t, nomeEmpresa));
        return (
          <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-muted/5 px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-small font-medium text-foreground">
                {t.clientes?.nome ?? "Cliente"} · {formatarMoeda(Number(t.valor))}
              </p>
              <p className="text-xs text-muted">
                {atraso > 0 ? `Vencido há ${atraso} dia(s)` : "Vence hoje"}
                {t.ultima_cobranca_em ? ` · cobrado em ${new Date(t.ultima_cobranca_em).toLocaleDateString("pt-BR")}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {atraso > 0 && <Badge variant="danger" size="sm">Em atraso</Badge>}
              {link ? (
                <a
                  href={link}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => {
                    void registrarCobrancaFeita(t.id).then(() => onAlterado?.());
                  }}
                  className="flex items-center gap-1 rounded-full bg-primary-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-800"
                >
                  <MessageCircle size={13} /> Cobrar no WhatsApp
                </a>
              ) : (
                <span className="text-xs text-muted">Sem telefone no cadastro</span>
              )}
            </div>
          </div>
        );
      })}
    </Card>
  );
}
