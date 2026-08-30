import { Header } from "@/components/landing/Header";
import { Hero } from "@/components/landing/Hero";
import { Problema } from "@/components/landing/Problema";
import { Solucao } from "@/components/landing/Solucao";
import { Funcionalidades } from "@/components/landing/Funcionalidades";
import { ComoFunciona } from "@/components/landing/ComoFunciona";
import { Planos } from "@/components/landing/Planos";
import { Diferenciais } from "@/components/landing/Diferenciais";
import { Depoimentos } from "@/components/landing/Depoimentos";
import { Faq } from "@/components/landing/Faq";
import { CtaFinal } from "@/components/landing/CtaFinal";
import { Footer } from "@/components/landing/Footer";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col bg-background">
      <Header />
      <Hero />
      <Problema />
      <Solucao />
      <Funcionalidades />
      <ComoFunciona />
      <Planos />
      <Diferenciais />
      <Depoimentos />
      <Faq />
      <CtaFinal />
      <Footer />
    </main>
  );
}
