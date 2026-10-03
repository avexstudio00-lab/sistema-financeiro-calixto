"use client";

import * as React from "react";
import Link from "next/link";
import { Building2, Plus, Save, Check } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useEmpresa } from "@/lib/empresa/EmpresaProvider";
import { atualizarEmpresa, criarEmpresa, ramoDaEmpresa, type RamoAtividade } from "@/lib/data/empresas";
import { PLANOS } from "@/lib/planos";
import { cn } from "@/lib/utils";
import type { Empresa } from "@/lib/data/tipos";

const RAMOS: { id: RamoAtividade; titulo: string; descricao: string }[] = [
  { id: "servicos", titulo: "Apenas serviços", descricao: "Esconde Estoque e Catálogo de produtos." },
  { id: "produtos", titulo: "Apenas produtos", descricao: "Esconde o Catálogo de serviços." },
  { id: "ambos", titulo: "Serviços e produtos", descricao: "Mostra os dois." },
];

function EditorEmpresa({ empresa, podeEditar, onSalvo }: { empresa: Empresa; podeEditar: boolean; onSalvo: () => void }) {
  const [nome, setNome] = React.useState(empresa.nome_fantasia);
  const [ramo, setRamo] = React.useState<RamoAtividade>(ramoDaEmpresa(empresa));
  const [salvando, setSalvando] = React.useState(false);
  const [ok, setOk] = React.useState(false);
  const alterado = nome.trim() !== empresa.nome_fantasia || ramo !== ramoDaEmpresa(empresa);

  async function salvar() {
    setSalvando(true);
    const { error } = await atualizarEmpresa(empresa.id, { nomeFantasia: nome, ramo });
    setSalvando(false);
    if (!error) {
      setOk(true);
      onSalvo();
    }
  }

  return (
    <Card padding="lg" className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-50 text-accent-700">
          <Building2 size={20} />
        </span>
        <h2 className="text-h3 text-foreground">{empresa.nome_fantasia}</h2>
      </div>
      <Input label="Nome da empresa" value={nome} disabled={!podeEditar} onChange={(e) => { setNome(e.target.value); setOk(false); }} />
      <div className="flex flex-col gap-2">
        <span className="text-small font-medium text-foreground">Ramo de atividade</span>
        <div className="grid gap-2 sm:grid-cols-3">
          {RAMOS.map((r) => (
            <button
              key={r.id}
              type="button"
              disabled={!podeEditar}
              onClick={() => { setRamo(r.id); setOk(false); }}
              className={cn(
                "flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-colors disabled:opacity-60",
                ramo === r.id ? "border-primary-500 bg-primary-50" : "border-border hover:bg-muted/10"
              )}
            >
              <span className="text-small font-semibold text-foreground">{r.titulo}</span>
              <span className="text-small text-muted">{r.descricao}</span>
            </button>
          ))}
        </div>
        <p className="text-xs text-muted">Trocar o ramo só muda o que aparece no menu — nenhum dado é apagado.</p>
      </div>
      {podeEditar && (
        <div className="flex items-center gap-3">
          <Button size="sm" disabled={!alterado || salvando} onClick={salvar}>
            <Save size={16} />
            {salvando ? "Salvando..." : "Salvar"}
          </Button>
          {ok && (
            <span className="flex items-center gap-1 text-small text-primary-700">
              <Check size={14} /> Salvo
            </span>
          )}
        </div>
      )}
    </Card>
  );
}

/**
 * Configurações das empresas (itens 5.4 e 5.5 da especificação de 03/out/2026):
 * nome, ramo de atividade (controla o menu) e, nos planos Bi-Empresa, a
 * criação da segunda empresa.
 */
export default function ConfiguracoesEmpresaPage() {
  const { negocio, papel } = useAuth();
  const { empresas, limite, recarregar } = useEmpresa();
  const [criando, setCriando] = React.useState(false);
  const [nomeNova, setNomeNova] = React.useState("");
  const [ramoNova, setRamoNova] = React.useState<RamoAtividade>("produtos");
  const [erro, setErro] = React.useState<string | null>(null);
  const podeEditar = papel === "dono";
  const podeCriar = podeEditar && empresas.length < limite;

  async function criar() {
    if (!negocio) return;
    if (nomeNova.trim().length < 2) return setErro("Dê um nome à nova empresa.");
    const { error } = await criarEmpresa(negocio.usuarioId, nomeNova, ramoNova);
    if (error) return setErro("Não foi possível criar agora.");
    setCriando(false);
    setNomeNova("");
    await recarregar();
  }

  return (
    <Container full className="flex flex-col gap-8 py-8">
      <div>
        <h1 className="text-h2 text-foreground">Minhas empresas</h1>
        <p className="text-body text-muted">
          {limite >= 2 ? "Seu plano permite até 2 empresas independentes." : "Seu plano inclui 1 empresa."}{" "}
          {empresas.length > 1 && "Troque a empresa que está vendo no seletor do topo."}
        </p>
      </div>

      {!podeEditar && (
        <Badge variant="neutral" size="md" className="self-start">Só quem é dono da conta altera essas configurações.</Badge>
      )}

      <div className="flex flex-col gap-4">
        {empresas.map((e) => (
          <EditorEmpresa key={e.id} empresa={e} podeEditar={podeEditar} onSalvo={recarregar} />
        ))}
      </div>

      {podeCriar &&
        (criando ? (
          <Card padding="lg" className="flex flex-col gap-4">
            <h2 className="text-h3 text-foreground">Nova empresa</h2>
            <Input label="Nome da empresa" value={nomeNova} onChange={(e) => setNomeNova(e.target.value)} autoFocus />
            <div className="grid gap-2 sm:grid-cols-3">
              {RAMOS.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setRamoNova(r.id)}
                  className={cn(
                    "rounded-xl border p-3 text-left text-small font-semibold text-foreground",
                    ramoNova === r.id ? "border-primary-500 bg-primary-50" : "border-border"
                  )}
                >
                  {r.titulo}
                </button>
              ))}
            </div>
            {erro && <p className="text-small text-rose-700">{erro}</p>}
            <div className="flex gap-2">
              <Button onClick={criar}>Criar empresa</Button>
              <Button variant="tertiary" onClick={() => setCriando(false)}>Cancelar</Button>
            </div>
          </Card>
        ) : (
          <Button className="self-start" onClick={() => setCriando(true)}>
            <Plus size={18} />
            Adicionar segunda empresa
          </Button>
        ))}

      {podeEditar && limite < 2 && (
        <Card className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-body text-foreground">
            Tem um segundo negócio? O plano {PLANOS.avancado_multi.nome} ({PLANOS.avancado_multi.precoLabel}) gerencia 2 empresas independentes.
          </p>
          <Link href="/dashboard/plano">
            <Button variant="secondary">Ver planos</Button>
          </Link>
        </Card>
      )}
    </Container>
  );
}
