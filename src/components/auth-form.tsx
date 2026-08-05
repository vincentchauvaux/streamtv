"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    if (mode === "register" && !acceptTerms) {
      setError("Vous devez accepter les CGU et la politique de confidentialité");
      setLoading(false);
      return;
    }

    const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password,
        name: name || undefined,
        ...(mode === "register" ? { acceptTerms: true } : {}),
      }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "Une erreur est survenue");
      return;
    }

    router.push("/app");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {mode === "register" && (
        <div>
          <label className="mb-1.5 block text-sm text-muted">Prénom</label>
          <Input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Alex"
          />
        </div>
      )}
      <div>
        <label className="mb-1.5 block text-sm text-muted">Email</label>
        <Input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="vous@exemple.com"
        />
      </div>
      <div>
        <label className="mb-1.5 block text-sm text-muted">Mot de passe</label>
        <Input
          type="password"
          required
          minLength={mode === "register" ? 8 : 1}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
        />
        {mode === "register" && (
          <p className="mt-1 text-xs text-muted">Minimum 8 caractères</p>
        )}
      </div>

      {mode === "register" && (
        <label className="flex items-start gap-2.5 text-sm text-muted">
          <input
            type="checkbox"
            checked={acceptTerms}
            onChange={(e) => setAcceptTerms(e.target.checked)}
            className="mt-1 h-4 w-4 rounded border-border bg-surface accent-primary"
            required
          />
          <span>
            J&apos;accepte les{" "}
            <Link href="/cgu" className="text-primary hover:underline">
              CGU
            </Link>{" "}
            et la{" "}
            <Link href="/confidentialite" className="text-primary hover:underline">
              politique de confidentialité
            </Link>
            .
          </span>
        </label>
      )}

      {error && (
        <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <Button type="submit" disabled={loading} className="w-full">
        <Sparkles className="h-4 w-4" />
        {loading
          ? "Chargement..."
          : mode === "login"
            ? "Se connecter"
            : "Créer mon compte"}
      </Button>
    </form>
  );
}
