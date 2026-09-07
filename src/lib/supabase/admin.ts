import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Mesmos valores de src/lib/supabase/client.ts (a URL e a chave anon são
// públicas por natureza — a segurança vem do RLS). Repetidos aqui para este
// arquivo não depender do client "use client" do navegador.
const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://wtkwsyvjtnxpoopdniwq.supabase.co";
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind0a3dzeXZqdG54cG9vcGRuaXdxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc2Nzg3NzksImV4cCI6MjEwMzI1NDc3OX0.3UsGLu-z8lMSA96NqGTQbsVqjrzTiWhmrKrbSb9uuT8";

/**
 * Client "como o usuário": usa a chave anon + o access_token (JWT) da sessão
 * do próprio usuário, mandado pelo front-end via header Authorization.
 * Consultas feitas com este client respeitam o RLS normalmente, como se
 * fosse o navegador do usuário fazendo a chamada — é o que os Route
 * Handlers de /api/asaas/checkout e /api/asaas/cancelar usam, já que quem
 * está agindo ali é sempre o próprio dono da conta.
 */
export function supabaseComoUsuario(accessToken: string): SupabaseClient {
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Valida o header "Authorization: Bearer <token>" de uma requisição de API
 * e devolve um client Supabase já autenticado como esse usuário. Devolve
 * null se não houver token ou se ele for inválido/expirado — quem chamar
 * deve responder 401 nesse caso.
 */
export async function usuarioAutenticadoDaRequisicao(request: Request) {
  const cabecalho = request.headers.get("authorization") ?? "";
  const token = cabecalho.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;

  const supabase = supabaseComoUsuario(token);
  // Passa o token explicitamente pro getUser() em vez de depender de uma
  // sessão guardada (persistSession está desligado neste client) — é a
  // forma correta de validar um JWT recebido via header num contexto de
  // servidor sem estado, conforme a própria documentação do supabase-js.
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;

  return { supabase, user: data.user };
}

/**
 * Client com a chave service_role — ignora RLS completamente. Uso
 * exclusivo da rota de webhook do Asaas (src/app/api/asaas/webhook/route.ts),
 * que não tem um usuário logado fazendo a chamada (quem chama é o Asaas) e
 * por isso é protegida validando o header "asaas-access-token" contra
 * ASAAS_WEBHOOK_TOKEN antes de qualquer consulta ao banco. Nunca usar este
 * client em uma rota acionada diretamente pelo navegador do usuário.
 */
export function supabaseAdmin(): SupabaseClient {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY não configurada (defina nas env vars da Vercel).");
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
