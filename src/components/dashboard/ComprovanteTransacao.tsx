"use client";

import * as React from "react";
import { Camera, Eye, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { supabase } from "@/lib/supabase/client";
import { TAMANHO_MAXIMO_COMPROVANTE } from "@/lib/seguranca/arquivos";

async function token(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

/**
 * Anexar/ver/remover o comprovante (foto do recibo) de um lançamento já
 * salvo — item 2.6 da especificação de 09/out/2026. O arquivo vai para o
 * bucket privado pelo servidor (que confere o tipo real e renomeia); para
 * ver, o servidor devolve uma URL assinada que vale no máximo 60 minutos.
 */
export function ComprovanteTransacao({
  transacaoId,
  temComprovante,
  onMudou,
}: {
  transacaoId: string;
  temComprovante: boolean;
  onMudou?: (tem: boolean) => void;
}) {
  const [tem, setTem] = React.useState(temComprovante);
  const [ocupado, setOcupado] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => setTem(temComprovante), [temComprovante]);

  async function enviar(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    e.target.value = "";
    if (!arquivo) return;
    setErro(null);
    if (arquivo.size > TAMANHO_MAXIMO_COMPROVANTE) {
      setErro("A imagem precisa ter até 4 MB. Tire a foto com resolução menor ou faça um print.");
      return;
    }
    const t = await token();
    if (!t) {
      setErro("Sessão expirada. Entre de novo.");
      return;
    }
    setOcupado(true);
    const corpo = new FormData();
    corpo.append("transacao_id", transacaoId);
    corpo.append("arquivo", arquivo);
    try {
      const resp = await fetch("/api/comprovantes", { method: "POST", headers: { Authorization: `Bearer ${t}` }, body: corpo });
      const json = (await resp.json().catch(() => ({}))) as { erro?: string };
      if (!resp.ok) {
        setErro(json.erro ?? (resp.status === 413 ? "A imagem é grande demais (máx. 4 MB)." : "Não foi possível enviar."));
      } else {
        setTem(true);
        onMudou?.(true);
      }
    } catch {
      setErro("Sem conexão. Tente de novo.");
    } finally {
      setOcupado(false);
    }
  }

  async function ver() {
    setErro(null);
    const t = await token();
    if (!t) return;
    // Abre a aba já no clique (bloqueador de pop-up), depois aponta pra URL.
    const aba = window.open("", "_blank");
    if (aba) aba.opener = null;
    setOcupado(true);
    try {
      const resp = await fetch(`/api/comprovantes?transacao_id=${encodeURIComponent(transacaoId)}`, { headers: { Authorization: `Bearer ${t}` } });
      const json = (await resp.json().catch(() => ({}))) as { url?: string; erro?: string };
      if (!resp.ok || !json.url) {
        aba?.close();
        setErro(json.erro ?? "Não foi possível abrir.");
      } else if (aba) {
        aba.location.href = json.url;
      } else {
        setErro("Seu navegador bloqueou a nova aba. Permita pop-ups para ver o comprovante.");
      }
    } finally {
      setOcupado(false);
    }
  }

  async function remover() {
    const t = await token();
    if (!t) return;
    setOcupado(true);
    try {
      await fetch(`/api/comprovantes?transacao_id=${encodeURIComponent(transacaoId)}`, { method: "DELETE", headers: { Authorization: `Bearer ${t}` } });
      setTem(false);
      onMudou?.(false);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border p-3">
      <p className="text-small font-semibold text-foreground">Comprovante</p>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={enviar} />
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="secondary" disabled={ocupado} onClick={() => inputRef.current?.click()}>
          {ocupado ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
          {tem ? "Trocar foto" : "Anexar foto"}
        </Button>
        {tem && (
          <>
            <Button type="button" size="sm" variant="tertiary" disabled={ocupado} onClick={ver}>
              <Eye size={14} />
              Ver
            </Button>
            <Button type="button" size="sm" variant="tertiary" disabled={ocupado} onClick={remover}>
              <Trash2 size={14} />
              Remover
            </Button>
          </>
        )}
      </div>
      <p className="text-xs text-muted">JPG, PNG ou WEBP até 4 MB. Fica guardado de forma privada; o link de visualização vale 60 minutos.</p>
      {erro && <p className="text-small text-rose-700">{erro}</p>}
    </div>
  );
}
