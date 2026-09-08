import Link from "next/link";
import { ArrowLeft, Wallet } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Footer } from "@/components/landing/Footer";

const ATUALIZADO_EM = "8 de setembro de 2026";

export default function TermosPage() {
  return (
    <main className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border">
        <Container className="flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-foreground">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-500 text-white">
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
          <strong>Aviso importante:</strong> este é um rascunho gerado pra cobrir a exigência legal de ter
          uma página de Termos de uso e Política de cancelamento publicada. Os campos entre colchetes
          (CNPJ, endereço, e-mail de contato) precisam ser preenchidos com os dados reais da empresa, e o
          texto como um todo deve passar por revisão de um advogado antes de valer como o termo definitivo
          — principalmente as cláusulas de cobrança recorrente, cancelamento e foro.
        </div>

        <div>
          <h1 className="text-h1 text-foreground">Termos de uso e política de cancelamento</h1>
          <p className="mt-2 text-small text-muted">Última atualização: {ATUALIZADO_EM}</p>
        </div>

        <section className="flex flex-col gap-3">
          <h2 className="text-h3 text-foreground">1. Quem somos</h2>
          <p className="text-body text-muted">
            O Meu Controle é um aplicativo de gestão financeira pessoal e empresarial (MEI/ME), oferecido
            por assinatura mensal, desenvolvido e operado por [RAZÃO SOCIAL DA EMPRESA], inscrita no CNPJ
            sob o nº [00.000.000/0000-00], com sede em [endereço completo] (“nós”, “Meu Controle”). Estes
            Termos de uso regem a relação entre a empresa e qualquer pessoa que crie uma conta no
            aplicativo (“você”, “usuário”).
          </p>
          <p className="text-body text-muted">
            Ao criar uma conta, você declara ter lido, compreendido e concordado integralmente com estes
            Termos e com a Política de cancelamento descrita abaixo.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-h3 text-foreground">2. O que o serviço é (e o que não é)</h2>
          <p className="text-body text-muted">
            O Meu Controle é uma ferramenta de organização e visualização de dados financeiros informados
            por você mesmo (lançamentos, contas, metas, categorias de gasto, dados de vendas e estoque no
            caso de conta empresarial). O aplicativo não é uma instituição financeira, não realiza
            pagamentos ou transferências em seu nome fora do fluxo de cobrança da própria assinatura, e não
            oferece consultoria financeira, contábil, tributária ou de investimentos — as informações e
            análises apresentadas (inclusive resumos gerados por inteligência artificial) têm caráter
            exclusivamente informativo e organizacional, não substituindo a orientação de um profissional
            habilitado (contador, advogado ou consultor financeiro).
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-h3 text-foreground">3. Cadastro e conta</h2>
          <p className="text-body text-muted">
            Você deve fornecer informações verdadeiras ao se cadastrar e é responsável por manter a
            confidencialidade da sua senha. Contas são pessoais e intransferíveis; no plano Grupo, cada
            pessoa convidada (sócio ou funcionário) tem login próprio — nunca deve compartilhar senha com
            outra pessoa da equipe. A vida pessoal de cada usuário (lançamentos, metas, carteiras e
            investimentos da aba “Minha vida”) nunca é compartilhada com outras pessoas da mesma conta,
            nem mesmo com o dono da conta — só os dados da aba “Minha empresa” são compartilháveis entre
            quem foi convidado.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-h3 text-foreground">4. Planos, cobrança e renovação automática</h2>
          <p className="text-body text-muted">
            O Meu Controle é cobrado por assinatura recorrente (mensal), processada através do parceiro de
            pagamentos Asaas, via cartão de crédito. Ao assinar um plano pago, você autoriza a cobrança
            automática do valor do plano escolhido a cada ciclo, até que a assinatura seja cancelada. Os
            valores e o que cada plano inclui estão descritos na página de planos dentro do aplicativo e
            podem ser reajustados mediante aviso prévio.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-h3 text-foreground">
            5. Direito de arrependimento (art. 49 do Código de Defesa do Consumidor)
          </h2>
          <p className="text-body text-muted">
            Como a contratação é feita à distância (pela internet), você tem o direito de desistir da
            assinatura em até <strong>7 (sete) dias corridos</strong> a partir da data da contratação, sem
            qualquer ônus ou justificativa, conforme o art. 49 do Código de Defesa do Consumidor (Lei nº
            8.078/1990). Exercendo esse direito dentro do prazo, qualquer valor já pago será integralmente
            estornado.
          </p>
          <p className="text-body text-muted">
            Para exercer o direito de arrependimento, entre em contato pelo e-mail [e-mail de suporte]
            informando o e-mail cadastrado na conta e a data da assinatura.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-h3 text-foreground">6. Cancelamento (fora do prazo de arrependimento)</h2>
          <p className="text-body text-muted">
            Você pode cancelar sua assinatura a qualquer momento, diretamente pela tela “Meu plano” dentro
            do aplicativo, sem multa e sem precisar justificar o motivo. O cancelamento interrompe as
            cobranças futuras; o acesso aos recursos do plano pago permanece até o fim do período já pago
            (o ciclo em que o cancelamento foi feito não é reembolsado proporcionalmente, exceto quando o
            cancelamento ocorrer dentro do prazo de arrependimento da seção 5). Seus dados continuam
            acessíveis num plano gratuito equivalente, salvo se você solicitar a exclusão da conta.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-h3 text-foreground">7. Seus dados</h2>
          <p className="text-body text-muted">
            Os dados financeiros que você cadastra são usados exclusivamente para fornecer as
            funcionalidades do próprio aplicativo (organização, gráficos, alertas e resumos). Não vendemos
            dados de usuários a terceiros. Uma Política de privacidade detalhada, com o tratamento de dados
            pessoais conforme a Lei Geral de Proteção de Dados (LGPD — Lei nº 13.709/2018), será
            disponibilizada separadamente.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-h3 text-foreground">8. Propriedade intelectual</h2>
          <p className="text-body text-muted">
            O código, design, marca “Meu Controle” e demais elementos do aplicativo pertencem a [RAZÃO
            SOCIAL DA EMPRESA] ou a seus licenciantes. Os dados que você insere continuam sendo seus; você
            nos concede apenas a licença necessária para processá-los e exibi-los de volta para você dentro
            do serviço.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-h3 text-foreground">9. Alterações destes termos</h2>
          <p className="text-body text-muted">
            Podemos atualizar estes Termos periodicamente. Mudanças relevantes serão comunicadas por e-mail
            ou por aviso dentro do aplicativo com antecedência razoável. O uso continuado do serviço após a
            mudança entrar em vigor representa concordância com os novos termos.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-h3 text-foreground">10. Legislação aplicável e foro</h2>
          <p className="text-body text-muted">
            Estes Termos são regidos pelas leis da República Federativa do Brasil. Fica eleito o foro da
            comarca de [cidade/UF] para dirimir eventuais conflitos, com renúncia a qualquer outro, por mais
            privilegiado que seja, ressalvado o direito do consumidor de optar pelo foro do seu domicílio,
            conforme o art. 101, I, do CDC.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-h3 text-foreground">11. Contato</h2>
          <p className="text-body text-muted">
            Dúvidas sobre estes Termos, cancelamentos ou exercício do direito de arrependimento podem ser
            enviadas para [e-mail de suporte].
          </p>
        </section>
      </Container>

      <Footer />
    </main>
  );
}
