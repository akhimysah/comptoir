import { platform as p } from "@/lib/platform";

export const metadata = { title: "Mentions légales" };

export default function MentionsLegales() {
  return (
    <>
      <h1>Mentions légales</h1>
      <h2>Éditeur</h2>
      <p>{p.name} est édité par {p.company}, {p.legalForm}, dont le siège est situé {p.address}.<br />SIREN / RCS : {p.siren}. TVA intracommunautaire : {p.vat}.<br />Directeur de la publication : {p.director}. Contact : {p.email}.</p>
      <h2>Hébergement</h2>
      <p>{p.host}</p>
      <h2>Boutiques des marchands</h2>
      <p>Les boutiques en ligne créées avec {p.name} sont éditées par leurs marchands, qui sont seuls responsables de leurs produits, de leurs prix et de leurs ventes. Les mentions légales de chaque boutique figurent sur celle-ci.</p>
      <h2>Propriété intellectuelle</h2>
      <p>La marque {p.name}, son logo et le logiciel sont protégés. Toute reproduction sans autorisation est interdite.</p>
    </>
  );
}
