import type { Metadata } from "next";
import Link from "next/link";
import { LegalLayout, LegalSection } from "@/components/legal-layout";

export const metadata: Metadata = {
  title: "Politique cookies — StreamTV",
  description: "Politique cookies de StreamTV",
};

export default function CookiesPage() {
  return (
    <LegalLayout title="Politique cookies" updatedAt="5 août 2026">
      <LegalSection title="1. Qu'est-ce qu'un cookie ?">
        <p>
          Un cookie est un petit fichier déposé sur votre appareil lors de
          la visite d&apos;un site. Il peut être strictement nécessaire au
          fonctionnement ou lié à des mesures d&apos;audience / publicité.
        </p>
      </LegalSection>

      <LegalSection title="2. Cookies utilisés par StreamTV">
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface text-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Nom</th>
                <th className="px-3 py-2 font-medium">Finalité</th>
                <th className="px-3 py-2 font-medium">Durée</th>
                <th className="px-3 py-2 font-medium">Type</th>
              </tr>
            </thead>
            <tbody className="text-muted">
              <tr className="border-t border-border-subtle">
                <td className="px-3 py-2 font-mono text-xs text-foreground">
                  streamtv_session
                </td>
                <td className="px-3 py-2">
                  Authentification (JWT httpOnly) — maintenir la session
                </td>
                <td className="px-3 py-2">30 jours</td>
                <td className="px-3 py-2">Essentiel</td>
              </tr>
              <tr className="border-t border-border-subtle">
                <td className="px-3 py-2 font-mono text-xs text-foreground">
                  streamtv_cookie_consent
                </td>
                <td className="px-3 py-2">
                  Mémoriser votre choix sur la bannière cookies (localStorage)
                </td>
                <td className="px-3 py-2">Local</td>
                <td className="px-3 py-2">Essentiel / préférence</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-3">
          Aucun cookie publicitaire, de réseaux sociaux ou d&apos;analytics
          tiers n&apos;est déposé par défaut.
        </p>
      </LegalSection>

      <LegalSection title="3. Base légale">
        <p>
          Les cookies strictement nécessaires (session) ne requièrent pas de
          consentement préalable (exemption directive ePrivacy / CNIL). La
          bannière vous informe et enregistre votre prise de connaissance.
        </p>
      </LegalSection>

      <LegalSection title="4. Gestion">
        <p>
          Vous pouvez supprimer les cookies via les paramètres de votre
          navigateur. La suppression de{" "}
          <code className="rounded bg-surface px-1 text-foreground">
            streamtv_session
          </code>{" "}
          vous déconnecte. Plus d&apos;infos :{" "}
          <Link href="/confidentialite" className="text-primary hover:underline">
            politique de confidentialité
          </Link>
          .
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
