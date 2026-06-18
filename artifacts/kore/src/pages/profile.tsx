import { useState } from "react";
import { User, Shield, Clock, Mail, Building } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getStoredUser, clearToken } from "@/lib/auth";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";

const ROLE_LABELS: Record<string, string> = {
  owner: "Propriétaire",
  admin: "Administrateur",
  member: "Membre",
  viewer: "Lecteur",
};

export default function Profile() {
  const user = getStoredUser();
  const [_, navigate] = useLocation();
  const { toast } = useToast();

  function handleLogout() {
    clearToken();
    navigate("/");
  }

  if (!user) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        Profil non disponible. <button className="underline" onClick={() => navigate("/")}>Retour</button>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <User className="w-5 h-5 text-accent" />
          <h1 className="text-2xl font-serif font-semibold">Mon profil</h1>
        </div>
        <p className="text-sm text-muted-foreground">Informations de compte et accès.</p>
      </div>

      <Card className="border-border/50">
        <CardContent className="pt-6 pb-4 space-y-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-foreground/10 flex items-center justify-center text-xl font-semibold">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="font-semibold text-lg">{user.name}</p>
              <p className="text-sm text-muted-foreground">{user.email}</p>
            </div>
          </div>

          <div className="grid gap-3 pt-2">
            <div className="flex items-center gap-3 text-sm">
              <Shield className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">Rôle :</span>
              <Badge variant="outline" className="capitalize">{ROLE_LABELS[user.role] ?? user.role}</Badge>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <Building className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">Workspace :</span>
              <span className="font-medium">{user.tenantName ?? user.tenantSlug}</span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">Email :</span>
              <span>{user.email}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Permissions actives</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm text-muted-foreground">
            {user.role === "owner" || user.role === "admin" ? (
              <>
                <p className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-green-500 shrink-0" /> Lire toutes les données du workspace</p>
                <p className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-green-500 shrink-0" /> Créer et modifier des données</p>
                <p className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-green-500 shrink-0" /> Exporter des données</p>
                <p className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-green-500 shrink-0" /> Gérer les utilisateurs</p>
                {user.role === "owner" && (
                  <p className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-purple-500 shrink-0" /> Administration complète du workspace</p>
                )}
              </>
            ) : user.role === "member" ? (
              <>
                <p className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-green-500 shrink-0" /> Lire et créer des données</p>
                <p className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" /> Export limité (avec validation)</p>
                <p className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-red-400 shrink-0" /> Pas d'accès administration</p>
              </>
            ) : (
              <p className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-blue-400 shrink-0" /> Lecture seule</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Button variant="outline" onClick={handleLogout} className="w-full text-destructive border-destructive/30 hover:bg-destructive/5">
        Se déconnecter
      </Button>
    </div>
  );
}
