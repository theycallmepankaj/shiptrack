// Seeds the demo accounts (requirements §16). Usage: npm run seed -w server
// Later milestones extend this with historical shipments for the ETA model.
import { connectDB, disconnectDB } from '../server/src/config/db.js';
import { seedDemoAccounts, seedDemoShipments, DEMO_ACCOUNTS } from '../server/src/utils/seedDemo.js';
import { seedHistory } from '../server/src/utils/seedHistory.js';

await connectDB();
const created = await seedDemoAccounts();
await seedDemoShipments();
await seedHistory();
console.log(`Done — ${created} new account(s). Demo logins:`);
for (const a of DEMO_ACCOUNTS) console.log(`  ${a.role.padEnd(8)} ${a.email} / ${a.password}`);
console.log('  (plus driver2…driver8@shiptrack.dev / Driver@123)');
await disconnectDB();
