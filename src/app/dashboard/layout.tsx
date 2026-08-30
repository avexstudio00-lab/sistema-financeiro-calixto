"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { DashboardNav } from "@/components/dashboard/DashboardNav";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, perfil, carregando } = useAuth();

  React.useEffect(() => {
    if (carregando) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (!perfil || !perfil.tipo_perfil) {
      router.replace("/onboarding");
    }
  }, [carregando, user, perfil, router]);

  if (carregando || !user || !perfil || !perfil.tipo_perfil) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="animate-spin text-primary-500" size={28} />
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <DashboardNav />
      <main className="pb-24">{children}</main>
    </div>
  );
}
