// public/js/workspace.js

document.addEventListener('DOMContentLoaded', () => {
    const socket = io();
    const workspaceContainer = document.querySelector('.workspace-container');

    if (!workspaceContainer) return; // Only run if workspace widget is present

    // DOM Elements
    const roomGrid = document.getElementById('room-grid');
    const totalCountEl = document.getElementById('workspace-total-count');
    const userStatusEl = document.getElementById('user-workspace-status');
    const leaveBtn = document.getElementById('leave-workspace-btn');

    // State
    let currentUser = null; // Will be set via global variable or data attribute if possible, or inferred
    // We can infer current user ID from the session user passed in EJS which we can put in a meta tag or data attr
    const currentUserId = document.body.dataset.userId;

    // Listen for updates
    socket.on('update coworkers list', (coworkers) => {
        renderWorkspace(coworkers);
        updateUserStatus(coworkers);
    });

    // Helper to get room capacity/info (we rely on server validation but good to have info)
    // We might need to embed room data in the page to access it here easily without making a request
    // Or we just display what we have.

    function renderWorkspace(coworkers) {
        // Clear current counts in the grid chips
        document.querySelectorAll('.room-card').forEach(card => {
            const countBadge = card.querySelector('.room-count');
            const avatarStack = card.querySelector('.avatar-stack');
            countBadge.textContent = '0';
            countBadge.classList.remove('active');
            avatarStack.innerHTML = ''; // Clear avatars
        });

        let total = 0;

        coworkers.forEach(coworker => {
            total++;
            const roomCard = document.getElementById(`room-${coworker.room}`);
            if (roomCard) {
                const countBadge = roomCard.querySelector('.room-count');
                const avatarStack = roomCard.querySelector('.avatar-stack');

                // Update count
                let currentCount = parseInt(countBadge.textContent);
                countBadge.textContent = currentCount + 1;
                countBadge.classList.add('active');

                // Add Avatar
                if (avatarStack.children.length < 5) { // Show max 5 avatars
                    const img = document.createElement('img');
                    img.src = coworker.avatar || '/images/default-avatar.png';
                    img.title = coworker.name;
                    img.classList.add('stack-avatar');
                    avatarStack.appendChild(img);
                }
            }
        });

        if (totalCountEl) totalCountEl.textContent = total;
    }

    function updateUserStatus(coworkers) {
        const me = coworkers.find(c => c.id == currentUserId);
        if (me) {
            // User is checked in
            if (userStatusEl) {
                userStatusEl.innerHTML = `
                    <div class="status-active">
                        <span class="pulse"></span>
                        Vous êtes en <strong>${getRoomName(me.room)}</strong>
                    </div>
                `;
            }
            if (leaveBtn) leaveBtn.style.display = 'inline-block';

            // Highlight my room
            document.querySelectorAll('.room-card').forEach(c => c.classList.remove('my-room'));
            const myCard = document.getElementById(`room-${me.room}`);
            if (myCard) myCard.classList.add('my-room');

        } else {
            // User is NOT checked in
            if (userStatusEl) {
                userStatusEl.innerHTML = `<span class="status-inactive">Non connecté au workspace</span>`;
            }
            if (leaveBtn) leaveBtn.style.display = 'none';
            document.querySelectorAll('.room-card').forEach(c => c.classList.remove('my-room'));
        }
    }

    // Handle Join Room
    document.querySelectorAll('.btn-join-room').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const roomId = btn.dataset.roomId;
            const roomName = btn.dataset.roomName;

            // Emit join event
            // We can ask for activity, for now default to "Travail" or ask via prompt/modal
            // "One click" implies default. Let's start with default.
            socket.emit('coworking update', {
                is_coworking: true,
                room: roomId,
                activity: 'Travail'
            });
        });
    });

    // Handle Leave
    if (leaveBtn) {
        leaveBtn.addEventListener('click', () => {
            socket.emit('coworking update', {
                is_coworking: false
            });
        });
    }

    // Helper
    function getRoomName(id) {
        // Try to find name from DOM
        const btn = document.querySelector(`.btn-join-room[data-room-id="${id}"]`);
        return btn ? btn.dataset.roomName : id;
    }
});
