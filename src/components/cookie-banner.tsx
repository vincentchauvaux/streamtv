"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const STORAGE_KEY = "streamtv_cookie_consent";

type Consent = "accepted" | "essential";

export function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) setVisible(true);
    } catch {
      setVisible(true);
    }
  }, []);

  function save(value: Consent) {
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {
      /* ignore */
    }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Consentement aux cookies"
      className="fixed inset-x-0 bottom-0 z-[60] p-4 sm:p-6"
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-4 rounded-2xl border border-border bg-surface/95 p-5 shadow-2xl backdrop-blur-md sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm leading-relaxed text-muted">
          <p className="font-medium text-foreground">Cookies & confidentialité</p>
          <p className="mt-1">
            StreamTV utilise uniquement un cookie de session technique (connexion).
            Aucun cookie publicitaire.{" "}
            <Link href="/cookies" className="text-primary underline-offset-2 hover:underline">
              Politique cookies
            </Link>
            {" · "}
            <Link
              href="/confidentialite"
              className="text-primary underline-offset-2 hover:underline"
            >
              Confidentialité
            </Link>
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            type="button"
            onClick={() => save("essential")}
            className="rounded-xl border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-surface-hover"
          >
            Essentiels uniquement
          </button>
          <button
            type="button"
            onClick={() => save("accepted")}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover"
          >
            Compris
          </button>
        </div>
      </div>
    </div>
  );
}
