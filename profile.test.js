const request = require('supertest');
const { app, server } = require('./index');
const { db, setupDatabase } = require('./database');
const path = require('path');
const fs = require('fs');

describe('Routes de profil', () => {
  let agent;

  beforeEach((done) => {
    setupDatabase(() => {
        agent = request.agent(app);
        // Crée et connecte un utilisateur pour les tests
        agent
            .post('/register')
            .field('name', 'Profile User')
            .field('email', 'profile@example.com')
            .field('password', 'password123')
            .end(() => {
                agent
                    .post('/login')
                    .type('form')
                    .send({ email: 'profile@example.com', password: 'password123' })
                    .end(done);
            });
    });
  });

  afterAll((done) => {
    server.close(() => {
        db.close(done);
    });
  });

  // Test de l'affichage du profil
  it('devrait afficher la page de profil pour un utilisateur connecté', async () => {
    const res = await agent.get('/profile').expect(200);
    expect(res.text).toContain('Profile User');
  });

  // Test de la modification du profil
  it('devrait mettre à jour le profil utilisateur', async () => {
    const res = await agent
      .post('/profile/edit')
      .field('name', 'Updated User')
      .field('bio', 'This is a new bio.')
      .expect(302);
    expect(res.header.location).toBe('/profile');

    const profilePage = await agent.get('/profile');
    expect(profilePage.text).toContain('Updated User');
    expect(profilePage.text).toContain('This is a new bio.');
  });

  // Test de l'upload d'avatar
  it('devrait mettre à jour l\'avatar de l\'utilisateur', async () => {
    const avatarPath = path.join(__dirname, 'test-avatar.png');
    // Crée un fichier image factice pour le test
    fs.writeFileSync(avatarPath, 'test');

    const res = await agent
      .post('/profile/edit')
      .field('name', 'Profile User') // Maintient le nom pour éviter l'erreur NOT NULL
      .attach('avatar', avatarPath)
      .expect(302);
    expect(res.header.location).toBe('/profile');

    // Nettoie le fichier factice
    fs.unlinkSync(avatarPath);
  });
});
