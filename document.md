# Documentation Technique - Projet EEGP Network

## 1. Vue d'ensemble

Le projet **EEGP Network** est une plateforme de réseau social privée destinée aux étudiants de l'école d'art EEGP. L'application permet aux étudiants de se connecter, de partager leurs projets, de demander de l'aide, de consulter les actualités de l'école et de discuter en temps réel. Elle vise à favoriser la collaboration et l'entraide au sein de l'établissement.

### Stack Technique
- **Backend :** Node.js avec Express.js (v5.1.0).
- **Base de Données :** SQLite3.
- **Frontend :** EJS (Embedded JavaScript) pour le templating, CSS et JavaScript vanilla.
- **Temps Réel :** Socket.IO (v4.8.1) pour le chat et la liste des utilisateurs connectés.
- **Authentification :** Gestion de session via `express-session` et hachage de mot de passe avec `bcrypt`.
- **Uploads :** `multer` pour la gestion des fichiers et images.
- **Tests :** Jest et Supertest.

---

## 2. Architecture Logicielle

L'application suit une architecture MVC (Modèle-Vue-Contrôleur) adaptée à Node.js/Express.

### Structure des Dossiers
```
/
├── database.js         # Configuration de la base de données et définition du schéma
├── index.js            # Point d'entrée principal (Serveur, Middlewares, Routes globales)
├── reset-db.js         # Script utilitaire pour réinitialiser la BDD
├── public/             # Fichiers statiques (accessibles publiquement)
│   ├── css/            # Feuilles de style
│   ├── js/             # Scripts client (validation, chat)
│   ├── images/         # Images statiques et uploads (avatars, projets, etc.)
│   └── files/          # Fichiers téléchargeables des projets
├── routes/             # Définition des routes (Contrôleurs)
│   └── projects.js     # Routes spécifiques à la gestion des projets
├── views/              # Modèles de vue (Templates EJS)
│   ├── partials/       # Fragments de vue réutilisables (header, footer)
│   ├── projects/       # Vues liées aux projets
│   └── ...             # Autres vues (login, profile, news, etc.)
└── uploads/            # Dossier racine pour certains uploads
```

---

## 3. Modèle de Données (Base de Données)

La base de données est relationnelle (SQLite). Voici les principales entités et leurs relations :

### Tables Principales

1.  **users**
    *   `id`: Clé primaire.
    *   `name`, `email` (unique), `password` (haché).
    *   `is_admin`: Booléen pour les privilèges administrateur.
    *   `classe`, `age`, `birthdate`, `bio`, `portfolio`.
    *   `avatar`: Chemin vers l'image de profil.
    *   Réseaux sociaux : `discord`, `instagram`, `snapchat`.

2.  **projects**
    *   `id`: Clé primaire.
    *   `title`, `description`, `readme_content` (Markdown).
    *   `banner_path`: Image de couverture.
    *   `author_id`: Clé étrangère vers `users`.
    *   `project_type`: Type de projet (ex: 'internal').
    *   `is_public`: Visibilité publique (hors connexion).
    *   `allow_download`: Autorisation de téléchargement des fichiers.
    *   `upvotes`: Compteur de votes.

