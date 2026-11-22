import mongoose from 'mongoose';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

export async function connectDB(uri = env.MONGO_URI) {
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri);
  logger.info(`MongoDB connected: ${mongoose.connection.host}/${mongoose.connection.name}`);
}

export const disconnectDB = () => mongoose.disconnect();
