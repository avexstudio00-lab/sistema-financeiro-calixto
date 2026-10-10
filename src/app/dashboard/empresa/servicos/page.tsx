"use client";

import * as React from "react";
import { Plus, Wrench, Pencil, Trash2, Clock, Hash } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { useAuth } from "@/lib/auth/AuthProvider";
import { listarServicos, removerServico, rotuloPrecoServico } from "@/lib/data/servicos";
import { FormularioServico } from "@/components/dashboard/catalogo/FormularioServico";
import type { Servico } from "@/lib/data/tipos";

/**
 * Catálogo de serviços (itens 5.6 e 5.7 da especificação de 03/out/2026).
 * Serviço não tem estoque: só nome, código interno, tempo estimado e preço —
 * que pode ser fixo ou só uma "base de orçamento" (a partir de, faixa ou sob
 * consulta), com o valor final definido no orçamento de cada cliente.
 */
export default function ServicosPage() {
  const { negocio } = useAuth();
  const [servicos, setServicos] = React.useState<Servico[]>([]);
  const [carregando, setCarregando] = React.useState(true);
  const [formAberto, setFormAberto] = React.useState(false);
  const [editandoId, setEditandoId] = React.useState<string | null>(null);
  const [confirmandoRemocao, setConfirmandoRemocao] = React.useState<string | null>(null);

  const carregar = React.useCallback(async () => {
    if (!negocio) return;
    // Recarregar depois de salvar NÃO mostra o spinner (só a 1ª carga):
    // trocar a lista pelo spinner jogava a tela pro topo e fechava o que
    // estava aberto (pedido do usuário em 05/out/2026).
    setServicos(await listarServicos(negocio.usuarioId));
    setCarregando(false);
  }, [negocio]);

  React.useEffect(() => {
    carregar();
  }, [carregar]);

  function abrirNovo() {
    setEditandoId(null);
    setFormAberto(true);
  }

  function abrirEdicao(s: Servico) {
    setEditandoId(s.id);
    setFormAberto(true);
  }

  async function remover(id: string) {
    await removerServico(id);
    setConfirmandoRemocao(null);
    carregar();
  }

  return (
    <Container full className="flex flex-col gap-8 py-8">
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div>
          <h1 className="text-h2 text-foreground">Catálogo de serviços</h1>
          <p className="text-body text-muted">O que sua empresa faz — sem estoque, com preço fixo ou só uma base pra orçar.</p>
        </div>
        <Button onClick={abrirNovo}>
          <Plus size={18} />
          Novo serviço
        </Button>
      </div>

      {formAberto && negocio && (
        <FormularioServico
          key={editandoId ?? "novo"}
          contaMestreId={negocio.usuarioId}
          servico={editandoId ? servicos.find((x) => x.id === editandoId) ?? null : null}
          onSalvo={() => {
            setFormAberto(false);
            carregar();
          }}
          onCancelar={() => setFormAberto(false)}
        />
      )}

      {carregando ? (
        <p className="py-8 text-center text-body text-muted">Carregando...</p>
      ) : servicos.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 py-12 text-center">
          <Wrench size={28} className="text-accent-700" />
          <p className="text-body text-muted">Nenhum serviço cadastrado ainda. Ex: &quot;Consultoria — a partir de R$ 500&quot;.</p>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {servicos.map((s) => (
            <Card key={s.id} className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-body font-semibold text-foreground">{s.nome}</p>
                  {s.descricao && <p className="text-small text-muted">{s.descricao}</p>}
                </div>
                <p className="shrink-0 text-body font-semibold text-foreground">{rotuloPrecoServico(s)}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {s.codigo && (
                  <Badge variant="neutral" size="sm">
                    <Hash size={12} />
                    {s.codigo}
                  </Badge>
                )}
                {s.tempo_estimado && (
                  <Badge variant="neutral" size="sm">
                    <Clock size={12} />
                    {s.tempo_estimado}
                  </Badge>
                )}
                {!s.preco_fixo && <Badge variant="accent" size="sm">Base de orçamento</Badge>}
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="tertiary" onClick={() => abrirEdicao(s)}>
                  <Pencil size={14} />
                  Editar
                </Button>
                {confirmandoRemocao === s.id ? (
                  <>
                    <Button size="sm" variant="tertiary" onClick={() => setConfirmandoRemocao(null)}>Não</Button>
                    <Button size="sm" onClick={() => remover(s.id)} className="bg-red-500 shadow-none hover:bg-red-600">Remover</Button>
                  </>
                ) : (
                  <Button size="sm" variant="tertiary" onClick={() => setConfirmandoRemocao(s.id)}>
                    <Trash2 size={14} />
                    Remover
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </Container>
  );
}
