/** IP de origem da requisição (Vercel põe o do cliente em x-forwarded-for,
 * primeiro da lista). Usado só para registro de consentimento (LGPD) e
 * auditoria — nunca para decidir acesso. */
export function ipDaRequisicao(request: Request): string | null {
  const xff = request.headers.get("x-forwarded-for");
  const ip = (xff ? xff.split(",")[0] : request.headers.get("x-real-ip") ?? "").trim();
  return ip ? ip.slice(0, 64) : null;
}
