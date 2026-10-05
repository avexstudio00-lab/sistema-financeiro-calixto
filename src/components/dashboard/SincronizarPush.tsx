"use client";

import * as React from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { sincronizarInscricaoPush } from "@/lib/data/notificacoesPush";

/** Confere/renova a inscrição push ao abrir o app (item 6.6, "c"). */
export function SincronizarPush() {
  const { user } = useAuth();
  React.useEffect(() => {
    if (user) void sincronizarInscricaoPush(user.id);
  }, [user]);
  return null;
}
