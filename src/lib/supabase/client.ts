import { createClient } from "@supabase/supabase-js";
import { MODO_SESSAO_COOKIE, CHAVE_SESSAO, armazenamentoSessao, fetchSessaoCookie } from "./sessaoCookie";

// A chave abaixo é a chave pública (anon) do Supabase — feita para ser exposta no
// navegador. A segurança dos dados vem do Row Level Security (RLS) ativado em todas
// as tabelas, não do sigilo desta chave. A chave secreta (service_role) nunca é usada
// aqui e nunca deve ir para o front-end.
const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://wtkwsyvjtnxpoopdniwq.supabase.co";
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind0a3dzeXZqdG54cG9vcGRuaXdxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc2Nzg3NzksImV4cCI6MjEwMzI1NDc3OX0.3UsGLu-z8lMSA96NqGTQbsVqjrzTiWhmrKrbSb9uuT8";

// Item 3 da apuração de segurança (10/out/2026): com NEXT_PUBLIC_SESSAO_COOKIE=1
// na Vercel, o refresh token passa a morar só num cookie httpOnly e a sessão do
// navegador fica só em memória (ver ./sessaoCookie.ts). Sem a variável, tudo
// continua exatamente como antes (sessão no localStorage).
export const supabase = MODO_SESSAO_COOKIE
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        storageKey: CHAVE_SESSAO,
        storage: armazenamentoSessao,
      },
      global: { fetch: fetchSessaoCookie },
    })
  : createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    });
