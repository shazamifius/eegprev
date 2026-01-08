const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const projectController = require('../controllers/projectController');

// Configure multer for file uploads
const uploadDir = path.join(__dirname, '../uploads/projects');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// Middleware to check if the user is authenticated
const isAuthenticated = (req, res, next) => {
    if (req.session && req.session.user) {
        return next();
    }
    res.redirect('/login');
};

// GET /projects - Public projects gallery
router.get('/', projectController.getAllProjects);

// GET /projects/my-projects - User's own projects
router.get('/my-projects', isAuthenticated, projectController.getMyProjects);

// GET /projects/new - Display project creation choice page
router.get('/new', isAuthenticated, projectController.getNewProjectChoice);

// GET /projects/new/internal - Display internal project creation form
router.get('/new/internal', isAuthenticated, projectController.getNewInternalProject);

// POST /projects/new/internal - Handle internal project creation
router.post('/new/internal', isAuthenticated, upload.fields([{ name: 'banner', maxCount: 1 }, { name: 'project_files', maxCount: 10 }]), projectController.createInternalProject);

// POST /projects/upload-image - Handle image uploads from TinyMCE
router.post('/upload-image', isAuthenticated, upload.single('file'), projectController.uploadImage);

// GET /projects/:id - Display a single project
router.get('/:id', projectController.getProject);

// GET /projects/:id/edit - Display project edit form
router.get('/:id/edit', isAuthenticated, projectController.getEditProject);

// POST /projects/:id/edit - Handle project edit
router.post('/:id/edit', isAuthenticated, upload.fields([{ name: 'banner', maxCount: 1 }, { name: 'project_files', maxCount: 10 }]), projectController.updateProject);

// POST /projects/:id/comment - Handle new comment
router.post('/:id/comment', isAuthenticated, projectController.postComment);

// GET /projects/:id/files/:file_id/delete - Handle file deletion
router.get('/:id/files/:file_id/delete', isAuthenticated, projectController.deleteProjectFile);

// POST /projects/:id/upvote - Upvote a project
router.post('/:id/upvote', isAuthenticated, projectController.upvoteProject);

// POST /projects/:id/delete - Handle project deletion
router.post('/:id/delete', isAuthenticated, projectController.deleteProject);

module.exports = router;
