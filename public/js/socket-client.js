// Global Socket.IO Client Initialization
// This ensures 'socket' is available everywhere in the app
const socket = io();
window.socket = socket;

console.log('Global Socket Initialized');

socket.on('connect', () => {
    console.log('Connected to server with ID:', socket.id);
});

socket.on('connect_error', (err) => {
    console.error('Socket connection error:', err);
});
