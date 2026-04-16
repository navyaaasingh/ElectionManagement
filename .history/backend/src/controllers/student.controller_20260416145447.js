const Student = require('../models/student.model.js');
const { broadcastMessage } = require('../services/websocket.service.js');
const logger = require('../utils/logger.js');

const getAdminScope = (req) => {
    if (req.user?.adminRole === 'SUPER_ADMIN') return {};
    if (req.user?.adminId) return { admin_id: req.user.adminId };
    return {};
};

const normalizeText = (value) => {
    if (value === undefined || value === null) return '';
    return String(value).trim();
};

const normalizeRollNumber = (value) => normalizeText(value).toUpperCase();

const normalizeHeader = (value) => normalizeText(value).toLowerCase().replace(/[\s._-]+/g, '');

const pickRowValue = (row, aliases) => {
    const aliasSet = new Set(aliases.map(normalizeHeader));

    for (const [key, value] of Object.entries(row || {})) {
        if (aliasSet.has(normalizeHeader(key))) {
            return value;
        }
    }

    return undefined;
};

const parseImportedStudents = (rows) => {
    const entries = [];
    const errors = [];

    rows.forEach((row, index) => {
        const rowNumber = index + 2;
        const student = {
            roll_number: normalizeRollNumber(pickRowValue(row, ['roll_number', 'roll number', 'roll no', 'rollno', 'student_id', 'student id'])),
            name: normalizeText(pickRowValue(row, ['name', 'full_name', 'full name', 'student name'])),
            department: normalizeText(pickRowValue(row, ['department', 'dept'])),
            course: normalizeText(pickRowValue(row, ['course'])),
            program: normalizeText(pickRowValue(row, ['program', 'programme', 'study program'])),
            section: normalizeText(pickRowValue(row, ['section'])),
            class_name: normalizeText(pickRowValue(row, ['class_name', 'class name', 'class'])),
            academic_year: pickRowValue(row, ['academic_year', 'academic year', 'year']),
            semester: pickRowValue(row, ['semester', 'sem']),
        };

        const rowErrors = [];

        if (!student.roll_number) rowErrors.push('roll_number is required');
        if (student.roll_number && !/^[A-Z0-9\-/]+$/.test(student.roll_number)) rowErrors.push('roll_number may contain only letters, numbers, - and /');
        if (student.roll_number && student.roll_number.length > 20) rowErrors.push('roll_number must be 20 characters or fewer');
        if (!student.name) rowErrors.push('name is required');
        if (student.name && student.name.length > 255) rowErrors.push('name must be 255 characters or fewer');
        if (!student.department) rowErrors.push('department is required');
        if (!student.course) rowErrors.push('course is required');
        if (!student.program) rowErrors.push('program is required');

        const academicYear = normalizeText(student.academic_year);
        const semester = normalizeText(student.semester);

        if (academicYear) {
            const parsedYear = Number.parseInt(academicYear, 10);
            if (Number.isNaN(parsedYear)) {
                rowErrors.push('academic_year must be numeric');
            } else {
                student.academic_year = parsedYear;
            }
        } else {
            student.academic_year = null;
        }

        if (semester) {
            const parsedSemester = Number.parseInt(semester, 10);
            if (Number.isNaN(parsedSemester)) {
                rowErrors.push('semester must be numeric');
            } else {
                student.semester = parsedSemester;
            }
        } else {
            student.semester = null;
        }

        student.section = student.section || null;
        student.class_name = student.class_name || null;

        if (rowErrors.length > 0) {
            errors.push({ row: rowNumber, errors: rowErrors });
            return;
        }

        entries.push(student);
    });

    return { entries, errors };
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

/**
 * Import student records from spreadsheet rows
 */
exports.importStudents = async (req, res) => {
    const sourceRows = Array.isArray(req.body?.rows)
        ? req.body.rows
        : Array.isArray(req.body?.students)
            ? req.body.students
            : Array.isArray(req.body?.records)
                ? req.body.records
                : [];
    const replaceExisting = req.body?.replace !== false;

    try {
        if (sourceRows.length === 0) {
            return res.status(400).json({ status: 'error', message: 'No student rows were provided for import' });
        }

        const { entries, errors } = parseImportedStudents(sourceRows);
        if (entries.length === 0) {
            return res.status(400).json({
                status: 'error',
                message: 'No valid student rows were found in the spreadsheet',
                errors,
            });
        }

        const scope = getAdminScope(req);
        const adminId = req.user.adminId || null;
        const payload = entries.map((entry) => ({
            ...entry,
            admin_id: adminId,
        }));

        if (replaceExisting) {
            await Student.destroy({ where: scope, truncate: false });
            const createdStudents = await Student.bulkCreate(payload, { validate: true });

            broadcastMessage('STUDENTS_REFRESHED', { count: createdStudents.length });

            return res.json({
                status: 'success',
                message: 'Student spreadsheet imported successfully',
                mode: 'replace',
                imported: createdStudents.length,
                skipped: errors.length,
                errors,
            });
        }

        const createdStudents = await Student.bulkCreate(payload, {
            validate: true,
            updateOnDuplicate: ['name', 'department', 'course', 'program', 'section', 'class_name', 'academic_year', 'semester', 'admin_id'],
        });

        broadcastMessage('STUDENTS_REFRESHED', { count: createdStudents.length });

        return res.json({
            status: 'success',
            message: 'Student spreadsheet imported successfully',
            mode: 'upsert',
            imported: createdStudents.length,
            skipped: errors.length,
            errors,
        });
    } catch (error) {
        logger.error('IMPORT_STUDENTS_ERROR', { error: error.message });
        res.status(500).json({ status: 'error', message: 'Failed to import students from spreadsheet' });
    }
};
