// CLI seeding. Run: npm run seed
import db from './db.js';
import { seedIfEmpty } from './lib/seedData.js';

await db.init();
const res = await seedIfEmpty();
if (res.seeded) {
  console.log('Seed complete. Demo trip id:', res.tripId);
} else {
  console.log('Database already has data — nothing to seed.');
}
console.log('\n  Login with any of:');
console.log('   arjun@demo.in  /  password');
console.log('   priya@demo.in  /  password');
console.log('   karthik@demo.in  /  password');
process.exit(0);
