/**
 * Banner Animation Logic
 * Handles 3D flipping of image slots for both Profile and Student Card mini-banners.
 */

// --- Profile Banner Logic ---
function initProfileBanner(images) {
    const slots = [
        document.getElementById('slot-0'),
        document.getElementById('slot-1'),
        document.getElementById('slot-2')
    ];

    if (!slots[0]) return; // Not on profile page or error

    let currentSlotImages = [null, null, null];

    function getImageUrl(imgObj) {
        return imgObj ? `url('${imgObj.image_path}')` : `url('/images/default-banner.svg')`;
    }

    // 1. Initial Fill
    slots.forEach((slot, index) => {
        if (!slot) return;
        let imgObj = null;
        if (images.length > 0) {
            imgObj = images[index % images.length];
        }

        const front = slot.querySelector('.slot-front');
        const back = slot.querySelector('.slot-back');

        if (front) front.style.backgroundImage = getImageUrl(imgObj);
        if (back) back.style.backgroundImage = getImageUrl(imgObj);

        currentSlotImages[index] = imgObj;
    });

    // 2. Animation Loop (Only if strictly more images than slots, OR if we want movement regardless)
    // The user wants "animation incroyable qui switch les image".
    // Even with 3 images, switching positions is nice.
    if (images.length > 0) {
        setInterval(() => {
            // Pick a random slot
            const slotIndex = Math.floor(Math.random() * 3);
            const slot = slots[slotIndex];
            if (!slot) return;

            // Pick a new image
            // Try to find one not currently shown
            const currentPaths = currentSlotImages.map(img => img ? img.image_path : '');
            let availableImages = images.filter(img => !currentPaths.includes(img.image_path));

            // If all shown (e.g. only 3 images), pick any OTHER distinct image for this slot
            if (availableImages.length === 0) {
                availableImages = images.filter(img => img.image_path !== (currentSlotImages[slotIndex] ? currentSlotImages[slotIndex].image_path : ''));
            }

            if (availableImages.length === 0) return; // Only 1 image total

            const newImage = availableImages[Math.floor(Math.random() * availableImages.length)];

            // Flip
            const isFlipped = slot.classList.contains('flipped');
            const targetFace = isFlipped ? slot.querySelector('.slot-front') : slot.querySelector('.slot-back');

            targetFace.style.backgroundImage = getImageUrl(newImage);
            slot.classList.toggle('flipped');

            currentSlotImages[slotIndex] = newImage;

        }, 3000); // 3 seconds interval for constant activity
    }
}


// --- Student Card Logic ---
// We need to initialize this for potentially many cards.
// We can attach data to the HTML element and init on demand (IntersectionObserver) or all at once.
// Given performance concerns, IntersectionObserver is best, but let's start simple with "on load"
// or specialized "start/stop" on hover (requested in original code but users might miss it).
// actually the requirement is "start/stop" on hover was old behavior, new request implies "un truc de fou"
// "reste 10 minute sur la page voir toute les image passer"
// So maybe global animation for visible cards.

const cardObservers = new Map(); // Store intervals

function initStudentCardBanners() {
    const banners = document.querySelectorAll('.student-card-banner-mini');

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                startCardAnimation(entry.target);
            } else {
                stopCardAnimation(entry.target);
            }
        });
    }, { threshold: 0.1 });

    banners.forEach(banner => observer.observe(banner));
}

function startCardAnimation(bannerMeta) {
    if (cardObservers.has(bannerMeta)) return; // Already running

    const imagesData = bannerMeta.getAttribute('data-images');
    if (!imagesData) return;
    const images = JSON.parse(imagesData);
    if (images.length === 0) return;

    // Build the DOM structure if empty (lazy init)
    // Expect the HTML to be pre-built by EJS for faster first paint, or built here?
    // Let's assume EJS builds the 3 slots, we just animate.
    const slots = [
        bannerMeta.querySelector('.slot-0 .mini-slot'),
        bannerMeta.querySelector('.slot-1 .mini-slot'),
        bannerMeta.querySelector('.slot-2 .mini-slot')
    ];

    let currentSlotPaths = [
        slots[0]?.getAttribute('data-current-src'),
        slots[1]?.getAttribute('data-current-src'),
        slots[2]?.getAttribute('data-current-src')
    ];

    const intervalId = setInterval(() => {
        const slotIndex = Math.floor(Math.random() * 3);
        const slot = slots[slotIndex];
        if (!slot) return;

        // Pick new image
        let availableParams = images.filter(path => !currentSlotPaths.includes(path));
        if (availableParams.length === 0) {
            availableParams = images.filter(path => path !== currentSlotPaths[slotIndex]);
        }
        if (availableParams.length === 0) return;

        const newPath = availableParams[Math.floor(Math.random() * availableParams.length)];
        const isFlipped = slot.classList.contains('flipped');
        const targetFace = isFlipped ? slot.querySelector('.mini-slot-front') : slot.querySelector('.mini-slot-back');

        targetFace.style.backgroundImage = `url('${newPath}')`;
        slot.classList.toggle('flipped');
        currentSlotPaths[slotIndex] = newPath;
        slot.setAttribute('data-current-src', newPath);

    }, 3000 + Math.random() * 2000); // Staggered animations per card

    cardObservers.set(bannerMeta, intervalId);
}

function stopCardAnimation(bannerMeta) {
    const id = cardObservers.get(bannerMeta);
    if (id) {
        clearInterval(id);
        cardObservers.delete(bannerMeta);
    }
}
