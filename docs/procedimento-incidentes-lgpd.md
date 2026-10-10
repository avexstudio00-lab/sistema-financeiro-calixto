# Procedimento interno — incidente de segurança com dados pessoais (LGPD art. 48)

Documento interno (item 2.4 da especificação de 09/out/2026). Mantido no repositório para qualquer pessoa da equipe achar rápido.

## 1. Detectar e registrar (até 2 h)
- Fontes: alerta do Supabase (advisors/logs), logs da Vercel, tabela `eventos_seguranca`, relato de usuário.
- Abrir um registro com: data/hora UTC da descoberta, quem descobriu, sistemas afetados, primeira hipótese.

## 2. Conter (imediato)
- Trocar chaves expostas (Vercel → Environment Variables: `SUPABASE_SERVICE_ROLE_KEY`, `ASAAS_*`, `VAPID_PRIVATE_KEY`, `CRON_SECRET`) e fazer Redeploy.
- Se houver sessão comprometida: Supabase → Authentication → revogar sessões do(s) usuário(s).
- Se o problema for código: reverter o deploy na Vercel (Instant Rollback) para a última versão boa.

## 3. Avaliar (até 24 h)
- Quais dados (cadastro, financeiros, comprovantes), de quantos titulares, por quanto tempo.
- Há risco ou dano relevante aos titulares? (dados financeiros e de identificação = em regra, sim).

## 4. Comunicar (prazo da regulamentação da ANPD — hoje 3 dias úteis a partir do conhecimento)
- **ANPD**: formulário de Comunicação de Incidente de Segurança no site gov.br/anpd, assinado pelo Encarregado (DPO).
- **Titulares afetados**: e-mail + aviso no app, em linguagem simples: o que aconteceu, quais dados, riscos, o que fizemos, o que a pessoa pode fazer, contato do Encarregado.
- Conteúdo mínimo (art. 48, §1º): natureza dos dados, titulares envolvidos, medidas técnicas de proteção, riscos, motivo de eventual demora, medidas para reverter/mitigar.

## 5. Encerrar
- Relatório final (causa raiz, correção, prevenção) guardado por 5 anos.
- Atualizar o checklist de segurança e o `banco-de-dados-save.md` se houve mudança de banco.

Encarregado (DPO): [NOME] — [e-mail]. Substituto: [NOME] — [e-mail].
