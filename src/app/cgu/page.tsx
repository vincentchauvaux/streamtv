import type { Metadata } from "next";
import Link from "next/link";
import { LegalLayout, LegalSection } from "@/components/legal-layout";

export const metadata: Metadata = {
  title: "Conditions générales d'utilisation — StreamTV",
  description: "CGU de StreamTV",
};

export default function CguPage() {
  return (
    <LegalLayout title="Conditions générales d'utilisation" updatedAt="5 août 2026">
      <LegalSection title="1. Objet">
        <p>
          Les présentes CGU régissent l&apos;accès et l&apos;utilisation de
          StreamTV, lecteur IPTV personnel permettant d&apos;importer et de
          lire des playlists fournies par l&apos;utilisateur.
        </p>
      </LegalSection>

      <LegalSection title="2. Acceptation">
        <p>
          L&apos;inscription et l&apos;utilisation du service impliquent
          l&apos;acceptation pleine et entière des présentes CGU et de la{" "}
          <Link href="/confidentialite" className="text-primary hover:underline">
            politique de confidentialité
          </Link>
          .
        </p>
      </LegalSection>

      <LegalSection title="3. Compte utilisateur">
        <p>
          Vous êtes responsable de la confidentialité de vos identifiants et
          de toute activité réalisée via votre compte. Un mot de passe robuste
          (au moins 8 caractères) est requis.
        </p>
      </LegalSection>

      <LegalSection title="4. Contenu et playlists">
        <p>
          Vous importez uniquement des playlists et flux pour lesquels vous
          disposez des droits nécessaires. StreamTV ne fournit aucun contenu
          audiovisuel. Est interdit notamment :
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>l&apos;utilisation de sources illégales ou piratées ;</li>
          <li>la redistribution commerciale de contenus protégés ;</li>
          <li>
            toute activité portant atteinte aux droits d&apos;auteur, à la
            vie privée ou à la sécurité du service.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="5. Disponibilité">
        <p>
          Le service est fourni « en l&apos;état ». Aucune garantie de
          disponibilité continue n&apos;est donnée. Les flux dépendent de
          sources externes hors de notre contrôle.
        </p>
      </LegalSection>

      <LegalSection title="6. Suspension">
        <p>
          Un compte peut être suspendu ou supprimé en cas de non-respect des
          CGU, d&apos;abus technique (attaque, scraping massif) ou de
          demande légitime des autorités.
        </p>
      </LegalSection>

      <LegalSection title="7. Données personnelles">
        <p>
          Le traitement des données est décrit dans la{" "}
          <Link href="/confidentialite" className="text-primary hover:underline">
            politique de confidentialité
          </Link>
          .
        </p>
      </LegalSection>

      <LegalSection title="8. Modification">
        <p>
          Les CGU peuvent être mises à jour. La date en tête de page fait
          foi. L&apos;usage continu après modification vaut acceptation.
        </p>
      </LegalSection>

      <LegalSection title="9. Droit applicable">
        <p>
          Les présentes CGU sont régies par le droit français. En cas de
          litige, les tribunaux français seront compétents, sous réserve des
          règles impératives de protection du consommateur.
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
