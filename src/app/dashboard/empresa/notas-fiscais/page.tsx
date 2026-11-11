import { redirect } from "next/navigation";

/**
 * Notas fiscais saíram do app (10/nov/2026, decisão do usuário): emitir nota
 * exige integração com prefeitura/Receita, que não vamos fazer agora. No
 * lugar, a tela DAS / Impostos ganhou o simulador de quanto vai pagar de
 * imposto. Endereço antigo leva pra lá.
 */
export default function NotasFiscaisPage() {
  redirect("/dashboard/empresa/das#simulador");
}
