"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { FadeIn } from "@/components/ui/FadeIn";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { cn } from "@/lib/utils";

const PERGUNTAS = [
  {
    pergunta: "É seguro usar?",
    resposta: "Sim. Seus dados são protegidos e só você tem acesso às suas informações.",
  },
  {
    pergunta: "Como funciona a análise de IA?",
    resposta:
      "No fim do mês, a IA analisa seus gastos e ganhos e mostra quanto entrou, quanto saiu, quanto sobrou e a variação em relação ao mês anterior.",
  },
  {
    pergunta: "Funciona para MEI e ME?",
    resposta:
      "Sim. O plano Avançado tem análise específica para negócios: vendas, custos, lucro real e comparativo mensal.",
  },
  {
    pergunta: "Sou CLT, esse site serve para mim?",
    resposta:
      "Sim, o site foi pensado pra quem tem salário fixo. O plano Completo tem dashboard diário, gráficos e sugestões de corte pra te ajudar a sobrar mais e começar a investir. E se você já compra e revende por conta própria e quer controlar estoque e vendas de verdade, o plano Avançado também é liberado pra você, mesmo sendo CLT.",
  },
  {
    pergunta: "Preciso entender de finanças?",
    resposta: "Não. O site é feito para quem não entende de finanças. Tudo é explicado de forma simples.",
  },
  {
    pergunta: "Posso cancelar quando quiser?",
    resposta: "Sim. Você pode cancelar a qualquer momento, sem multa.",
  },
];

export function Faq() {
  const [aberta, setAberta] = React.useState<number | null>(0);

  return (
    <section id="duvidas" className="py-20">
      <Container className="flex flex-col gap-10">
        <SectionTitle
          align="center"
          eyebrow="Dúvidas"
          title="Perguntas frequentes"
          className="mx-auto items-center text-center"
        />
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-3">
          {PERGUNTAS.map((item, i) => {
            const abertaAtual = aberta === i;
            return (
              <FadeIn key={item.pergunta} delay={i * 60}>
                <div className="overflow-hidden rounded-2xl border border-border bg-card">
                  <button
                    type="button"
                    onClick={() => setAberta(abertaAtual ? null : i)}
                    aria-expanded={abertaAtual}
                    className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
                  >
                    <span className="text-body font-semibold text-foreground">{item.pergunta}</span>
                    <ChevronDown
                      size={20}
                      className={cn(
                        "shrink-0 text-muted transition-transform duration-200",
                        abertaAtual && "rotate-180 text-primary-600"
                      )}
                    />
                  </button>
                  <div
                    className={cn(
                      "grid transition-all duration-300 ease-smooth",
                      abertaAtual ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                    )}
                  >
                    <div className="overflow-hidden">
                      <p className="px-5 pb-4 text-body text-muted">{item.resposta}</p>
                    </div>
                  </div>
                </div>
              </FadeIn>
            );
          })}
        </div>
      </Container>
    </section>
  );
}
