
import { createUser } from '../server/auth';
import { db } from '../server/db';

async function main() {
  const username = 'admin';
  const password = '@Cairo3162';

  try {
    // Check if user exists first to update password if needed
    const existing = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    
    if (existing) {
        console.log('User admin already exists. Updating password...');
        const bcrypt = await import('bcryptjs');
        const hashedPassword = await bcrypt.default.hash(password, 10);
        db.prepare('UPDATE users SET password = ? WHERE username = ?').run(hashedPassword, username);
        console.log('Password updated successfully.');
    } else {
        console.log('Creating new admin user...');
        await createUser(username, password);
        console.log('User created successfully.');
    }
  } catch (e) {
    console.error('Error:', e);
  }
}

main();
