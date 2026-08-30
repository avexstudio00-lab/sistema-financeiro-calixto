# Sistema Financeiro Calixto

Controle financeiro simples e acolhedor para CLT, MEI e ME que ganham de 2 a 6 salários
mínimos. A proposta é entregar a organização de uma planilha, mas com uma experiência
visual amigável e um dashboard de fechamento mensal — sem nunca parecer uma planilha.

## Stack

- **Next.js 14** (App Router) + TypeScript
- **Tailwind CSS** para estilização
- **Supabase** para dados e autenticação (integração nas próximas etapas)
- Deploy contínuo via **Vercel**

## Status atual — Fase 1: Design System

Esta etapa entrega apenas a base visual do produto, sem as seções finais da página:

- Paleta de cores (`primary` verde esmeralda, `secondary` verde floresta, `accent` teal,
  `background`, `foreground`, `muted`) — ver `tailwind.config.ts`
- Tipografia com Inter e escala semântica (`text-h1`, `text-h2`, `text-h3`, `text-body`,
  `text-small`, `text-button`)
- Componentes reutilizáveis em `src/components/ui`: `Button`, `Card`, `SectionTitle`,
  `Badge`, `Input`, `Icon`, além de `FadeIn` (microinteração de rolagem) e `Container`
  (espaçamento consistente)
- Página `/design-system` com todos os componentes e estados para conferência visual

## Rodando localmente

```bash
npm install
npm run dev
```

Acesse `http://localhost:3000` para a home e `http://localhost:3000/design-system` para
a documentação visual dos componentes.

## Variáveis de ambiente

Copie `.env.example` para `.env.local` quando a integração com Supabase for adicionada.
