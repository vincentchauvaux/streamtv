import type { Metadata } from "next";
import Link from "next/link";
import { LegalLayout, LegalSection } from "@/components/legal-layout";

export const metadata: Metadata = {
  title: "Politique de confidentialité — StreamTV",
  description: "Politique de confidentialité RGPD de StreamTV",
};

export default function ConfidentialitePage() {
  return (
    <LegalLayout title="Politique de confidentialité" updatedAt="5 août 2026">
      <LegalSection title="1. Responsable du traitement">
        <p>
          Le responsable du traitement des données est l&apos;éditeur de
          l&apos;instance StreamTV (voir{" "}
          <Link href="/mentions-legales" className="text-primary hover:underline">
            mentions légales
          </Link>
          ).
        </p>
      </LegalSection>

      <LegalSection title="2. Données collectées">
        <p>Nous collectons uniquement les données nécessaires au service :</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong className="text-foreground">Compte</strong> : email, mot de
            passe hashé (bcrypt), prénom optionnel ;
          </li>
          <li>
            <strong className="text-foreground">Usage</strong> : playlists
            importées (URLs), chaînes, favoris, historique de lecture, réglages ;
          </li>
          <li>
            <strong className="text-foreground">Technique</strong> : cookie de
            session JWT httpOnly, logs serveur (erreurs, proxy de flux).
          </li>
        </ul>
        <p>
          Aucune donnée de paiement n&apos;est collectée. Aucun tracking
          publicitaire tiers n&apos;est intégré par défaut.
        </p>
      </LegalSection>

      <LegalSection title="3. Finalités et bases légales">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Exécution du contrat (compte, lecture, sync) — art. 6.1.b RGPD ;
          </li>
          <li>
            Intérêt légitime (sécurité, prévention des abus, logs) — art. 6.1.f ;
          </li>
          <li>
            Obligation légale le cas échéant — art. 6.1.c.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="4. Conservation">
        <p>
          Les données du compte sont conservées tant que le compte existe.
          Le cookie de session expire après 30 jours. Les logs techniques
          sont rotés / purgés selon la politique du serveur.
        </p>
      </LegalSection>

      <LegalSection title="5. Destinataires">
        <p>
          Les données restent sur le serveur d&apos;hébergement (OVH, UE).
          Elles ne sont pas vendues. Le proxy de flux peut contacter les
          serveurs des playlists que vous avez choisies (nécessaire à la
          lecture).
        </p>
      </LegalSection>

      <LegalSection title="6. Vos droits (RGPD)">
        <p>
          Vous disposez d&apos;un droit d&apos;accès, de rectification,
          d&apos;effacement, de limitation, de portabilité et d&apos;opposition.
          Pour exercer ces droits : contactez l&apos;éditeur de l&apos;instance
          ou utilisez la suppression de compte si disponible dans les
          paramètres. Vous pouvez aussi saisir la CNIL (
          <a
            href="https://www.cnil.fr"
            className="text-primary hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            cnil.fr
          </a>
          ).
        </p>
      </LegalSection>

      <LegalSection title="7. Cookies">
        <p>
          Détail dans la{" "}
          <Link href="/cookies" className="text-primary hover:underline">
            politique cookies
          </Link>
          .
        </p>
      </LegalSection>

      <LegalSection title="8. Sécurité">
        <p>
          Mots de passe hashés (bcrypt), session JWT en cookie httpOnly /
          Secure en production, HTTPS, en-têtes de sécurité HTTP, limitation
          de débit sur l&apos;authentification et le proxy de flux.
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
