# Changelog

## 1.8.0 — 2026-08-20


### ✨ Nouveautés

- detail par media des scans + saison mixte terminee + corrections UI ([b93655b](https://github.com/remi-deher/watchdeck/commit/b93655bc2105ce23c97bc51278d764524cee07fc))
## 1.7.0 — 2026-08-20


### test

- couvre scan_vf_upgrades et list_vf_upgrades ([78ab78e](https://github.com/remi-deher/watchdeck/commit/78ab78e3a9e3c60a507b710b66605acaf3f9ea77))

### ✨ Nouveautés

- historique des scans + backoff visible sur les fiches media ([50424e4](https://github.com/remi-deher/watchdeck/commit/50424e41a7d2d561d4ca22eca5187645aa891729))

### 🔧 Maintenance

- v1.7.0 (#133) ([851cb28](https://github.com/remi-deher/watchdeck/commit/851cb28b6c4d815078fe5858ae453b7c53863c22))
## 1.6.0 — 2026-08-20


### ✨ Nouveautés

- backoff progressif sur les recherches sans resultat ([9a8b571](https://github.com/remi-deher/watchdeck/commit/9a8b57150f3b4fff9ae3380d7bec2f5630c18028))

### 🔧 Maintenance

- v1.6.0 (#129) ([0cc5a1b](https://github.com/remi-deher/watchdeck/commit/0cc5a1b40de43d17cbdc9ea8274b67657915fa21))
## 1.5.0 — 2026-08-20


### ✨ Nouveautés

- priorise le scan selon le statut de diffusion des series ([daf97bc](https://github.com/remi-deher/watchdeck/commit/daf97bc7b40395c6c15b0cf1a884c688b2fc3f94))

### 🔧 Maintenance

- v1.5.0 (#125) ([28458bf](https://github.com/remi-deher/watchdeck/commit/28458bf588b8e46b05bf0c7518c63d899052099e))
## 1.4.4 — 2026-08-20


### test

- couvre _sonarr_season_tasks et chemins de rejet _search_task ([85b054f](https://github.com/remi-deher/watchdeck/commit/85b054f1f648a08551d877250a512cd9620c9bbf))

### 🎨 Style

- ruff format ([64e0b07](https://github.com/remi-deher/watchdeck/commit/64e0b07719f950644ac1ad542e10a979d5719a06))

### 🐛 Corrections

- améliore la détection et la couverture des releases VF/MULTI ([5c9eeea](https://github.com/remi-deher/watchdeck/commit/5c9eeea2c3d024993ec48716826a90c5d2ff9079))
- supprime variable total_rej non utilisée ([8d60ce4](https://github.com/remi-deher/watchdeck/commit/8d60ce49ec01996f9dbd614e75f9c7e1e9983529))

### 🔧 Maintenance

- v1.4.4 (#121) ([bd25f83](https://github.com/remi-deher/watchdeck/commit/bd25f83861f8fd281eddedb5c4abcaa0ad55dc78))
## 1.4.3 — 2026-08-20


### ♻️ Refactoring

- passe les reglages en lignes plutot qu'en cartes ([bac981d](https://github.com/remi-deher/watchdeck/commit/bac981debf0798e3bd2c5b6a2209e4070f9732a3))

### 🎨 Style

- format release marker tests ([20375a5](https://github.com/remi-deher/watchdeck/commit/20375a583ac05736cb39aa35f7efbc511c9468fb))

### 🐛 Corrections

- trust explicit release language markers ([211f7a7](https://github.com/remi-deher/watchdeck/commit/211f7a7358ff8835ef1bd889eb39fec4f07c0dd6))

### 🔧 Maintenance

- v1.4.3 (#116) ([de01541](https://github.com/remi-deher/watchdeck/commit/de01541f481b6dfdc05af30d6b6f648a632191c2))
## 1.4.2 — 2026-08-20


### 🐛 Corrections

- corrige la version affichee par l'image promue ([7aed84b](https://github.com/remi-deher/watchdeck/commit/7aed84baea3ff7757528cf28a9d12b54f3b86594))

### 🔧 Maintenance

- v1.4.2 (#112) ([0aa765f](https://github.com/remi-deher/watchdeck/commit/0aa765fbafb99ac71c91e579226a59d3dac63d4e))
## 1.4.1 — 2026-08-20


### test

- execute la suite sur PostgreSQL, comme la production ([7086a73](https://github.com/remi-deher/watchdeck/commit/7086a73d1d7191445da52588b1202f2e6bf8dfb5))
- verifie que chaque endpoint refuse un appelant anonyme ([0a3f64d](https://github.com/remi-deher/watchdeck/commit/0a3f64d0960540b19ab746d64f497b32d962f25d))
- supprime les avertissements, verrouille la couverture et couvre l'anti-force-brute ([a3c477e](https://github.com/remi-deher/watchdeck/commit/a3c477ee7048432e382264adc826a29bb1c1d3a3))
- couvre les protections des favicons et la selection des pistes Plex ([b804363](https://github.com/remi-deher/watchdeck/commit/b80436351b75aa81c0b202a92da383996291c550))
- non-regression des debordements responsive signales ([d9ad3a4](https://github.com/remi-deher/watchdeck/commit/d9ad3a4222dc3bfd78ad0e20951c5630d174f726))

### 🐛 Corrections

- ajoute l'en-tete de version manquant dans le template ([14f6ef6](https://github.com/remi-deher/watchdeck/commit/14f6ef657e61889929c8745747949d6f7f15b2f7))
- restaure les tests d'alignement ecrases par erreur ([18f9b21](https://github.com/remi-deher/watchdeck/commit/18f9b21c97ea6624824d6ec95624d9ff6a8aca0f))

### 👷 CI/CD

- supprime les branches release/* et les builds d'image sans objet ([bc810e2](https://github.com/remi-deher/watchdeck/commit/bc810e2091b6b25d6c34909b4cef4b2053af8bb9))
- promeut l'image testee au lieu d'en reconstruire une pour la production ([e98a23f](https://github.com/remi-deher/watchdeck/commit/e98a23f44d47c6f572d65dbb8d08476115db0f2f))
- detecte les secrets committes par accident (gitleaks) ([643fe7d](https://github.com/remi-deher/watchdeck/commit/643fe7dc972868836a6faee92cd982e103e71f15))

### 🔧 Maintenance

- v1.4.1 (#107) ([7e80c73](https://github.com/remi-deher/watchdeck/commit/7e80c736bbbea74de13f6f0268ab2d9591838aa7))
## 1.4.0 — 2026-08-19


### ✨ Nouveautés

- add interactive expandable playback timeline with segment log, ticks and ratios ([70fcee3](https://github.com/remi-deher/watchdeck/commit/70fcee313d524e9f4a1cc45422703860bd29ffe8))
- synchronize release search and grab bidirectionally with vf upgrades ([81200ee](https://github.com/remi-deher/watchdeck/commit/81200eedb808bd57e29b4976cc95122917bc9e08))
- alignement personnalisable des flux Plex par média, saison et épisode pour un ou plusieurs utilisateurs ([436d6da](https://github.com/remi-deher/watchdeck/commit/436d6da5b09aee8f9402f9da0ca32254da952380))

### 🎨 Style

- fix ruff formatting in stream aligner and tests ([5170fba](https://github.com/remi-deher/watchdeck/commit/5170fbacd9b3a2ce2c57de29623e82d3b65236f2))

### 🐛 Corrections

- resolve correct library and request detail paths in hero banner ([49b9f94](https://github.com/remi-deher/watchdeck/commit/49b9f943d85cee8dd0159900a59bdaa9de51380f))
- corrige le chevauchement des labels du graphique et le badge notifications en responsive tablette ([cf27a05](https://github.com/remi-deher/watchdeck/commit/cf27a05adb333148847aea95681f479069043f41))
- remove hardcoded past date in websocket sync test to avoid stale-session sweep ([8b3bc2a](https://github.com/remi-deher/watchdeck/commit/8b3bc2ad1285e4adeac008f8689f878fccbfe7c7))
- recherche interactive par saison quand la série entière est ciblée ([f2e386c](https://github.com/remi-deher/watchdeck/commit/f2e386c1d12be0a964460b292105f087ead84a56))
- graphique d'activité défilable horizontalement sur mobile ([e5dd4e5](https://github.com/remi-deher/watchdeck/commit/e5dd4e51b946276f4a95a7fe2cac7f2b54de88fc))
- commit la session avant pg_restore pour éviter un auto-deadlock ([a9f1c7e](https://github.com/remi-deher/watchdeck/commit/a9f1c7e71ee4a19b31d58c1e8539ebbe07285306))
- force un miroir apt fiable avant l'installation Playwright ([5a82f65](https://github.com/remi-deher/watchdeck/commit/5a82f65bb34c0dcba496648170407cbdac588301))

### 🔧 Maintenance

- sync main into dev ([68dd742](https://github.com/remi-deher/watchdeck/commit/68dd742e51d4c17b7b90afa93e456cf6dfff142f))
- sync main into dev ([a1b6123](https://github.com/remi-deher/watchdeck/commit/a1b612325794b8a50ef5d618d98c35452467ce41))
- sync main into dev ([24e4d2d](https://github.com/remi-deher/watchdeck/commit/24e4d2da28672aa1abf87969d9fc90577d158046))
- sync main into dev ([e585736](https://github.com/remi-deher/watchdeck/commit/e585736d30a4dfb4d4f46e5b855ae15dd61444a3))
- sync main into dev ([364e8e6](https://github.com/remi-deher/watchdeck/commit/364e8e692a7cd87de23bc4774c37b5b40cf7825b))
- sync main into dev ([42fb664](https://github.com/remi-deher/watchdeck/commit/42fb664c83b04879e7aa61c2a54cae03fb03e1f8))
- sync main into dev ([fa2c85a](https://github.com/remi-deher/watchdeck/commit/fa2c85af0cf3bbaf93fef85ef136422d2900f550))
- sync main into dev ([2888b2d](https://github.com/remi-deher/watchdeck/commit/2888b2d6cbc202cc117bec95340c934e80a9a977))
- sync main into dev ([e30ddf4](https://github.com/remi-deher/watchdeck/commit/e30ddf4d4323094809fe9a439537c49cd9a7da0f))
- sync main into dev ([8a31ed4](https://github.com/remi-deher/watchdeck/commit/8a31ed409aa468f8f00faa611660b829653765a3))
- nettoie les artefacts de build Vue orphelins ([8132951](https://github.com/remi-deher/watchdeck/commit/8132951a04d92323b6315422875386dbbde89399))
- v1.4.0 (#102) ([bef640c](https://github.com/remi-deher/watchdeck/commit/bef640c0528ce5935a8f6995d1696526a829269d))
## 1.3.5 — 2026-08-19


### 🔧 Maintenance

- v1.3.5 (#98) ([e3f047a](https://github.com/remi-deher/watchdeck/commit/e3f047a40816aef4641d2d9aa59d7c461102dd33))
## 1.3.4 — 2026-08-18


### 🔧 Maintenance

- v1.3.4 (#93) ([64d2778](https://github.com/remi-deher/watchdeck/commit/64d277856f54c8b5891adebf62add1bcb5c79f33))
## 1.3.3 — 2026-08-18


### 🔧 Maintenance

- v1.3.3 (#89) ([cf710c9](https://github.com/remi-deher/watchdeck/commit/cf710c9debda4ca7c608885021c90f5c10ba8ff4))
## 1.3.2 — 2026-08-18


### 🔧 Maintenance

- v1.3.2 (#85) ([6e51310](https://github.com/remi-deher/watchdeck/commit/6e513108853446aeb6431dd3bf2c39f7fe2e6fd6))
## 1.3.1 — 2026-08-18


### ✨ Nouveautés

- add interactive expandable playback timeline with segment log, ticks and ratios (#78) ([e9d7ca0](https://github.com/remi-deher/watchdeck/commit/e9d7ca05830fcfcbb731e76eaa9af5a68ec56451))

### 👷 CI/CD

- rend les promotions dev->test et test->main manuelles (workflow_dispatch) ([8501574](https://github.com/remi-deher/watchdeck/commit/85015748d77c9917ab460866c32bfc293be79a8c))

### 🔧 Maintenance

- v1.3.1 (#80) ([4cddedd](https://github.com/remi-deher/watchdeck/commit/4cddedd26cde82fb3f278bde471c06211c462b4b))
## 1.3.0 — 2026-08-17


### ✨ Nouveautés

- add playback session segments tracking and interactive timeline ([e413d9a](https://github.com/remi-deher/watchdeck/commit/e413d9a8f178346efdc9589a25572ec1d61ee98c))

### 🔧 Maintenance

- v1.3.0 (#75) ([8ab5bc1](https://github.com/remi-deher/watchdeck/commit/8ab5bc1034b8652e4f74a8d3cd3afab942ecc99b))
## 1.2.1 — 2026-08-17


### 👷 CI/CD

- arrete de builder une image Docker sur chaque commit dev ([f73a397](https://github.com/remi-deher/watchdeck/commit/f73a3973c8fd7a9fb24994d7e83b886f85df8e71))

### 🔧 Maintenance

- v1.2.1 (#69) ([f6746e9](https://github.com/remi-deher/watchdeck/commit/f6746e9a522e8a1e1fbd219ac10abaac6cbd154f))
## 1.2.0 — 2026-08-17


### ✨ Nouveautés

- améliore la page Version & mises à jour ([df82466](https://github.com/remi-deher/watchdeck/commit/df82466bfbe06d435d78d0da602b01e3db025259))

### 🔧 Maintenance

- v1.2.0 (#65) ([d3dfd55](https://github.com/remi-deher/watchdeck/commit/d3dfd559598a5d9eef6975175a9e2a6b356a8117))
## 1.1.8 — 2026-08-17


### 👷 CI/CD

- auto-merge les Dependabot majeures + filet de rollback sur dev ([c614b58](https://github.com/remi-deher/watchdeck/commit/c614b586abf4046b22b88848a35c6bffc70f4ed4))
- groupe les mises a jour Dependabot github-actions en une seule PR ([1931881](https://github.com/remi-deher/watchdeck/commit/1931881b8aa523e2b022f06aceaed29091778274))

### 🔧 Maintenance

- sync main into dev ([19b2a34](https://github.com/remi-deher/watchdeck/commit/19b2a34e451923c30b637921a31ed9b5b54bae26))
- sync main into dev ([3a13458](https://github.com/remi-deher/watchdeck/commit/3a13458eccddb1497fbdd44a07c6ee4b95c91aa8))
- v1.1.8 (#59) ([81524c6](https://github.com/remi-deher/watchdeck/commit/81524c6d42962f63caacf5c24fc9b69cb893f58b))
## 1.1.7 — 2026-08-17


### 🔧 Maintenance

- bump 5 GitHub Actions majeures (checkout 7.0.1, action-gh-release 3.0.2, build-push-action 7.3.0, dependency-review-action 5.0.0, upload-artifact 7.0.1) ([d42432e](https://github.com/remi-deher/watchdeck/commit/d42432e7a38a2f7e3a00413e1036734087f0fc5c))
- v1.1.7 (#56) ([b1c6dbb](https://github.com/remi-deher/watchdeck/commit/b1c6dbbbd2339c516aa1127cfee5f45e15736d07))
## 1.1.6 — 2026-08-17


### 🔧 Maintenance

- bump python from 3.12-alpine to 3.14-alpine (#1) ([10093e0](https://github.com/remi-deher/watchdeck/commit/10093e03e2ec4ec597042a41011f244d685c5190))
- sync main into dev ([7cbbf53](https://github.com/remi-deher/watchdeck/commit/7cbbf5334c1738969c13fef8ae5fa958320fb21d))
- sync main into dev ([4dc4055](https://github.com/remi-deher/watchdeck/commit/4dc4055c3cd526f503983cdf7bbc578d135ecf56))
- v1.1.6 (#45) ([29aeaa2](https://github.com/remi-deher/watchdeck/commit/29aeaa282cc85b01324253ce364757e33160f3d1))
## 1.1.5 — 2026-08-17


### 👷 CI/CD

- durcit le diagnostic de pertinence contre les PR sans ancetre commun ([7b46be6](https://github.com/remi-deher/watchdeck/commit/7b46be6dfc928025e27c8c6d947996af994f8df7))

### 🔧 Maintenance

- v1.1.5 (#42) ([5ee27f4](https://github.com/remi-deher/watchdeck/commit/5ee27f4217b7ff232c04b2566d6b864264c1f7d4))
## 1.1.4 — 2026-08-17


### 👷 CI/CD

- recentre les checks lourds sur test, allège dev et main ([9d1f19e](https://github.com/remi-deher/watchdeck/commit/9d1f19e56949e5bbca84634b567f24c8ceafb32b))

### 🔧 Maintenance

- sync main into dev ([21022a1](https://github.com/remi-deher/watchdeck/commit/21022a168d5846f13d0b3d7e929fd8a2b8501d4c))
- v1.1.4 (#36) ([fbe9e0e](https://github.com/remi-deher/watchdeck/commit/fbe9e0edcb4451db52afcecbed98a027bdd13de1))
## 1.1.3 — 2026-08-17


### 🔧 Maintenance

- bump typescript from 5.8.3 to 7.0.2 (#3) ([a6efb79](https://github.com/remi-deher/watchdeck/commit/a6efb7967d4b4b6b847d02b541a59f3a6fe0571f))
- bump dependabot/fetch-metadata from 2.5.0 to 3.1.0 (#5) ([08aecd9](https://github.com/remi-deher/watchdeck/commit/08aecd9b52fec0590748a35a6da7f27578c364fd))
- bump docker/setup-buildx-action from 3.12.0 to 4.2.0 (#6) ([82e37eb](https://github.com/remi-deher/watchdeck/commit/82e37eba589d49faf4c35a84994d4d0f2cb91fea))
- bump peter-evans/dockerhub-description from 4.0.2 to 5.0.0 (#7) ([875d9a6](https://github.com/remi-deher/watchdeck/commit/875d9a68ab4dccfca0639bbc6ab4e8793420aacf))
- bump actions/setup-node from 4.4.0 to 7.0.0 (#8) ([5d473e7](https://github.com/remi-deher/watchdeck/commit/5d473e77371ec2408269e05acc2733d771f36b4b))
- bump github/codeql-action/upload-sarif from 3.37.7 to 4.37.7 (#9) ([39ce612](https://github.com/remi-deher/watchdeck/commit/39ce612f42175f4c0534bc848a9cb569594a8dfb))
- v1.1.3 (#32) ([a1c17dc](https://github.com/remi-deher/watchdeck/commit/a1c17dc65e7238521354f7a39595873ace118309))
## 1.1.2 — 2026-08-17


### 🐛 Corrections

- corrige bugs réels + étend la couverture mypy à tout app/ ([0203492](https://github.com/remi-deher/watchdeck/commit/02034928e35e28e3529994a19c9123e17bd0aa56))

### 👷 CI/CD

- ajoute SBOM, provenance et signature Cosign keyless sur les images publiées ([85ddaf4](https://github.com/remi-deher/watchdeck/commit/85ddaf4bda025ee25e5dbeee9c6ad71a9f749966))

### 🔧 Maintenance

- v1.1.2 (#26) ([41a2a80](https://github.com/remi-deher/watchdeck/commit/41a2a8059778a1f2110880d75a5c40abed5c0b99))
## 1.1.1 — 2026-08-17


### 🎨 Style

- full-repo ruff check + format, no more per-file allowlist ([e410ab6](https://github.com/remi-deher/watchdeck/commit/e410ab6eb7b9ac70a123dc46884d4cf54ddbb357))

### 🔧 Maintenance

- v1.1.1 (#21) ([758c211](https://github.com/remi-deher/watchdeck/commit/758c2117c0cb97181bee3968f690476d52b2afe8))
## 1.1.0 — 2026-08-17


### ✨ Nouveautés

- gate Docker publish on CI, require Dependency Review + E2E for merge ([9d6388c](https://github.com/remi-deher/watchdeck/commit/9d6388c3e7a7ffd940ea05fb6a89e7a7866eb7da))
- list Docker Hub and GHCR image references in release notes ([f87bdf2](https://github.com/remi-deher/watchdeck/commit/f87bdf261fbee56171ed26c81f47f22d3dd7cde6))

### 🔧 Maintenance

- v1.1.0 (#16) ([bb003ce](https://github.com/remi-deher/watchdeck/commit/bb003ce5ed083f2dd3f7050e69dc5e0556e8ebc9))
## 1.0.1 — 2026-08-17


### 🔧 Maintenance

- bump asyncpg from 0.30.0 to 0.31.0 (#2) ([826027f](https://github.com/remi-deher/watchdeck/commit/826027f89836f2d40e3fd986f5c879402bef3f34))
- v1.0.1 (#11) ([e3c1506](https://github.com/remi-deher/watchdeck/commit/e3c150609aacffd2ee6335f9ba23ddf1ae758550))
## 1.0.0 — 2026-08-17


### 🔧 Maintenance

- v1.0.0 ([c8d00e9](https://github.com/remi-deher/watchdeck/commit/c8d00e98d43320280201b07d08094c8a8e217b16))
