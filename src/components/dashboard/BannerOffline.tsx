import { WifiOff } from "lucide-react";
import { Card } from "@/components/ui/Card";

function formatarDataHora(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Aviso mostrado quando a tela está exibindo dados salvos (cache) em vez de
 * dados ao vivo, porque o aparelho está sem internet no momento. Ver
 * src/lib/offline/cache.ts.
 */
export function BannerOffline({ salvoEm }: { salvoEm: string }) {
  return (
    <Card className="flex items-center gap-3 border-slate-200 bg-slate-50 print:hidden">
      <WifiOff size={20} className="shrink-0 text-slate-500" />
      <p className="text-body text-slate-700">
        Sem conexão agora — mostrando os dados de <strong>{formatarDataHora(salvoEm)}</strong>.
        Assim que a internet voltar, atualiza sozinho.
      </p>
    </Card>
  );
}
