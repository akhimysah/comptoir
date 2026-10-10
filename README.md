# Parnassa Pay

Plateforme e-commerce multi-boutiques, sur le modèle de Shopify : chaque marchand crée son compte et sa boutique, gère son catalogue et ses commandes, personnalise son thème et encaisse par carte avec Stripe Connect.

## Démarrer en local

Prérequis : Node.js 20 ou plus.

```bash
npm install
cp .env.example .env
npm run setup
npm run dev
```

Ensuite, ouvrez http://localhost:3000.

- Boutique de démonstration : http://localhost:3000/s/atelier-argile
- Admin de démonstration : http://localhost:3000/login avec `demo@comptoir.test` / `demo1234`. Ce compte de test est créé par `prisma/seed.ts`, avec 3 boutiques : Atelier Argile, Maison Lin et Thé & Co.
- Code promo de démonstration : `BIENVENUE10`

`npm run db:seed` remet la boutique de démonstration à zéro.

## Ce qu'il y a dedans

| Côté marchand (`/admin`) | Côté client (`/s/<boutique>`) |
|---|---|
| Tableau de bord : ventes sur 30 jours, panier moyen, stock faible | Page d'accueil construite avec le thème |
| Produits : photos, options (taille, couleur…), variantes avec prix, prix barré, stock et référence | Fiches produit avec choix de variante et stock en direct |
| Collections | Pages de collection, tri par prix ou par nom |
| Commandes : filtres, expédition, annulation avec remboursement Stripe | Panier, code promo, livraison offerte au-delà d'un seuil |
| Clients : fiche, historique, note interne | Paiement Stripe Checkout, ou paiement de démonstration |
| Codes promo : pourcentage ou montant, minimum, limite, date de fin | Page de confirmation |
| Éditeur de thème : 4 thèmes prêts, couleurs, polices, arrondis, sections avec aperçu en direct | |
| Réglages : devise, livraison, connexion Stripe | |
| Commandes : actions groupées, création manuelle, chronologie et commentaires internes | |
| Stock modifiable sur place, page Statistiques | |
| Équipe : invitation de collaborateurs par lien (Paramètres → Utilisateurs) | |
| Pages de contenu et blog, avec une mise en forme simple | Pages (À propos, CGV…), blog, liens dans le pied de page |
| Segments clients (commandes, montant dépensé, dernier achat, étiquettes, produit acheté, pays…) et étiquettes | Campagnes e-mail ciblées sur un segment |
| Expédition avec suivi de colis (Colissimo, Chronopost, Mondial Relay, DPD, GLS, UPS, DHL, FedEx…) | Lien « Suivre mon colis » dans l'e-mail et le compte client |
| Factures avec lien de paiement (commande créée dans l'admin, remise manuelle) | Page de paiement publique, carte via Stripe |
| Coût par article, profit et marge ; marge brute dans les statistiques ; valeur du stock | Bons de commande fournisseurs : réception partielle ou totale qui met à jour le stock, envoi au fournisseur, impression |
| Filtres de la boutique : disponibilité, prix, promotions, catégorie, tailles, couleurs et autres options, avis | Filtres instantanés, partageables par lien, sur mobile aussi |
| Alertes de retour en stock (« Prévenez-moi ») | E-mail automatique au réassort (stock, bon de commande, retour) |
| Remises avancées : sur certaines collections ou certains produits, « Achetez X, obtenez Y », programmées, une fois par client | Codes promo et remises automatiques |
| Messagerie (comme Shopify Inbox) : bulle de discussion sur la boutique | Réponses depuis l'admin, aussi envoyées par e-mail |
| Données personnalisées (métachamps) : matière, dimensions, entretien… | Tableau « Caractéristiques » sur la fiche produit, champs utilisables comme filtres |
| Préférences : boutique protégée par mot de passe pendant la préparation, Google Analytics 4 et Pixel Meta | Bandeau cookies (RGPD), achats mesurés |
| Retrait en boutique (gratuit, sans adresse) | « Prête pour le retrait » avec e-mail au client, puis « Récupérée » |
| Rapports : ventes par jour, par produit, par canal, TVA collectée, meilleurs clients | Export CSV pour Excel et la comptabilité |
| Double authentification (application, QR code, codes de secours) | Code demandé après le mot de passe, codes à usage unique |
| Produits complémentaires et « Souvent achetés ensemble » (choisis ou appris des commandes) | « Complétez votre commande » dans le panier, ajout en un clic |
| Modification des commandes non payées (quantités, ajouts, retraits, livraison) | Commande payée : remboursement ou commande complémentaire préremplie |
| Favoris (liste d'envies) : cœur sur chaque produit, page « Mes favoris » | Gardés sur l'appareil ou synchronisés avec le compte client |
| Recherche prédictive (produits, collections, pages pendant la saisie) | Navigation au clavier, sans accents ni majuscules |
| Photo par variante (couleur…) | La photo change au choix de la variante, suivie au panier et dans la commande |
| E-mails clients personnalisables (objet, titre, message, variables) | Aperçu en direct, couleurs de la boutique |
| Import d'un export Shopify (produits, variantes, stock, photos) | Migration depuis Shopify en un fichier |
| Navigation : menus avec sous-menus déroulants | Redirections d'URL automatiques quand une adresse change |
| Référencement : titre et description Google, aperçu du résultat | Sitemap par boutique (`/s/<boutique>/sitemap.xml`), robots.txt |
| Cartes cadeaux : création, envoi par e-mail, suivi du solde | Paiement avec carte cadeau ; achat de cartes cadeaux dans la boutique |
| Remboursements partiels, retours en libre-service (demande client, acceptation, réception, remboursement), remise en stock | Recherche, « Vous aimerez aussi » |
| Remises automatiques et livraison offerte | Comptes clients (connexion par code e-mail, historique) |
| TVA, mentions légales, factures et bons de préparation | Facture téléchargeable après l'achat |
| Autorisations par collaborateur, journal d'activité | Précommandes, lots de produits |
| Marketing : newsletter et campagnes e-mail | Inscription à la newsletter, désabonnement en un clic |
| Flux Google Shopping et Facebook / Instagram | Prix affichés dans la devise du visiteur (paiement dans la devise de la boutique) |
| Point de vente (caisse, espèces ou carte, ticket 80 mm) | Programme de fidélité (points, bons personnels) |
| Abonnements (renouvellements, pause, résiliation) | Abonnement au choix sur les fiches produit |
| Automatisations : relance des paniers, demande d'avis | |

## Plusieurs boutiques et rapport quotidien

Un même compte peut gérer plusieurs boutiques : menu en haut à droite → **Créer une boutique**, et on passe de l'une à l'autre depuis ce même menu. La page **Toutes les boutiques** regroupe le chiffre d'affaires et les commandes (aujourd'hui, 7, 30 ou 90 jours), boutique par boutique et au total, avec le CA jour par jour et les dernières commandes de toutes les boutiques.

Les tâches planifiées (`vercel.json`) : rapport quotidien, renouvellement des abonnements (`/api/cron/subscriptions`) et automatisations (`/api/cron/automations`), toutes protégées par `CRON_SECRET`.

Le **rapport quotidien** (CA et commandes de la veille, produits les plus vendus, commandes à expédier) part chaque matin par e-mail. En ligne sur Vercel, `vercel.json` déclenche `/api/cron/daily-report` tous les jours à 6 h UTC : définissez `CRON_SECRET` dans les variables Vercel. Ailleurs, appelez cette adresse chaque matin avec l'en-tête `Authorization: Bearer <CRON_SECRET>`. Le bouton « M'envoyer le rapport d'hier » l'envoie tout de suite.

## Travailler à plusieurs sur une boutique

Dans **Paramètres → Utilisateurs et autorisations**, le propriétaire saisit l'e-mail d'un collaborateur et obtient un lien d'invitation (valable 7 jours) à lui envoyer. Le collaborateur crée son compte depuis ce lien et accède à l'admin de la boutique. Les paramètres, les paiements et la gestion de l'équipe restent réservés au propriétaire.

## E-mails

Parnassa Pay envoie automatiquement : la confirmation de commande au client, l'alerte de nouvelle commande au propriétaire, l'avis d'expédition, les invitations d'équipe et les liens « mot de passe oublié ».

Sans configuration, rien ne part : les e-mails sont enregistrés et visibles dans **Paramètres → Notifications**. En local, le lien « mot de passe oublié » s'affiche aussi dans le terminal. Pour les envoyer vraiment, créez un compte sur https://resend.com, puis renseignez `RESEND_API_KEY` et `MAIL_FROM` dans `.env`. L'adresse d'envoi doit appartenir à un domaine vérifié chez Resend.

## Activer Stripe (paiement par carte)

Sans clé Stripe, tout fonctionne en paiement de démonstration : les commandes sont validées sans paiement.

1. Créez un compte sur https://dashboard.stripe.com et restez en **mode test**.
2. Activez **Connect** dans le tableau de bord Stripe (Connect → Get started, plateforme de type « marketplace »).
3. Copiez la clé secrète de test (`sk_test_…`) dans `.env`, à la ligne `STRIPE_SECRET_KEY`.
4. Redémarrez `npm run dev`.
5. Dans l'admin, ouvrez **Réglages → Connecter Stripe** et suivez l'inscription de test.
6. Passez une commande avec la carte de test `4242 4242 4242 4242`, n'importe quelle date future et n'importe quel CVC.

Chaque vente est versée sur le compte Stripe du marchand. La plateforme prélève la commission `PLATFORM_FEE_PERCENT` (2 % par défaut).

**Webhook, optionnel en local.** La page de confirmation vérifie déjà le paiement auprès de Stripe. Pour recevoir aussi les événements, installez la CLI Stripe, lancez la commande ci-dessous, puis copiez le secret `whsec_…` affiché dans `STRIPE_WEBHOOK_SECRET`.

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

## Mettre en ligne (Vercel, gratuit)

L'offre gratuite de Vercel (Hobby) est réservée aux projets non commerciaux. Pour une boutique qui encaisse de l'argent, passez à l'offre Pro.

1. Sur https://vercel.com, créez un compte avec GitHub, puis **Add New → Project** et importez le dépôt `comptoir`.
2. Dans le projet, onglet **Storage** :
   - **Create → Neon (Postgres)**, relié au projet. Cela crée `DATABASE_URL` et `DATABASE_URL_UNPOOLED`.
   - **Create → Blob**, relié au projet. Cela crée `BLOB_READ_WRITE_TOKEN`.
3. Dans **Settings → Environment Variables**, ajoutez `APP_URL` (l'adresse du site, par exemple `https://comptoir.vercel.app`) et `PLATFORM_FEE_PERCENT` (`2`).
4. Dans `prisma/schema.prisma`, passez `provider` à `"postgresql"`. Dans Vercel, réglez la commande de build sur `prisma generate && prisma db push --skip-generate && next build`, puis relancez un déploiement.
5. Facultatif, la boutique de démonstration : lancez la commande suivante sur votre Mac, avec le mot de passe de votre choix.

   ```bash
   npx vercel env pull .env && SEED_DEMO_PASSWORD="un-mot-de-passe-solide" npm run db:seed
   ```

Pour Stripe en ligne, ajoutez `STRIPE_SECRET_KEY` et `STRIPE_WEBHOOK_SECRET` dans les variables Vercel. Créez le webhook dans Stripe vers `https://votre-site/api/stripe/webhook`, avec les événements `checkout.session.completed` et `account.updated`, en cochant les comptes connectés.

## Pas encore fait

- E-mails : confirmation de commande au client, alerte de nouvelle commande au marchand. À brancher avec Resend ou Postmark.
- Noms de domaine personnalisés par boutique. Pour l'instant, chaque boutique vit à l'adresse `/s/<boutique>`.
- Mot de passe oublié, et plusieurs collaborateurs par boutique.
- Calcul des taxes et tarifs de livraison par pays ou par poids.
- Abonnement payant des marchands à la plateforme. Aujourd'hui, la plateforme se rémunère uniquement par la commission.

## Organisation du code

```
prisma/schema.prisma         modèle de données
prisma/seed.ts               boutique de démonstration
src/lib/                     auth, prix et paniers, commandes, Stripe, thème
src/app/(auth)/              inscription et connexion
src/app/admin/               admin du marchand
src/app/s/[slug]/            vitrine publique de chaque boutique
src/app/api/                 panier, paiement, Stripe, envoi d'images
src/components/store/        composants de la vitrine (sections, fiches, panier)
src/components/admin/        formulaires de l'admin (produit, thème…)
```
