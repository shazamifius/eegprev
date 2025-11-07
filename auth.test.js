const request = require('supertest');
const { app, server } = require('./index');
const { db, setupDatabase } = require('./database');

describe('Routes d authentification', () => {
  beforeEach((done) => {
    setupDatabase(() => {
        done();
    });
  });

  afterAll((done) => {
    server.close(() => {
        db.close(done);
    });
  });

  // Test de l'inscription
  it('devrait inscrire un nouvel utilisateur et rediriger vers /login', async () => {
    const res = await request(app)
      .post('/register')
      .field('name', 'Test User')
      .field('email', 'test@example.com')
      .field('password', 'password123')
      .expect(302);
    expect(res.header.location).toBe('/login');
  });

  // Test de la connexion
  it('devrait connecter un utilisateur existant et rediriger vers /profile', async () => {
    // Crée un utilisateur pour le test de connexion
    await request(app)
      .post('/register')
      .field('name', 'Login User')
      .field('email', 'login@example.com')
      .field('password', 'password123');

    const res = await request(app)
      .post('/login')
      .type('form')
      .send({ email: 'login@example.com', password: 'password123' })
      .expect(302);
    expect(res.header.location).toBe('/profile');
  });

  // Test de la déconnexion
  it('devrait déconnecter un utilisateur et rediriger vers /', async () => {
    const agent = request.agent(app);
    // Connecte l'utilisateur d'abord
    await agent
        .post('/register')
        .field('name', 'Logout User')
        .field('email', 'logout@example.com')
        .field('password', 'password123');

    await agent
      .post('/login')
      .type('form')
      .send({ email: 'logout@example.com', password: 'password123' });

    const res = await agent.get('/logout').expect(302);
    expect(res.header.location).toBe('/');
  });

  // Test de la connexion échouée
  it('devrait afficher un message d\'erreur en cas de mot de passe incorrect', async () => {
    const agent = request.agent(app);
    // Crée un utilisateur pour le test
    await agent
      .post('/register')
      .field('name', 'Fail User')
      .field('email', 'fail@example.com')
      .field('password', 'password123');

    // Tente de se connecter avec un mot de passe incorrect
    const res = await agent
      .post('/login')
      .type('form')
      .send({ email: 'fail@example.com', password: 'wrongpassword' })
      .expect(302);

    expect(res.header.location).toBe('/login');

    // Suit la redirection et vérifie la présence du message d'erreur
    const loginPage = await agent.get('/login');
    expect(loginPage.text).toContain('Mot de passe incorrect.');
  });
});
