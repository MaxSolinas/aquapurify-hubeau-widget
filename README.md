# Aqua Purify – Hub'Eau Widget

Widget autonome pour interroger l’API Hub’Eau (France) depuis le site Aqua Purify et afficher les principaux paramètres (ex. dureté TH 1532, nitrates 1340, conductivité 1003).

## Fonctionnement
- **Front**: composant JS Vanilla (aucune dépendance) qui :
  - saisie d’un **code postal** → liste déroulante des **communes**
  - requête des **résultats** pour la commune (codes paramètre configurables)
- **Back**: fonction serverless (Vercel par défaut) qui :
  - **met en cache** les réponses (TTL configurable)
  - **normalise** la forme de la réponse indépendamment des évolutions de Hub’Eau
  - permet d’**injecter un mapping local** (ex. CP→INSEE) et des correctifs métier

## Déploiement rapide (Vercel)
1. Créez le projet GitHub et connectez-le à Vercel.
2. Déployez.
3. Définissez les variables d’env. côté Vercel :
   - `HUBEAU_BASE=https://hubeau.eaufrance.fr`
   - `HUBEAU_PATH_COMMUNES=/api/v1/communes` (à ajuster vers l’endpoint valide)
   - `HUBEAU_PATH_RESULTATS=/api/v1/qualite/eau_potable/resultats` (à ajuster)
   - `APW_CACHE_TTL_MS=86400000`
   - `APW_SIZE=25`

## Intégration sur le site

```html
<link rel="stylesheet" href="/static/ap-widget.css" />
<div id="ap-water-widget"></div>
<script>window.APW_CONFIG={endpoint:'/api/hubeau',defaultParamIds:['1532','1340','1003']};</script>
<script src="/static/ap-widget.js" defer></script>
```

## Sécurité & conformité
- Utilisez un **proxy** pour éviter d’exposer des clés, gérer le CORS et fixer des quotas.
- Ajoutez un **rate-limit** (IP) si l’usage public est important.
- Mentionnez la **source des données** (Hub’Eau) dans l’interface.
- Respectez les CGU de Hub’Eau et les obligations de citation.

## Tests
- Ajoutez des tests d’API (ex. Jest) pour valider la normalisation du schéma.

## Licence
MIT
