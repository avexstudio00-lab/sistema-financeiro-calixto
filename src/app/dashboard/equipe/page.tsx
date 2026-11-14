import { redirect } from "next/navigation";

// "Minha equipe" mudou para dentro de Minha empresa (14/nov/2026, item 3.4).
// Este endereço antigo só redireciona, pra links salvos continuarem valendo.
export default function EquipeAntiga() {
  redirect("/dashboard/empresa/equipe");
}
