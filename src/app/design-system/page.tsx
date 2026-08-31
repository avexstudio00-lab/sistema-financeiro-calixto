"use client";

import { Wallet, TrendingUp, PiggyBank, Mail, Lock, Search, Sparkles, ShieldCheck, Smile } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Icon } from "@/components/ui/Icon";
import { FadeIn } from "@/components/ui/FadeIn";

const primarySwatches = [
  { name: "primary-50", classes: "bg-primary-50" },
  { name: "primary-100", classes: "bg-primary-100" },
  { name: "primary-300", classes: "bg-primary-300" },
  { name: "primary-500", classes: "bg-primary-500" },
  { name: "primary-700", classes: "bg-primary-700" },
  { name: "primary-900", classes: "bg-primary-900" },
];

const accentSwatches = [
  { name: "accent-50", classes: "bg-accent-50" },
  { name: "accent-200", classes: "bg-accent-200" },
  { name: "accent-500", classes: "bg-accent-500" },
  { name: "accent-700", classes: "bg-accent-700" },
];

function Swatch({ name, classes }: { name: string; classes: string }) {
  return (
    <div className="flex flex-col gap-2">
      <div className={`h-16 w-full rounded-xl border border-slate-100 ${classes}`} />
      <span className="text-small text-muted">{name}</span>
    </div>
  );
}

export default function DesignSystemPage() {
  return (
    <main className="bg-background pb-32">
      <Container className="flex flex-col gap-24 pt-20">
        <header className="flex flex-col gap-4">
          <Badge variant="accent">Documentação interna</Badge>
          <h1 className="text-h1 text-foreground">Design System</h1>
          <p className="max-w-2xl text-body text-muted">
            Base visual do controle financeiro para CLT, MEI e ME. Acolhedora, clara e longe de
            qualquer cara de planilha.
          </p>
        </header>

        <section className="flex flex-col gap-6">
          <SectionTitle eyebrow="Paleta" title="Cores" />
          <div>
            <p className="mb-3 text-small font-medium text-muted">Primária — verde esmeralda</p>
            <div className="grid grid-cols-3 gap-4 sm:grid-cols-6">
              {primarySwatches.map((s) => (
                <Swatch key={s.name} {...s} />
              ))}
            </div>
          </div>
          <div>
            <p className="mb-3 text-small font-medium text-muted">Destaque — teal</p>
            <div className="grid max-w-md grid-cols-4 gap-4">
              {accentSwatches.map((s) => (
                <Swatch key={s.name} {...s} />
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-4">
            <Swatch name="secondary (verde floresta)" classes="bg-secondary" />
            <Swatch name="background" classes="bg-background border border-slate-200" />
            <Swatch name="foreground" classes="bg-foreground" />
            <Swatch name="muted" classes="bg-muted" />
          </div>
        </section>

        <section className="flex flex-col gap-6">
          <SectionTitle eyebrow="Hierarquia" title="Tipografia — Inter" />
          <div className="flex flex-col gap-4">
            <p className="text-h1">Título H1 — acolhedor e claro</p>
            <p className="text-h2">Título H2 — organiza as seções</p>
            <p className="text-h3">Título H3 — subtítulos de cartões</p>
            <p className="text-body">
              Texto body — usado nas explicações e descrições ao longo do produto, sempre em
              linguagem simples e próxima do usuário.
            </p>
            <p className="text-small text-muted">Texto small — legendas e detalhes de apoio.</p>
            <p className="text-button uppercase tracking-wide text-primary-600">Texto de botão</p>
          </div>
        </section>

        <section className="flex flex-col gap-6">
          <SectionTitle
            eyebrow="Ações"
            title="Botões"
            description="Três níveis de ênfase, com estados de hover, active e foco já configurados."
          />
          <div className="flex flex-wrap items-center gap-4">
            <Button variant="primary">Adicionar lançamento</Button>
            <Button variant="secondary">Ver relatório</Button>
            <Button variant="tertiary">Cancelar</Button>
            <Button variant="primary" disabled>
              Desabilitado
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <Button size="sm">Pequeno</Button>
            <Button size="md">Médio</Button>
            <Button size="lg">Grande</Button>
          </div>
        </section>

        <section className="flex flex-col gap-6">
          <SectionTitle eyebrow="Status" title="Badges" />
          <div className="flex flex-wrap gap-3">
            <Badge variant="primary">Em dia</Badge>
            <Badge variant="accent">Novo</Badge>
            <Badge variant="secondary">Recorrente</Badge>
            <Badge variant="warning">Atenção</Badge>
            <Badge variant="danger">Atrasado</Badge>
            <Badge variant="neutral">MEI</Badge>
          </div>
        </section>

        <section className="flex flex-col gap-6">
          <SectionTitle eyebrow="Formulários" title="Campos de entrada" />
          <div className="grid max-w-xl gap-5 sm:grid-cols-2">
            <Input label="Nome" placeholder="Como podemos te chamar?" />
            <Input label="E-mail" placeholder="voce@email.com" leftIcon={Mail} />
            <Input label="Senha" type="password" placeholder="••••••••" leftIcon={Lock} />
            <Input label="Buscar categoria" placeholder="Alimentação, transporte..." leftIcon={Search} />
            <Input label="Valor" placeholder="R$ 0,00" error="Informe um valor válido" />
            <Input label="Campo desabilitado" placeholder="—" disabled />
          </div>
        </section>

        <section className="flex flex-col gap-6">
          <SectionTitle
            eyebrow="Iconografia"
            title="Ícones"
            description="lucide-react, com peso de traço consistente em todo o produto."
          />
          <div className="flex flex-wrap items-center gap-8 text-primary-600">
            <Icon icon={Wallet} size="lg" />
            <Icon icon={TrendingUp} size="lg" />
            <Icon icon={PiggyBank} size="lg" />
            <Icon icon={ShieldCheck} size="lg" />
            <Icon icon={Smile} size="lg" />
            <Icon icon={Sparkles} size="lg" />
          </div>
        </section>

        <section className="flex flex-col gap-6">
          <SectionTitle
            eyebrow="Microinterações"
            title="Cards com fade-in ao rolar a página"
            description="Role a tela para ver a animação — o mesmo efeito será usado nas seções do produto final."
          />
          <div className="grid gap-6 sm:grid-cols-3">
            {[
              { icon: Wallet, title: "Meus gastos", text: "Organize por categoria sem esforço." },
              { icon: TrendingUp, title: "Evolução mensal", text: "Veja para onde seu dinheiro está indo." },
              { icon: PiggyBank, title: "Metas", text: "Guarde para o que importa, no seu ritmo." },
            ].map((item, i) => (
              <FadeIn key={item.title} delay={i * 120}>
                <Card variant="interactive" className="flex h-full flex-col gap-4">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
                    <Icon icon={item.icon} />
                  </span>
                  <h3 className="text-h3">{item.title}</h3>
                  <p className="text-body text-muted">{item.text}</p>
                </Card>
              </FadeIn>
            ))}
          </div>
        </section>
      </Container>
    </main>
  );
}
