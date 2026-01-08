document.addEventListener('DOMContentLoaded', () => {
    const toggleButton = document.querySelector('.mobile-menu-toggle');
    const closeButton = document.querySelector('.mobile-menu-close');
    const overlay = document.querySelector('.mobile-menu-overlay');

    if (toggleButton && overlay) {
        toggleButton.addEventListener('click', () => {
            overlay.classList.add('active');
            document.body.style.overflow = 'hidden'; // Prevent scrolling
        });
    }

    if (closeButton && overlay) {
        closeButton.addEventListener('click', () => {
            overlay.classList.remove('active');
            document.body.style.overflow = ''; // Restore scrolling
        });
    }

    // Close menu when clicking outside (optional, but good UX)
    /*
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            overlay.classList.remove('active');
            document.body.style.overflow = '';
        }
    });
    */
});
