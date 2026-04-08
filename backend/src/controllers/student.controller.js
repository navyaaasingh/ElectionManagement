const Student = require('../models/student.model.js');
const { broadcastMessage } = require('../services/websocket.service.js');
const logger = require('../utils/logger.js');

const getAdminScope = (req) => {
    if (req.user?.adminRole === 'SUPER_ADMIN') return {};
    if (req.user?.adminId) return { admin_id: req.user.adminId };
    return {};
};

/**
 * Get all students
 */
exports.getAllStudents = async (req, res) => {
    try {
        const students = await Student.findAll({
            where: getAdminScope(req),
            order: [['createdAt', 'DESC']]
        });
        res.json(students);
    } catch (error) {
        logger.error('GET_ALL_STUDENTS_ERROR', { error: error.message });
        res.status(500).json({ status: 'error', message: 'Failed to fetch students' });
    }
};

/**
 * Get student by ID
 */
exports.getStudentById = async (req, res) => {
    try {
        const student = await Student.findOne({
            where: {
                student_id: req.params.id,
                ...getAdminScope(req),
            },
        });
        if (!student) {
            return res.status(404).json({ status: 'error', message: 'Student not found' });
        }
        res.json(student);
    } catch (error) {
        logger.error('GET_STUDENT_BY_ID_ERROR', { error: error.message });
        res.status(500).json({ status: 'error', message: 'Failed to fetch student' });
    }
};

/**
 * Create a new student
 */
exports.createStudent = async (req, res) => {
    try {
        const { name, roll_number, department, course, program } = req.body;
        
        // Validation Layer
        if (!name || name.length > 50) {
            return res.status(400).json({ status: 'error', message: 'Name is required and must be under 50 characters' });
        }
        if (!roll_number || !/^[A-Z0-9\-/]+$/.test(roll_number)) {
            return res.status(400).json({ status: 'error', message: 'Invalid Roll Number format (Alphanumeric, -, / allowed)' });
        }
        if (roll_number.length > 20) {
             return res.status(400).json({ status: 'error', message: 'Roll Number too long (Max 20 chars)' });
        }

        if (!department || !course || !program) {
            return res.status(400).json({ status: 'error', message: 'Department, course, and program are required' });
        }

        const student = await Student.create({
            name,
            roll_number,
            department,
            course,
            program,
            admin_id: req.user.adminId || null,
        });
        
        // Broadcast new student creation in real-time
        broadcastMessage('STUDENT_CREATED', student);
        
        res.status(201).json(student);
    } catch (error) {
        logger.error('CREATE_STUDENT_ERROR', { error: error.message });
        if (error.name === 'SequelizeUniqueConstraintError') {
            return res.status(400).json({ status: 'error', message: 'Roll number already exists' });
        }
        res.status(500).json({ status: 'error', message: 'Failed to create student' });
    }
};

/**
 * Update a student
 */
exports.updateStudent = async (req, res) => {
    try {
        const student = await Student.findOne({
            where: {
                student_id: req.params.id,
                ...getAdminScope(req),
            },
        });
        if (!student) {
            return res.status(404).json({ status: 'error', message: 'Student not found' });
        }
        const { name, roll_number } = req.body;
        if (name && name.length > 50) {
            return res.status(400).json({ status: 'error', message: 'Name must be under 50 characters' });
        }
        if (roll_number) {
            if (!/^[A-Z0-9\-/]+$/.test(roll_number)) {
                return res.status(400).json({ status: 'error', message: 'Invalid Roll Number format' });
            }
            if (roll_number.length > 20) {
                return res.status(400).json({ status: 'error', message: 'Roll Number too long' });
            }
        }
        
        await student.update(req.body);
        
        // Broadcast student update in real-time
        broadcastMessage('STUDENT_UPDATED', student);
        
        res.json(student);
    } catch (error) {
        logger.error('UPDATE_STUDENT_ERROR', { error: error.message });
        res.status(500).json({ status: 'error', message: 'Failed to update student' });
    }
};

/**
 * Delete a student
 */
exports.deleteStudent = async (req, res) => {
    try {
        const student = await Student.findOne({
            where: {
                student_id: req.params.id,
                ...getAdminScope(req),
            },
        });
        if (!student) {
            return res.status(404).json({ status: 'error', message: 'Student not found' });
        }
        
        const studentId = student.student_id;
        await student.destroy();
        
        // Broadcast student deletion in real-time
        broadcastMessage('STUDENT_DELETED', { student_id: studentId });
        
        res.json({ status: 'success', message: 'Student deleted' });
    } catch (error) {
        logger.error('DELETE_STUDENT_ERROR', { error: error.message });
        res.status(500).json({ status: 'error', message: 'Failed to delete student' });
    }
};

/**
 * Seed 100 sample students
 */
exports.seedStudents = async (req, res) => {
    try {
        const departments = ['CS', 'EE', 'ME', 'CE', 'MATH', 'PHYS'];
        const courses = ['B.Tech', 'M.Tech', 'Ph.D'];
        const programs = ['Regular', 'Distance', 'Executive'];
        const names = [
            'Arjun Sharma', 'Priya Singh', 'Amit Patel', 'Sneha Gupta', 'Rahul Verma',
            'Ananya Iyer', 'Vikram Joshi', 'Kavita Reddy', 'Rohan Mishra', 'Ishani Das',
            'Manish Kumar', 'Deepika Rao', 'Sahil Khan', 'Tanya Bajaj', 'Vivek Chopra',
            'Divya Chauhan', 'Siddharth Patil', 'Riya Malik', 'Akash Nair', 'Shruti Saxena'
        ];

        const sampleStudents = [];
        for (let i = 1; i <= 100; i++) {
            const randomName = names[Math.floor(Math.random() * names.length)] + ' ' + (i);
            sampleStudents.push({
                roll_number: `STU${String(i).padStart(4, '0')}`,
                name: randomName,
                department: departments[Math.floor(Math.random() * departments.length)],
                course: courses[Math.floor(Math.random() * courses.length)],
                program: programs[Math.floor(Math.random() * programs.length)],
                admin_id: req.user.adminId || null,
            });
        }
        
        await Student.sync(); // Ensure table exists
        await Student.destroy({ where: getAdminScope(req), truncate: false });
        const createdStudents = await Student.bulkCreate(sampleStudents);
        
        // Broadcast refresh signal for students
        broadcastMessage('STUDENTS_REFRESHED', { count: createdStudents.length });
        
        res.json({ status: 'success', message: '100 sample student entries created.', count: createdStudents.length });
    } catch (error) {
        logger.error('SEED_STUDENTS_ERROR', { error: error.message });
        res.status(500).json({ status: 'error', message: 'Failed to seed students' });
    }
};
