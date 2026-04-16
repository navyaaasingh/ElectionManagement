import { api } from './client.js';

export async function getStudents() {
  return api.get('/api/v1/students');
}

export async function getStudentById(id) {
  return api.get(`/api/v1/students/${id}`);
}

export async function createStudent(payload) {
  return api.post('/api/v1/students', payload);
}

export async function updateStudent(id, payload) {
  return api.put(`/api/v1/students/${id}`, payload);
}

export async function deleteStudent(id) {
  return api.delete(`/api/v1/students/${id}`);
}

export async function forceSeedStudents() {
  return api.post('/api/v1/students/seed');
}

export async function importStudents(payload) {
  return api.post('/api/v1/students/import', payload);
}
