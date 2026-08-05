import type { Metadata } from "next";
import { LegalLayout, LegalSection } from "@/components/legal-layout";

export const metadata: Metadata = {
  title: "Mentions légales — StreamTV",
  description: "Mentions légales de StreamTV",
};

export default function MentionsLegalesPage() {
  return (
    <LegalLayout title="Mentions légales" updatedAt="5 août 2026">
      <LegalSection title="Éditeur">
        <p>
          Le site StreamTV est un lecteur IPTV personnel (application web) édité
          à titre privé. Aucun contenu audiovisuel n&apos;est hébergé ni fourni
          par StreamTV.
        </p>
        <p>
          Contact : via le compte utilisateur créé sur le service, ou via le
          propriétaire du serveur qui héberge l&apos;instance.
        </p>
      </LegalSection>

      <LegalSection title="Hébergement">
        <p>
          Cette instance est hébergée sur un VPS fourni par OVH SAS (2 rue
          Kellermann, 59100 Roubaix, France). Hostname de l&apos;instance :{" "}
          <code className="rounded bg-surface px-1.5 py-0.5 text-sm text-foreground">
            vps-e09ed6db.vps.ovh.net
          </code>
          .
        </p>
      </LegalSection>

      <LegalSection title="Nature du service">
        <p>
          StreamTV est un <strong className="text-foreground">outil technique</strong>{" "}
          permettant à l&apos;utilisateur d&apos;importer ses propres playlists M3U/M3U8
          et guides EPG (XMLTV), de les consulter et de lire les flux associés
          via un lecteur intégré.
        </p>
        <p>
          StreamTV <strong className="text-foreground">ne diffuse, ne revend
          et n&apos;héberge aucun contenu TV ou média</strong>. L&apos;utilisateur
          est seul responsable des sources qu&apos;il importe et de la légalité
          de leur utilisation dans son pays.
        </p>
      </LegalSection>

      <LegalSection title="Propriété intellectuelle">
        <p>
          L&apos;interface, le code et la marque StreamTV sont protégés. Les
          logos, noms de chaînes et contenus des flux restent la propriété de
          leurs ayants droit respectifs.
        </p>
      </LegalSection>

      <LegalSection title="Responsabilité">
        <p>
          L&apos;éditeur ne peut être tenu responsable des contenus accessibles
          via des playlists tierces, des interruptions de flux, ni de
          l&apos;usage illicite du service par un utilisateur.
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
