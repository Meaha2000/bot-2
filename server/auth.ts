import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { db } from './db';
import { v4 as uuidv4 } from 'uuid';

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-change-me';

export interface User {
  id: string;
  username: string;
  role: string;
}

export function generateToken(user: User) {
  return jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, {
    expiresIn: '7d',
  });
}

export function verifyToken(token: string): User | null {
  try {
    return jwt.verify(token, JWT_SECRET) as User;
  } catch (err) {
    return null;
  }
}

export async function createUser(username: string, password: string) {
  const hashedPassword = await bcrypt.hash(password, 10);
  // Force ID 1 for admin user to ensure single-user consistency
  const id = username === 'admin' ? '1' : uuidv4();
  
  const stmt = db.prepare('INSERT INTO users (id, username, password) VALUES (?, ?, ?)');
  stmt.run(id, username, hashedPassword);
  
  return { id, username, role: 'admin' };
}

export async function authenticateUser(username: string, password: string) {
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as any;
  
  if (!user) return null;
  
  const isValid = await bcrypt.compare(password, user.password);
  if (!isValid) return null;
  
  return { id: user.id, username: user.username, role: user.role };
}
