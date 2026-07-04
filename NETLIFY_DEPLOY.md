# Deploiement Netlify

Cette application est prete pour Netlify.

## Reglages Netlify

- Build command: `npm run build`
- Publish directory: `public`
- Functions directory: `netlify/functions`
- Node version: `22`

Ces reglages sont aussi deja declares dans `netlify.toml`.

## Stockage

En local, l'application utilise `data/db.json`.

Sur Netlify, elle utilise Netlify Blobs pour conserver les comptes, familles, listes, invitations et historiques.

## Diagnostic

Apres un deploy, ouvre:

```text
https://TON-SITE.netlify.app/api/health
```

Si `storage` vaut `ok`, l'API et le stockage sont disponibles.

Netlify Blobs doit fonctionner automatiquement dans la Function Netlify moderne, sans token manuel.

Si `/api/health` indique encore une erreur de stockage apres redeploiement, verifie que tu as bien deploye tout le projet, pas seulement le dossier `public`.

## Lancement local

Le fichier `LANCER_APPLICATION_COURSE.bat` continue de fonctionner comme avant.

Pour tester avec Netlify en local, installe la CLI Netlify puis lance:

```bash
npm run netlify:dev
```
