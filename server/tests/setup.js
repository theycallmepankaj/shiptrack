import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

// Uses MONGO_TEST_URI if set (e.g. a Docker mongo), otherwise an in-memory MongoDB.
let mongo;
export async function startDb() {
  let uri = process.env.MONGO_TEST_URI;
  if (!uri) {
    mongo = await MongoMemoryServer.create();
    uri = mongo.getUri();
  }
  // Separate database per Jest worker so parallel test files don't wipe each other's data.
  await mongoose.connect(uri, { dbName: `shiptrack_test_${process.env.JEST_WORKER_ID ?? 0}` });
}
export async function stopDb() {
  if (!mongo) await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  await mongo?.stop();
}
export async function clearDb() {
  await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
}

/** Booking + payment shortcut for tests that need an assignable (paid) shipment. */
export async function markPaid(id) {
  const { Shipment } = await import('../src/models/Shipment.js');
  await Shipment.updateOne({ _id: id }, { 'payment.status': 'paid', 'payment.provider': 'test', 'payment.paidAt': new Date() });
  return id;
}
