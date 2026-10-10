import { platform as p } from "@/lib/platform";

export const metadata = { title: "Conditions d'utilisation" };

export default function Cgu() {
  return (
    <>
      <h1>Conditions générales d'utilisation</h1>
      <p className="text-sm text-[#616161]">Pour les marchands qui ouvrent une boutique sur {p.name}.</p>

      <h2>1. Objet</h2>
      <p>{p.name}, édité par {p.company}, permet de créer et de gérer une boutique en ligne : catalogue, commandes, paiements, clients, expéditions. Ces conditions encadrent l'utilisation du service par le marchand. En créant un compte, le marchand les accepte.</p>

      <h2>2. Compte et sécurité</h2>
      <ul>
        <li>Le marchand fournit des informations exactes et les tient à jour.</li>
        <li>Il garde ses identifiants confidentiels ; la double authentification est vivement recommandée.</li>
        <li>Il est responsable des actions faites depuis son compte et par les collaborateurs qu'il invite.</li>
      </ul>

      <h2>3. Le marchand, vendeur</h2>
      <p>Le marchand vend en son nom et pour son compte. Il est seul responsable de ses produits (conformité, sécurité, droits), de ses prix, de la TVA, de ses conditions générales de vente, de ses mentions légales, du droit de rétractation de 14 jours de ses clients, des livraisons, du service après-vente et du respect de la loi applicable. {p.name} n'est pas partie aux ventes.</p>

      <h2>4. Paiements</h2>
      <p>Les paiements par carte sont traités par Stripe. Le marchand ouvre un compte Stripe et accepte les conditions de Stripe ; les fonds lui sont versés par Stripe. {p.name} ne détient pas les fonds des clients.</p>

      <h2>5. Prix du service</h2>
      <p>L'ouverture d'une boutique est gratuite. {p.name} perçoit une commission de {p.feePercent} % sur le montant des ventes payées en ligne, prélevée automatiquement lors du paiement. Les frais de Stripe s'y ajoutent. Toute évolution du prix est annoncée au moins 30 jours à l'avance.</p>

      <h2>6. Contenus interdits</h2>
      <p>Sont interdits notamment : les produits illégaux, contrefaits ou dangereux, les contenus haineux, trompeurs ou portant atteinte aux droits d'autrui, la collecte frauduleuse de données et l'usage du service pour envoyer des messages non sollicités.</p>

      <h2>7. Données personnelles</h2>
      <p>Pour les données de ses clients, le marchand est responsable du traitement et {p.name} agit comme sous-traitant, dans les conditions décrites dans la <a href="/legal/confidentialite" className="underline">politique de confidentialité</a>. Le marchand informe ses clients et recueille les consentements nécessaires (newsletter, cookies de mesure d'audience).</p>

      <h2>8. Disponibilité</h2>
      <p>{p.name} met en œuvre les moyens raisonnables pour assurer l'accès au service, sans garantie d'absence d'interruption (maintenance, incident). Les données sont sauvegardées régulièrement.</p>

      <h2>9. Responsabilité</h2>
      <p>La responsabilité de {p.name} est limitée aux dommages directs et prouvés, et plafonnée aux commissions perçues au cours des 12 derniers mois. {p.name} n'est pas responsable des ventes, des produits ni des relations entre le marchand et ses clients.</p>

      <h2>10. Suspension et résiliation</h2>
      <p>Le marchand peut fermer sa boutique à tout moment. En cas de manquement grave à ces conditions, {p.name} peut suspendre la boutique après information du marchand, ou immédiatement en cas d'urgence (fraude, contenu illégal). Le marchand peut exporter ses produits, clients et commandes avant la fermeture.</p>

      <h2>11. Modification des conditions</h2>
      <p>Les conditions peuvent évoluer ; le marchand est prévenu au moins 30 jours avant l'entrée en vigueur d'un changement important.</p>

      <h2>12. Droit applicable</h2>
      <p>Ces conditions sont régies par le droit français. À défaut d'accord amiable, les tribunaux compétents sont ceux du siège de {p.company}. Contact : {p.email}.</p>
    </>
  );
}
