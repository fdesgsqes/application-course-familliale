# Application Course

Application web de liste de courses familiale, pensee pour organiser les achats d'un foyer de maniere simple, partagee et securisee.

## Description

Application Course permet de creer une famille, d'inviter des membres et de gerer une liste de courses commune en temps reel. Chaque membre peut ajouter des produits, preparer les prochaines courses, definir un budget, choisir un responsable et retrouver les produits habituels.

L'application inclut aussi un mode magasin qui verrouille la liste pendant les achats, permet de cocher les produits achetes, de scanner des codes-barres et d'archiver la course une fois terminee. Les anciennes courses peuvent ensuite etre consultees ou recopiees pour gagner du temps.

## Fonctionnalites

- Creation de compte et connexion securisee
- Gestion d'une famille et de ses membres
- Invitations par lien partageable
- Ajout de membres invites avec acces prive
- Liste de courses commune avec categories automatiques
- Gestion des quantites, prix, notes et budget estime
- Produits habituels pour retrouver rapidement les articles frequents
- Detection des doublons dans la liste
- Scan de codes-barres depuis l'interface
- Mode magasin avec liste verrouillee pendant les courses
- Historique des courses terminees
- Recopie d'une ancienne liste
- Export et impression de la liste en PDF
- Stockage local en developpement avec `data/db.json`
- Stockage Netlify Blobs en production

## Stack technique

- Node.js
- Serveur HTTP natif
- JavaScript vanilla cote client
- HTML / CSS
- Netlify Functions
- Netlify Blobs pour le stockage en production

## Installation locale

```bash
npm install
npm start
```

L'application est ensuite disponible sur:

```text
http://localhost:3000
```

Un fichier Windows est aussi fourni pour lancer l'application facilement:

```text
LANCER_APPLICATION_COURSE.bat
```

## Deploiement Netlify

Le projet est pret pour Netlify avec les reglages suivants:

- Build command: `npm run build`
- Publish directory: `public`
- Functions directory: `netlify/functions`
- Node version: `22`

Ces reglages sont deja declares dans `netlify.toml`.

Apres le deploiement, l'etat de l'API peut etre verifie avec:

```text
https://TON-SITE.netlify.app/api/health
```

## Structure du projet

```text
.
+-- data/
|   +-- db.json
+-- netlify/
|   +-- functions/
+-- public/
|   +-- app.js
|   +-- index.html
|   +-- styles.css
+-- server.js
+-- package.json
+-- netlify.toml
+-- NETLIFY_DEPLOY.md
```

## Objectif

Ce projet a ete cree pour simplifier l'organisation des courses en famille: une seule liste partagee, des invitations securisees, un suivi clair du budget et un mode magasin pratique pour passer de la preparation a l'achat sans perdre d'informations.