3.  **posts** (Publications / Fil d'actualité)
    *   `content`, `media_path`, `media_type`.
    *   `category`, `author_id` (FK `users`).
    *   `upvotes`.

4.  **news** (Actualités officielles)
    *   `title`, `content`, `image_path`, `video_url`.
    *   `author_id` (FK `users`, généralement admin).

5.  **help_requests** (Entraide)
    *   `title`, `description`, `category`, `status` (ex: 'ouverte', 'résolue').
    *   `author_id` (FK `users`).

### Tables de Liaison et Contenu Secondaire

*   **project_files** : Fichiers attachés à un projet (`project_id`, `file_path`).
*   **project_images** : Images additionnelles d'un projet.
*   **showcase_images** : Galerie d'images personnelle sur le profil utilisateur.
*   **comments** (plusieurs tables) : `project_comments`, `post_comments`, `help_request_comments`.
*   **upvotes** (plusieurs tables) : `project_upvotes`, `post_upvotes` (pour éviter les doubles votes).
*   **project_collaborators** : Gestion des co-auteurs (structure prévue).

---

## 4. Fonctionnalités et API (Routes)

L'application expose plusieurs groupes de fonctionnalités via des routes HTTP.

### Authentification
*   `GET /login`, `POST /login` : Connexion utilisateur.
*   `GET /register`, `POST /register` : Inscription avec avatar et galerie "showcase".
*   `GET /logout` : Destruction de la session.
*   **Middleware** : `isAuthenticated` protège les routes privées. `isAdmin` protège les routes d'administration.

### Gestion des Profils (`/profile`)
*   Affichage du profil avec bio, liens sociaux, projets, et galerie.
*   Édition du profil (avatar, infos personnelles, ajout/suppression d'images showcase).
*   Calcul automatique de l'âge basé sur la date de naissance.
*   Parsing des liens portfolio pour générer des boutons avec favicons.

### Projets (`/projects` - Géré dans `routes/projects.js`)
*   `GET /projects` : Galerie publique (accessible hors connexion). Utilise `banner_path` ou extrait la première image du README comme miniature.
*   `GET /projects/my-projects` : Tableau de bord des projets de l'utilisateur.
*   `POST /projects/new/internal` : Création de projet avec bannière et fichiers multiples.
*   `GET /projects/:id` : Affichage détaillé. Convertit le Markdown du README en HTML via `showdown`.
*   `POST /projects/:id/edit` : Modification des métadonnées et ajout de fichiers.
*   `POST /projects/:id/delete` : Suppression complète (BDD + Fichiers physiques).

### Social & Communauté
*   **Actualités (`/news`)** : Articles créés par les admins.
*   **Publications (`/publications`)** : Posts des utilisateurs avec images/vidéos et système de vote.
*   **Entraide (`/help`)** : Système de tickets avec catégories et statuts de résolution.
*   **Étudiants (`/students`)** : Annuaire des utilisateurs avec filtres par nom et par classe.
*   **Chat (`/chat`)** : Messagerie instantanée en temps réel via Socket.IO.

### Administration
*   Les utilisateurs marqués `is_admin = 1` peuvent créer/modifier/supprimer des actualités (`/news/new`, `/news/edit/:id`).

---

## 5. Sécurité

*   **Mots de passe** : Hachés avec `bcrypt` (salt rounds = 10) avant stockage.
*   **Sessions** : Utilisation de `express-session` avec une clé secrète.
*   **Uploads** : Validation des types MIME via `multer` (implicite par extensions) et gestion des erreurs de taille/nombre de fichiers.
*   **Injections SQL** : Utilisation systématique de requêtes préparées (`?`) avec `sqlite3` pour empêcher les injections.
*   **XSS** : EJS échappe par défaut les variables affichées (`<%= %>`). Le contenu HTML du README est généré côté serveur par une librairie de confiance (`showdown`).

---

## 6. Frontend

*   **Moteur de Template** : EJS permet de générer des pages HTML dynamiques en injectant les données du serveur (variable `user`, listes de projets, etc.).
*   **Assets** : Les fichiers statiques sont servis depuis le dossier `public/`.
*   **Validation JS** : `form-validation.js` assure une validation côté client (format date JJ/MM/AAAA, emails) avant l'envoi au serveur.
*   **UI** : Utilisation de FontAwesome pour les icônes.

---
---

# Journal d'Utilisation (Guide Utilisateur)

Ce guide explique comment installer, lancer et utiliser l'application EEGP Network.

## 1. Installation et Démarrage

### Pré-requis
*   Avoir **Node.js** installé sur votre machine.

### Installation
1.  Ouvrez un terminal dans le dossier racine du projet.
2.  Installez les dépendances nécessaires avec la commande :
    ```bash
    npm install
    ```
3.  Le script créera automatiquement le dossier `node_modules`.

### Configuration de la Base de Données
*   L'application utilise SQLite. Aucune installation de serveur de base de données externe n'est requise.
*   Le fichier `database.db` sera créé automatiquement au premier lancement.
*   Si vous souhaitez remettre à zéro la base de données (supprimer toutes les données et recréer les tables), exécutez :
    ```bash
    node reset-db.js
    ```

### Lancement de l'Application
1.  Démarrez le serveur avec la commande :
    ```bash
    npm start
    ```
2.  Le terminal affichera : `Serveur en écoute sur http://localhost:3000`.
3.  Ouvrez votre navigateur web et allez à l'adresse : `http://localhost:3000`.

---

## 2. Guide des Fonctionnalités

### A. Inscription et Connexion
*   **Inscription** : Cliquez sur "S'inscrire". Remplissez le formulaire (Nom, Email, Classe, Date de naissance, etc.). Vous devez uploader un avatar. Vous pouvez aussi ajouter jusqu'à 15 images pour votre galerie personnelle ("Showcase").
    *   *Note* : Votre âge est calculé automatiquement à partir de votre date de naissance.
*   **Connexion** : Utilisez votre email et mot de passe définis lors de l'inscription.

### B. Gestion du Profil
*   Cliquez sur votre avatar ou nom dans le menu pour accéder à votre profil.
*   **Modifier le profil** : Permet de changer votre bio, vos réseaux sociaux, votre avatar et gérer vos images de galerie (suppression d'anciennes images, ajout de nouvelles).
*   **Portfolio** : Si vous entrez une liste de liens dans le champ portfolio (un par ligne), ils s'afficheront sous forme de boutons cliquables sur votre profil.

### C. Projets (Le Cœur du Réseau)
*   **Voir les projets** : L'onglet "Projets" affiche la galerie publique.
*   **Mes Projets** : Gérez vos propres créations.
*   **Créer un projet** :
    1.  Allez dans "Mes Projets" -> "Nouveau Projet".
    2.  Remplissez le titre et la description (README). Le champ README supporte le format **Markdown** (titres, gras, listes, images).
    3.  **Bannière** : Uploadez une image qui servira de miniature.
    4.  **Fichiers** : Vous pouvez attacher plusieurs fichiers (zip, pdf, images) que les autres pourront télécharger.
    5.  **Visibilité** : Cochez "Public" pour que le projet soit visible par les visiteurs non connectés.
*   **Interactions** : Vous pouvez commenter les projets des autres et voter pour eux ("Upvote").

### D. Communauté et Entraide
*   **Fil d'actualité (Publications)** : Partagez des statuts, des images ou des vidéos courtes avec toute l'école. Filtrez les posts par catégorie (Général, Design, Code, etc.).
*   **Besoin d'aide ?** : La section "Entraide" permet de poster une demande spécifique (ex: "Bug sur mon code JS"). Les autres étudiants peuvent répondre en commentaire pour proposer des solutions. Si votre problème est réglé, marquez la demande comme "Résolue".
*   **Chat** : Discutez en direct avec les autres utilisateurs connectés dans la "Chat Room".
*   **Annuaire Étudiants** : Cherchez vos camarades par nom ou par classe pour voir leurs profils et travaux.

### E. Administration (Pour les Staffs)
*   Les utilisateurs ayant le rôle "Admin" ont accès à des boutons supplémentaires pour créer, modifier ou supprimer des articles dans la section **News** (Actualités de l'école).

---

## 3. Dépannage Rapide

*   **Erreur "EADDRINUSE"** : Le port 3000 est déjà utilisé. Fermez les autres terminaux ou processus Node.js.
*   **Images ne s'affichent pas** : Vérifiez que les dossiers dans `public/images/` existent (le serveur tente de les créer au démarrage, mais des problèmes de permission peuvent survenir).
*   **Upload échoué** : Vérifiez que vos fichiers ne dépassent pas la taille limite autorisée par la configuration du serveur.
