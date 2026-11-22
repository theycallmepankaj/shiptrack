// Dev helper until the admin panel (Milestone 6): assigns every BOOKED shipment to the demo driver.
// Usage: npm run assign:demo -w server
import { connectDB, disconnectDB } from '../server/src/config/db.js';
import { Shipment } from '../server/src/models/Shipment.js';
import { User } from '../server/src/models/User.js';
import { assignShipment } from '../server/src/services/assignment.js';

await connectDB();
const driver = await User.findOne({ email: 'driver1@shiptrack.dev' });
if (!driver) {
  console.error('Demo driver not found — run `npm run seed -w server` first.');
} else {
  const booked = await Shipment.find({ status: 'BOOKED' });
  for (const s of booked) {
    await assignShipment(s, driver._id, { role: 'system' });
    console.log(`  ${s.trackingId} → ${driver.name}`);
  }
  console.log(`Assigned ${booked.length} shipment(s).`);
}
await disconnectDB();
