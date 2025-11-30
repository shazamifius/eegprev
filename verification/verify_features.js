const { chromium } = require('playwright');
const path = require('path');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
        // 1. Inscription
        const email = `testuser-${Date.now()}@example.com`;
        await page.goto('http://localhost:3000/register');
        await page.fill('input[name="name"]', 'Test User');
        await page.fill('input[name="email"]', email);
        await page.fill('input[name="password"]', 'password123');
        await page.fill('input[name="classe"]', 'Design 1');
        await page.fill('input[name="birthdate"]', '01/01/2000');

        // Handle avatar upload which is required
        const avatarPath = path.join(__dirname, 'avatar.png');
        const fileInput = await page.$('input[name="avatar"]');
        await fileInput.setInputFiles(avatarPath);

        await page.click('button[type="submit"]');

        // 2. Connexion
        await page.waitForURL('**/login', { timeout: 10000 });
        await page.fill('input[name="email"]', email);
        await page.fill('input[name="password"]', 'password123');
        await page.click('button[type="submit"]');
        await page.waitForURL('**/profile', { timeout: 10000 });

        // 3. Go to Help Page
        await page.goto('http://localhost:3000/help');
        await page.screenshot({ path: 'verification/help_page.png', fullPage: true });
        console.log('Help page screenshot taken.');

        // 4. Open Modal and Fill
        await page.evaluate(() => openModal('help'));
        await page.waitForSelector('#newRequestModal', { state: 'visible' });
        await page.fill('#newRequestModal input[name="title"]', 'Problème de Test');
        await page.fill('#newRequestModal textarea[name="description"]', 'Ceci est une description de test pour Playwright.');
        await page.selectOption('#newRequestModal select[name="category"]', 'Général');
        await page.fill('#newRequestModal input[name="tags"]', 'Test, Automated');

        await page.screenshot({ path: 'verification/help_modal.png' });
        console.log('Help modal screenshot taken.');

        await page.click('#newRequestModal button[type="submit"]');
        await page.waitForURL('**/help');

        // 5. Verify Request Appears
        // Refresh to ensure it's there
        await page.reload();
        const textFound = await page.getByText('Problème de Test').isVisible();
        if (!textFound) throw new Error("New help request not found on page.");

        // 6. Check Beacon Widget (Header)
        const beaconBtn = await page.$('#beaconToggleBtn');
        if (beaconBtn && await beaconBtn.isVisible()) {
             await beaconBtn.click();
        }
        await page.waitForTimeout(500);
        await page.screenshot({ path: 'verification/beacon_widget.png' });
        console.log('Beacon widget screenshot taken.');

    } catch (error) {
        console.error('Verification failed:', error);
        await page.screenshot({ path: 'verification/error_state.png' });
        process.exit(1);
    } finally {
        await browser.close();
    }
})();
