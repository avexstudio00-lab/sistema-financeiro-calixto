"use client";

import * as React from "react";
import { Download, MessageCircle, Share2, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { formatarMoeda } from "@/lib/format";
import { supabase } from "@/lib/supabase/client";
import { linkWhatsApp } from "@/lib/util/texto";
import type { VendaAgrupada } from "@/lib/data/vendas";

const FORMAS: Record<string, string> = { pix: "Pix", debito: "Cartão de débito", credito: "Cartão de crédito", dinheiro: "Dinheiro", boleto: "Boleto" };

interface ParcelaFiado {
  valor: number;
  vencimento: string;
  status: string;
}

function dataBr(iso: string) {
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

/** Linhas do comprovante (usadas no texto, na prévia e na imagem). */
function montar(grupo: VendaAgrupada, nomeEmpresa: string, parcelas: ParcelaFiado[]) {
  const v = grupo.linhas[0];
  const itens = grupo.linhas.map((l) => ({
    nome: l.produto_nome,
    qtd: Number(l.quantidade),
    unit: Number(l.valor_unitario),
    total: Number(l.valor_total) - Number(l.acrescimo ?? 0),
  }));
  // Acréscimo combinado no parcelado (13/nov/2026) aparece como linha própria.
  const acrescimo = grupo.linhas.reduce((a, l) => a + Number(l.acrescimo ?? 0), 0);
  if (acrescimo > 0) itens.push({ nome: "Acréscimo do parcelado", qtd: 1, unit: acrescimo, total: acrescimo });
  let pagamento: string;
  if (Array.isArray(v.pagamentos) && v.pagamentos.length) {
    pagamento = v.pagamentos.map((p) => `${FORMAS[p.forma] ?? p.forma} ${formatarMoeda(Number(p.valor))}`).join(" + ");
  } else if (parcelas.length) {
    pagamento = parcelas.length === 1 ? "A prazo (fiado)" : `A prazo em ${parcelas.length}x (fiado)`;
  } else {
    pagamento = FORMAS[v.forma_pagamento ?? ""] ?? "—";
    if (v.forma_pagamento === "credito" && v.parcelas_cartao && v.parcelas_cartao > 1) pagamento += ` em ${v.parcelas_cartao}x`;
  }
  const numero = (v.grupo_venda_id ?? v.id).slice(0, 8).toUpperCase();
  return { empresa: nomeEmpresa || "Minha empresa", data: dataBr(grupo.data), cliente: grupo.cliente?.nome ?? null, itens, total: grupo.total, pagamento, numero };
}

function textoWhatsApp(c: ReturnType<typeof montar>, parcelas: ParcelaFiado[]) {
  const linhas = [
    `*Comprovante de compra — ${c.empresa}*`,
    `Data: ${c.data} · Nº ${c.numero}`,
    c.cliente ? `Cliente: ${c.cliente}` : null,
    "",
    ...c.itens.map((i) => `${i.qtd}x ${i.nome} — ${formatarMoeda(i.total)}`),
    "",
    `*Total: ${formatarMoeda(c.total)}*`,
    `Pagamento: ${c.pagamento}`,
    ...(parcelas.length ? ["", "Parcelas:", ...parcelas.map((p, k) => `${k + 1}. ${formatarMoeda(p.valor)} — vence ${dataBr(p.vencimento)}${p.status === "recebido" ? " (pago)" : ""}`)] : []),
    "",
    "Obrigado pela preferência! 😊",
    "_Este comprovante não é documento fiscal._",
  ];
  return linhas.filter((l) => l !== null).join("\n");
}

/** Desenha o comprovante numa imagem (PNG), pronta pra mandar. */
async function gerarImagem(c: ReturnType<typeof montar>, parcelas: ParcelaFiado[]): Promise<Blob | null> {
  const L = 720;
  const pad = 48;
  const linhasExtras = c.itens.length + parcelas.length + (c.cliente ? 1 : 0);
  const altura = 520 + linhasExtras * 44 + (parcelas.length ? 70 : 0);
  const canvas = document.createElement("canvas");
  const escala = 2;
  canvas.width = L * escala;
  canvas.height = altura * escala;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.scale(escala, escala);
  const fonte = (peso: number, tam: number) => `${peso} ${tam}px Inter, -apple-system, "Segoe UI", Roboto, sans-serif`;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, L, altura);
  ctx.fillStyle = "#065f46";
  ctx.fillRect(0, 0, L, 10);

  let y = 70;
  ctx.fillStyle = "#0f172a";
  ctx.font = fonte(700, 30);
  ctx.fillText(c.empresa.slice(0, 34), pad, y);
  y += 38;
  ctx.font = fonte(500, 20);
  ctx.fillStyle = "#475569";
  ctx.fillText(`Comprovante de compra · Nº ${c.numero}`, pad, y);
  y += 30;
  ctx.fillText(`Data: ${c.data}`, pad, y);
  if (c.cliente) {
    y += 30;
    ctx.fillText(`Cliente: ${c.cliente.slice(0, 40)}`, pad, y);
  }
  y += 28;
  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(pad, y);
  ctx.lineTo(L - pad, y);
  ctx.stroke();
  y += 40;

  for (const i of c.itens) {
    ctx.font = fonte(500, 22);
    ctx.fillStyle = "#0f172a";
    ctx.fillText(`${i.qtd}x ${i.nome}`.slice(0, 40), pad, y);
    ctx.textAlign = "right";
    ctx.fillText(formatarMoeda(i.total), L - pad, y);
    ctx.textAlign = "left";
    y += 44;
  }
  y += 4;
  ctx.beginPath();
  ctx.moveTo(pad, y - 22);
  ctx.lineTo(L - pad, y - 22);
  ctx.stroke();
  y += 22;
  ctx.font = fonte(700, 28);
  ctx.fillStyle = "#065f46";
  ctx.fillText("Total", pad, y);
  ctx.textAlign = "right";
  ctx.fillText(formatarMoeda(c.total), L - pad, y);
  ctx.textAlign = "left";
  y += 40;
  ctx.font = fonte(500, 20);
  ctx.fillStyle = "#475569";
  ctx.fillText(`Pagamento: ${c.pagamento}`.slice(0, 60), pad, y);

  if (parcelas.length) {
    y += 46;
    ctx.font = fonte(600, 20);
    ctx.fillStyle = "#0f172a";
    ctx.fillText("Parcelas", pad, y);
    y += 8;
    for (const [k, p] of parcelas.entries()) {
      y += 36;
      ctx.font = fonte(500, 20);
      ctx.fillStyle = "#475569";
      ctx.fillText(`${k + 1}. vence ${dataBr(p.vencimento)}${p.status === "recebido" ? " (pago)" : ""}`, pad, y);
      ctx.textAlign = "right";
      ctx.fillText(formatarMoeda(p.valor), L - pad, y);
      ctx.textAlign = "left";
    }
  }

  y = altura - 70;
  ctx.font = fonte(600, 20);
  ctx.fillStyle = "#0f172a";
  ctx.textAlign = "center";
  ctx.fillText("Obrigado pela preferência!", L / 2, y);
  ctx.font = fonte(400, 16);
  ctx.fillStyle = "#94a3b8";
  ctx.fillText("Este comprovante não é documento fiscal.", L / 2, y + 30);
  ctx.textAlign = "left";

  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
}

/**
 * Comprovante da venda (10/nov/2026): imagem ou mensagem pronta pra mandar
 * ao cliente pelo WhatsApp — o que foi comprado, quanto, como pagou e, no
 * fiado, as parcelas e vencimentos. Não é nota fiscal (está escrito nele).
 */
export function ComprovanteVenda({ grupo, nomeEmpresa, onFechar }: { grupo: VendaAgrupada; nomeEmpresa: string; onFechar: () => void }) {
  const [parcelas, setParcelas] = React.useState<ParcelaFiado[]>([]);
  const [aviso, setAviso] = React.useState<string | null>(null);
  const grupoId = grupo.linhas[0]?.grupo_venda_id;

  React.useEffect(() => {
    if (!grupoId) return;
    supabase
      .from("contas_receber")
      .select("valor, vencimento, status")
      .eq("venda_grupo_id", grupoId)
      .order("vencimento", { ascending: true })
      .then(({ data }) => setParcelas(((data as ParcelaFiado[] | null) ?? []).map((p) => ({ ...p, valor: Number(p.valor) }))));
  }, [grupoId]);

  const c = montar(grupo, nomeEmpresa, parcelas);
  const texto = textoWhatsApp(c, parcelas);
  const linkCliente = linkWhatsApp(grupo.cliente?.telefone, texto);
  const linkSemNumero = `https://wa.me/?text=${encodeURIComponent(texto)}`;

  async function compartilharImagem() {
    setAviso(null);
    const blob = await gerarImagem(c, parcelas);
    if (!blob) return setAviso("Não foi possível gerar a imagem neste aparelho.");
    const arquivo = new File([blob], `comprovante-${c.numero}.png`, { type: "image/png" });
    const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
    if (nav.share && nav.canShare?.({ files: [arquivo] })) {
      try {
        await nav.share({ files: [arquivo], title: `Comprovante ${c.empresa}` });
        return;
      } catch {
        // cancelou: tudo bem
        return;
      }
    }
    baixar(blob);
    setAviso("Imagem baixada. Agora é só anexar no WhatsApp do cliente.");
  }

  function baixar(blob: Blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `comprovante-${c.numero}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true">
      <div className="flex max-h-[92vh] w-full max-w-md flex-col gap-4 overflow-y-auto rounded-t-3xl bg-card p-5 shadow-card-hover sm:rounded-3xl">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-h3 text-foreground">Comprovante da venda</h2>
            <p className="text-small text-muted">Pra mandar ao cliente. Não é nota fiscal.</p>
          </div>
          <button type="button" onClick={onFechar} aria-label="Fechar" className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-muted/10">
            <X size={20} />
          </button>
        </div>

        <div className="rounded-2xl border border-border bg-white p-4 text-slate-900 shadow-sm">
          <div className="mb-3 h-1.5 rounded-full bg-[#065f46]" />
          <p className="text-lg font-bold">{c.empresa}</p>
          <p className="text-xs text-slate-500">
            Comprovante de compra · Nº {c.numero} · {c.data}
          </p>
          {c.cliente && <p className="text-xs text-slate-500">Cliente: {c.cliente}</p>}
          <ul className="my-3 flex flex-col gap-1 border-y border-slate-200 py-2 text-sm">
            {c.itens.map((i, k) => (
              <li key={k} className="flex justify-between gap-2">
                <span>
                  {i.qtd}x {i.nome}
                </span>
                <span>{formatarMoeda(i.total)}</span>
              </li>
            ))}
          </ul>
          <p className="flex justify-between text-base font-bold text-[#065f46]">
            <span>Total</span>
            <span>{formatarMoeda(c.total)}</span>
          </p>
          <p className="text-xs text-slate-500">Pagamento: {c.pagamento}</p>
          {parcelas.length > 0 && (
            <ul className="mt-2 flex flex-col gap-0.5 text-xs text-slate-600">
              {parcelas.map((p, k) => (
                <li key={k} className="flex justify-between">
                  <span>
                    {k + 1}. vence {dataBr(p.vencimento)}
                    {p.status === "recebido" ? " (pago)" : ""}
                  </span>
                  <span>{formatarMoeda(p.valor)}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-center text-[11px] text-slate-400">Este comprovante não é documento fiscal.</p>
        </div>

        {aviso && <p className="text-small text-foreground">{aviso}</p>}

        <div className="flex flex-col gap-2">
          <Button type="button" onClick={() => void compartilharImagem()}>
            <Share2 size={16} /> Compartilhar imagem
          </Button>
          <a
            href={linkCliente ?? linkSemNumero}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-11 items-center justify-center gap-2 rounded-xl border border-border text-small font-semibold text-foreground hover:bg-muted/10"
          >
            <MessageCircle size={16} /> {linkCliente ? `Mandar em texto pro WhatsApp de ${grupo.cliente?.nome?.split(" ")[0]}` : "Mandar em texto pelo WhatsApp"}
          </a>
          <button
            type="button"
            onClick={async () => {
              const blob = await gerarImagem(c, parcelas);
              if (blob) baixar(blob);
            }}
            className="flex items-center justify-center gap-1.5 text-xs font-medium text-muted hover:text-foreground"
          >
            <Download size={14} /> Baixar a imagem
          </button>
        </div>
      </div>
    </div>
  );
}
