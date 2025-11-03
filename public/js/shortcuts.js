// Keyboard shortcuts for EEGP Social Network

document.addEventListener('keydown', (event) => {
    // We only trigger shortcuts if the Alt key is pressed
    // and the user is not typing in an input field.
    if (!event.altKey || event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
        return;
    }

    // Prevent default browser behavior for the shortcut
    event.preventDefault();

    switch (event.key.toLowerCase()) {
        case 'a': // Accueil (Home)
            console.log('Shortcut: Navigating to Home');
            window.location.href = '/';
            break;

        case 'p': // Profil
            console.log('Shortcut: Navigating to Profile');
            window.location.href = '/profile';
            break;

        case 'e': // Élèves (Students)
            console.log('Shortcut: Navigating to Students');
            window.location.href = '/students';
            break;

        case 'c': // Créer (Create new post)
            console.log('Shortcut: Focus on new post form');
            // If we are on the publications page, focus the textarea. Otherwise, go to it.
            if (window.location.pathname.includes('/publications')) {
                const postTextarea = document.querySelector('textarea[name="content"]');
                if (postTextarea) {
                    postTextarea.focus();
                }
            } else {
                window.location.href = '/publications';
            }
            break;
    }
});
