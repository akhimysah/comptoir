import { platform as p } from "@/lib/platform";

export const metadata = { title: "Politique de confidentialité" };

export default function Confidentialite() {
  return (
    <>
      <h1>Politique de confidentialité</h1>
      <p>Cette page explique quelles données {p.name} traite, pourquoi, combien de temps et quels sont vos droits (Règlement général sur la protection des données, RGPD).</p>

      <h2>1. Qui est responsable ?</h2>
      <ul>
        <li><b>Pour les comptes marchands</b> (personnes qui ouvrent une boutique) : {p.company} est responsable du traitement.</li>
        <li><b>Pour les clients des boutiques</b> : chaque marchand est responsable des données de ses clients ; {p.name} les traite pour son compte, comme sous-traitant.</li>
      </ul>

      <h2>2. Données traitées et finalités</h2>
      <ul>
        <li><b>Compte marchand</b> : nom, e-mail, mot de passe (stocké chiffré, jamais en clair), réglages de double authentification, journal d'activité. Finalité : fournir le service et le sécuriser (exécution du contrat).</li>
        <li><b>Boutique</b> : produits, commandes, clients, échanges de la messagerie. Finalité : faire fonctionner la boutique (exécution du contrat).</li>
        <li><b>Clients des boutiques</b> : nom, e-mail, adresse de livraison, téléphone, commandes, avis, favoris, messages. Finalité : traiter les commandes et le service client pour le marchand.</li>
        <li><b>Newsletter</b> : e-mail des clients qui l'ont accepté, avec un lien de désinscription dans chaque envoi (consentement).</li>
        <li><b>Sécurité</b> : adresses IP, de façon temporaire, pour limiter les tentatives de connexion et les abus (intérêt légitime).</li>
      </ul>
      <p>Les paiements par carte sont traités directement par Stripe : {p.name} ne voit ni ne stocke les numéros de carte.</p>

      <h2>3. Cookies</h2>
      <ul>
        <li>Cookies nécessaires (pas de consentement requis) : connexion à l'admin et au compte client, accès à une boutique protégée, devise choisie.</li>
        <li>Panier, favoris et choix sur les cookies sont gardés dans votre navigateur.</li>
        <li>Mesure d'audience (Google Analytics, Pixel Meta) : seulement si le marchand l'active <b>et</b> si vous l'acceptez dans le bandeau. Vous pouvez changer d'avis via « Gérer les cookies » en bas de la boutique.</li>
      </ul>

      <h2>4. Destinataires et sous-traitants</h2>
      <ul>
        <li>Stripe (paiements), Resend (envoi des e-mails), {p.host} (hébergement).</li>
        <li>Pour les clients d'une boutique : le marchand concerné.</li>
      </ul>
      <p>Certains prestataires peuvent traiter des données hors de l'Union européenne, avec les garanties prévues par le RGPD (clauses contractuelles types).</p>

      <h2>5. Durées de conservation</h2>
      <ul>
        <li>Compte marchand : pendant la durée du contrat, puis 3 ans.</li>
        <li>Commandes et factures : 10 ans (obligation comptable).</li>
        <li>Clients prospects sans commande : 3 ans après le dernier contact.</li>
        <li>Données de sécurité (IP) : quelques heures à quelques jours.</li>
      </ul>

      <h2>6. Vos droits</h2>
      <p>Vous pouvez demander l'accès, la rectification, l'effacement, la limitation, la portabilité de vos données et vous opposer à leur traitement. Clients d'une boutique : adressez-vous d'abord au marchand. Pour toute demande : {p.email}. Vous pouvez aussi saisir la CNIL (www.cnil.fr).</p>

      <h2>7. Sécurité</h2>
      <p>Mots de passe chiffrés, double authentification, connexions limitées en cas d'abus, accès des collaborateurs selon leurs droits, sauvegardes régulières.</p>
    </>
  );
}
