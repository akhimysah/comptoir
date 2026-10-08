# Comptoir

**Démo en ligne : https://akhimysah.github.io/comptoir/** (version de démonstration : les données restent dans le navigateur du visiteur, sans paiement réel).

Plateforme e-commerce multi-boutiques, sur le modèle de Shopify : chaque marchand crée son compte et sa boutique, gère son catalogue et ses commandes, personnalise son thème et encaisse par carte avec Stripe Connect.

## Démarrer en local

Prérequis : Node.js 20 ou plus, et le projet relié à Vercel (voir « Mettre en ligne »), car la base de données est chez Neon.

```bash
npm install
npx vercel env pull .env
npm run setup
npm run dev
```

`vercel env pull` copie dans `.env` les URL de la base et la clé du stockage d'images. Ajoutez ensuite `APP_URL="http://localhost:3000"` dans ce fichier.

Ensuite, ouvrez http://localhost:3000.

- Boutique de démonstration : http://localhost:3000/s/atelier-argile
- Admin de démonstration : http://localhost:3000/login avec `demo@comptoir.test` / `demo1234`. Ce compte de test est créé par `prisma/seed.ts`.
- Code promo de démonstration : `BIENVENUE10`

`npm run db:seed` remet la boutique de démonstration à zéro.

## Ce qu'il y a dedans

| Côté marchand (`/admin`) | Côté client (`/s/<boutique>`) |
|---|---|
| Tableau de bord : ventes sur 30 jours, panier moyen, stock faible | Page d'accueil construite avec le thème |
| Produits : photos, options (taille, couleur…), variantes avec prix, prix barré, stock et référence | Fiches produit avec choix de variante et stock en direct |
| Collections | Pages de collection, tri par prix ou par nom |
| Commandes : filtres, expédition, annulation avec remboursement Stripe | Panier, code promo, livraison offerte au-delà d'un seuil |
| Clients et total dépensé | Paiement Stripe Checkout, ou paiement de démonstration |
| Codes promo : pourcentage ou montant, minimum, limite, date de fin | Page de confirmation |
| Éditeur de thème : 4 thèmes prêts, couleurs, polices, arrondis, sections avec aperçu en direct | |
| Réglages : devise, livraison, connexion Stripe | |

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
4. Relancez un déploiement. Le build crée lui-même les tables (`prisma db push`).
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
