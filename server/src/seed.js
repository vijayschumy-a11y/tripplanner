// CLI seeding. Run: npm run seed
import { seedIfEmpty } from './lib/seedData.js';

const res = seedIfEmpty();
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
