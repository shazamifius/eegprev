document.addEventListener('DOMContentLoaded', () => {
    const birthdateInput = document.getElementById('birthdate');
    if (birthdateInput) {
        birthdateInput.addEventListener('input', formatAndValidateBirthdate);
    }

    const form = document.querySelector('form');
    if (form) {
        const inputs = form.querySelectorAll('input[required], textarea[required]');
        inputs.forEach(input => {
            input.addEventListener('input', () => validateField(input));
        });
    }
});

function formatAndValidateBirthdate(event) {
    let value = event.target.value.replace(/\D/g, '');
    if (value.length > 2 && value.length <= 4) {
        value = `${value.slice(0, 2)}/${value.slice(2)}`;
    } else if (value.length > 4) {
        value = `${value.slice(0, 2)}/${value.slice(2, 4)}/${value.slice(4, 8)}`;
    }
    event.target.value = value;
    validateField(event.target);
}

function validateField(field) {
    let isValid = false;
    switch (field.type) {
        case 'email':
            isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(field.value);
            break;
        case 'text':
            if (field.id === 'birthdate') {
                isValid = /^\d{2}\/\d{2}\/\d{4}$/.test(field.value);
                if (isValid) {
                    const [day, month, year] = field.value.split('/').map(Number);
                    const date = new Date(year, month - 1, day);
                    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
                        isValid = false;
                    }
                }
            } else {
                isValid = field.value.trim() !== '';
            }
            break;
        default:
            isValid = field.value.trim() !== '';
            break;
    }

    updateValidationUI(field, isValid);
}

function updateValidationUI(field, isValid) {
    let icon = field.nextElementSibling;
    if (icon && icon.classList.contains('validation-icon')) {
        icon.remove();
    }

    if (field.value) {
        icon = document.createElement('i');
        icon.classList.add('fas', 'validation-icon');
        if (isValid) {
            icon.classList.add('fa-check-circle', 'valid');
        } else {
            icon.classList.add('fa-times-circle', 'invalid');
        }
        field.parentNode.insertBefore(icon, field.nextSibling);
    }
}
