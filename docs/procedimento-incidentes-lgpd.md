# Procedimento interno — incidente de segurança com dados pessoais (LGPD art. 48)

Documento interno (item 2.4 da especificação de 09/out/2026; completado no item 7 da apuração de segurança de 10/out/2026). Mantido no repositório para qualquer pessoa da equipe achar rápido.

## 0. Quem responde (preencher antes do lançamento — não deixar em branco)

| Papel | Nome | Contato | Substituto |
|---|---|---|---|
| Responsável pela resposta ao incidente (decide e coordena) | [NOME] | [e-mail / telefone] | [NOME] |
| Encarregado de dados (DPO) — assina a comunicação à ANPD | [NOME] | [e-mail público do DPO] | [NOME] |
| Técnico (acesso a Vercel, Supabase, Asaas, GitHub) | [NOME] | [telefone] | [NOME] |

Quem ficar sabendo de um possível incidente avisa o Responsável **na hora**, por telefone — não espera confirmar.

**Registro oficial:** `docs/registro-incidentes.md` (todo evento entra lá, mesmo os pequenos e mesmo os que não precisarem de comunicação — a ANPD pode pedir esse registro).

## 1. Detectar e registrar (até 2 h)
- Fontes: alerta do Supabase (advisors/logs), logs da Vercel, tabela `eventos_seguranca`, relato de usuário.
- Abrir um registro com: data/hora UTC da descoberta, quem descobriu, sistemas afetados, primeira hipótese.

## 2. Conter (imediato)
- Trocar chaves expostas (Vercel → Environment Variables: `SUPABASE_SERVICE_ROLE_KEY`, `ASAAS_*`, `VAPID_PRIVATE_KEY`, `CRON_SECRET`) e fazer Redeploy.
- Se houver sessão comprometida: Supabase → Authentication → revogar sessões do(s) usuário(s).
- Se o problema for código: reverter o deploy na Vercel (Instant Rollback) para a última versão boa.

## 3. Avaliar (até 24 h)
- Classificar: **baixo** (sem dado pessoal exposto, ex.: tentativa barrada pelo RLS), **médio** (dado pessoal exposto a poucas pessoas, sem dado financeiro), **alto** (dado financeiro, de identificação, comprovantes, credenciais ou muitos titulares).
- Quais dados (cadastro, financeiros, comprovantes), de quantos titulares, por quanto tempo.
- Há risco ou dano relevante aos titulares? (dados financeiros e de identificação = em regra, sim).

## 4. Comunicar (Resolução CD/ANPD nº 15/2024 — 3 dias úteis a partir do conhecimento, quando houver risco ou dano relevante)
- Fluxo de decisão: incidente **médio ou alto** com dado pessoal → comunica ANPD **e** titulares. **Baixo** → só registra (com a justificativa de por que não comunicou).
- **ANPD**: formulário de Comunicação de Incidente de Segurança no site gov.br/anpd, assinado pelo Encarregado (DPO).
- **Titulares afetados**: e-mail + aviso no app, em linguagem simples: o que aconteceu, quais dados, riscos, o que fizemos, o que a pessoa pode fazer, contato do Encarregado.
- Conteúdo mínimo (art. 48, §1º): natureza dos dados, titulares envolvidos, medidas técnicas de proteção, riscos, motivo de eventual demora, medidas para reverter/mitigar.

## 5. Encerrar
- Relatório final (causa raiz, correção, prevenção) guardado por 5 anos.
- Atualizar o checklist de segurança e o `banco-de-dados-save.md` se houve mudança de banco.

Modelo de aviso ao titular (adaptar): "Em [data] identificamos [o que aconteceu]. Os dados envolvidos foram [quais]. Já [medidas tomadas]. Recomendamos que você [trocar a senha / ativar a verificação em duas etapas / ficar atento a contatos em nosso nome]. Dúvidas: [e-mail do Encarregado]."
