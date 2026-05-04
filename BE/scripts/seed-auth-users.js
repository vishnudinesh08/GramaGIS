import 'dotenv/config';
import { dbQuery, hasDbConfig, pool } from '../db.js';
import { hashPassword, normalizeUsername } from '../config/auth.js';

function firstEnv(...keys) {
  for (const key of keys) {
    const value = process.env[key];
    if (typeof value === 'string' && value.trim() !== '') {
      return value.trim();
    }
  }
  return '';
}

function getUsersFromEnv() {
  const users = [];

  const superadminUsername = firstEnv('AUTH_BOOTSTRAP_SUPERADMIN_USERNAME');
  const superadminPassword = firstEnv('AUTH_BOOTSTRAP_SUPERADMIN_PASSWORD');
  if (superadminUsername && superadminPassword) {
    users.push({
      username: normalizeUsername(superadminUsername),
      passwordHash: hashPassword(superadminPassword),
      role: 'superadmin',
      displayName: firstEnv('AUTH_BOOTSTRAP_SUPERADMIN_DISPLAY_NAME') || 'Super Admin'
    });
  }

  const editorUsername = firstEnv('AUTH_BOOTSTRAP_EDITOR_USERNAME');
  const editorPassword = firstEnv('AUTH_BOOTSTRAP_EDITOR_PASSWORD');
  if (editorUsername && editorPassword) {
    users.push({
      username: normalizeUsername(editorUsername),
      passwordHash: hashPassword(editorPassword),
      role: 'editor',
      displayName: firstEnv('AUTH_BOOTSTRAP_EDITOR_DISPLAY_NAME') || 'Editor'
    });
  }

  return users;
}

async function main() {
  if (!hasDbConfig()) {
    throw new Error('Database is not configured. Set DATABASE_URL or PG* variables in BE/.env.');
  }

  const users = getUsersFromEnv();
  if (!users.length) {
    throw new Error('No bootstrap users configured in environment variables.');
  }

  for (const user of users) {
    await dbQuery(
      `INSERT INTO login (username, password_hash, role, display_name)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (username)
       DO UPDATE SET
         password_hash = EXCLUDED.password_hash,
         role = EXCLUDED.role,
         display_name = EXCLUDED.display_name,
         is_active = TRUE,
         updated_at = now()`,
      [user.username, user.passwordHash, user.role, user.displayName]
    );
  }

  console.log(`Seeded ${users.length} user(s) into login.`);
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
