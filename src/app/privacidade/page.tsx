import Link from "next/link";
import { ArrowLeft, Wallet } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Footer } from "@/components/landing/Footer";

export const metadata = {
  title: "Política de privacidade — Meu Controle",
  description: "Como o Meu Controle trata seus dados pessoais, conforme a LGPD (Lei nº 13.709/2018).",
};

const ATUALIZADO_EM = "10 de outubro de 2026";

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-h3 text-foreground">{titulo}</h2>
      {children}
    </section>
  );
}

/**
 * Política de privacidade pública (item 2.4 da especificação de 09/out/2026).
 * Texto em linguagem direta. Os dados da empresa e do Encarregado (DPO)
 * ficam entre colchetes até o dono informar os dados reais — nunca inventar
 * razão social, CNPJ, endereço ou nome de pessoa.
 */
export default function PrivacidadePage() {
  const p = "text-body text-muted";
  return (
    <main className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border">
        <Container className="flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-foreground">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-700 text-white">
              <Wallet size={18} strokeWidth={2} />
            </span>
            <span className="text-body font-semibold">Meu Controle</span>
          </Link>
          <Link href="/" className="flex items-center gap-1.5 text-small font-medium text-muted hover:text-foreground">
            <ArrowLeft size={16} />
            Voltar pro site
          </Link>
        </Container>
      </header>

      <Container className="flex flex-col gap-8 py-12">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-small text-amber-900">
          <strong>Aviso:</strong> os campos entre colchetes (razão social, CNPJ, endereço e dados do
          Encarregado) precisam ser preenchidos com os dados reais da empresa. Recomenda-se revisão
          jurídica antes de considerar este texto definitivo.
        </div>

        <div>
          <h1 className="text-h1 text-foreground">Política de privacidade</h1>
          <p className="mt-2 text-small text-muted">Última atualização: {ATUALIZADO_EM} · versão 2026-10-10</p>
        </div>

        <Secao titulo="1. Quem cuida dos seus dados">
          <p className={p}>
            O controlador dos dados é [RAZÃO SOCIAL DA EMPRESA], CNPJ [00.000.000/0000-00], com sede em
            [endereço completo], responsável pelo aplicativo Meu Controle (Sistema Financeiro Calixto).
          </p>
          <p className={p}>
            <strong className="text-foreground">Encarregado de Proteção de Dados (DPO):</strong> [NOME DO
            ENCARREGADO] — e-mail [e-mail do encarregado]. É com essa pessoa que você fala sobre qualquer
            assunto de privacidade, e é ela quem recebe as comunicações da Autoridade Nacional de Proteção de
            Dados (ANPD).
          </p>
        </Secao>

        <Secao titulo="2. Quais dados usamos e por quê">
          <ul className="flex list-disc flex-col gap-2 pl-5 text-body text-muted">
            <li>
              <strong className="text-foreground">Cadastro:</strong> nome, e-mail e senha (guardada só como
              hash pelo provedor de autenticação, nunca em texto). Para criar e proteger sua conta
              (execução de contrato, art. 7º, V).
            </li>
            <li>
              <strong className="text-foreground">Dados financeiros que você mesmo digita:</strong> carteiras,
              lançamentos, metas, dívidas, investimentos e, na área da empresa, vendas, estoque, clientes,
              fornecedores, orçamentos e notas. Só para o app funcionar para você (execução de contrato).
            </li>
            <li>
              <strong className="text-foreground">Comprovantes (fotos):</strong> só quando você anexa. Ficam em
              armazenamento privado, acessível apenas com o seu login, por links que expiram em até 60
              minutos.
            </li>
            <li>
              <strong className="text-foreground">Dados técnicos de segurança:</strong> endereço IP e navegador
              no momento do aceite destes termos e em eventos de segurança (ex.: tentativas bloqueadas). Para
              cumprir obrigação legal e proteger a conta (art. 7º, II e IX).
            </li>
            <li>
              <strong className="text-foreground">Notificações:</strong> se você ativar, guardamos o endereço
              técnico do seu aparelho para enviar avisos. Você pode esconder valores e nomes das notificações
              (&quot;Bloqueio de prévia&quot;) ou desativar a qualquer momento.
            </li>
          </ul>
        </Secao>

        <Secao titulo="3. O que nunca fazemos">
          <ul className="flex list-disc flex-col gap-2 pl-5 text-body text-muted">
            <li>Não pedimos nem guardamos número de cartão, senha de banco ou acesso a contas bancárias (minimização, art. 6º, III).</li>
            <li>Não vendemos nem alugamos seus dados.</li>
            <li>Não usamos seus dados financeiros para publicidade.</li>
            <li>Seu PIN de desbloqueio e sua biometria ficam só no seu aparelho; o servidor guarda apenas a chave pública da biometria.</li>
          </ul>
        </Secao>

        <Secao titulo="4. Com quem os dados são compartilhados">
          <p className={p}>
            Apenas com operadores necessários para o serviço funcionar: hospedagem do site (Vercel), banco de
            dados e autenticação (Supabase), pagamento da assinatura (Asaas — os dados de cartão são digitados
            direto na página do Asaas, nunca passam pelo app) e serviços de envio de notificações do seu
            aparelho (Apple/Google). No plano em grupo, só os dados da área &quot;Minha empresa&quot; são
            visíveis a quem você convidar; sua vida pessoal continua privada.
          </p>
        </Secao>

        <Secao titulo="5. Seus direitos (art. 18 da LGPD)">
          <p className={p}>Dentro do app, em <strong className="text-foreground">Perfil → Privacidade e dados</strong>, você pode, sozinho e na hora:</p>
          <ul className="flex list-disc flex-col gap-2 pl-5 text-body text-muted">
            <li><strong className="text-foreground">Confirmar e acessar</strong> o que temos sobre você;</li>
            <li><strong className="text-foreground">Levar seus dados</strong> (portabilidade) em arquivo JSON ou CSV;</li>
            <li><strong className="text-foreground">Corrigir</strong> dados cadastrais (nome, foto, tipo de perfil);</li>
            <li>
              <strong className="text-foreground">Excluir a conta</strong> de forma definitiva: apagamos todos os
              seus lançamentos, cadastros e arquivos, sem possibilidade de recuperação;
            </li>
            <li>Revogar o consentimento e pedir informação sobre compartilhamento, pelo e-mail do Encarregado.</li>
          </ul>
          <p className={p}>Pedidos feitos ao Encarregado são respondidos em até 15 dias.</p>
        </Secao>

        <Secao titulo="6. Por quanto tempo guardamos">
          <p className={p}>
            Enquanto sua conta existir. Ao excluir a conta, os dados são apagados na hora. Registros mínimos
            de pagamento podem ser mantidos pelo prazo exigido pela legislação fiscal, sem ligação com seus
            dados financeiros pessoais.
          </p>
        </Secao>

        <Secao titulo="7. Segurança">
          <p className={p}>
            Conexão sempre criptografada (HTTPS com HSTS), isolamento de dados por usuário direto no banco
            (Row Level Security), cabeçalhos de proteção contra ataques comuns, limite de tentativas em rotas
            sensíveis, cópias de segurança do provedor do banco e bloqueio opcional por PIN ou biometria no
            seu aparelho.
          </p>
        </Secao>

        <Secao titulo="8. Incidentes de segurança">
          <p className={p}>
            Se acontecer um incidente que possa causar risco ou dano relevante, comunicaremos você e a ANPD
            em prazo razoável (conforme o art. 48 da LGPD e a regulamentação da ANPD), informando o que
            aconteceu, quais dados foram afetados, os riscos e as medidas tomadas.
          </p>
        </Secao>

        <Secao titulo="9. Mudanças nesta política">
          <p className={p}>
            Se mudarmos algo importante, avisaremos dentro do app e pediremos um novo aceite. A versão e a data
            de cada aceite ficam registradas na sua conta.
          </p>
        </Secao>
      </Container>
      <Footer />
    </main>
  );
}
