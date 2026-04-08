const express = require('express');
const router = express.Router();
const studentController = require('../controllers/student.controller.js');
const { authenticate, authorize } = require('../middleware/auth.middleware.js');
const { csrfProtection } = require('../middleware/csrf.middleware.js');

// Get all students
router.get('/', authenticate, authorize('admin'), studentController.getAllStudents);

// Get student by ID
router.get('/:id', authenticate, authorize('admin'), studentController.getStudentById);

// Create student
router.post('/', authenticate, authorize('admin'), csrfProtection, studentController.createStudent);

// Update student
router.put('/:id', authenticate, authorize('admin'), csrfProtection, studentController.updateStudent);

// Delete student
router.delete('/:id', authenticate, authorize('admin'), csrfProtection, studentController.deleteStudent);

// Seed 100 sample students
router.post('/seed', authenticate, authorize('admin'), csrfProtection, studentController.seedStudents);

module.exports = router;
