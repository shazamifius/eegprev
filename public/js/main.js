document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.expand-button').forEach(button => {
        button.addEventListener('click', () => {
            const expandableText = button.closest('.expandable-text');
            expandableText.classList.toggle('expanded');
            if (expandableText.classList.contains('expanded')) {
                button.textContent = 'Voir moins';
            } else {
                button.textContent = 'Voir plus';
            }
        });
    });
});
