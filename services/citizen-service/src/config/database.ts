import mongoose from 'mongoose';

const MAX_RETRIES = 10;
const RETRY_INTERVAL_MS = 5000;

/**
 * Connects to MongoDB with exponential-style retry logic.
 * Retries up to MAX_RETRIES times, waiting RETRY_INTERVAL_MS between each attempt.
 */
export async function connectDatabase(uri: string): Promise<void> {
  let attempt = 0;

  while (attempt < MAX_RETRIES) {
    attempt++;
    try {
      await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 5000,
      });
      console.log(`[citizen-service] MongoDB connected successfully on attempt ${attempt}.`);
      return;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[citizen-service] MongoDB connection attempt ${attempt}/${MAX_RETRIES} failed: ${message}`,
      );

      if (attempt >= MAX_RETRIES) {
        console.error('[citizen-service] Max MongoDB connection retries reached. Exiting.');
        process.exit(1);
      }

      console.log(`[citizen-service] Retrying in ${RETRY_INTERVAL_MS / 1000}s...`);
      await new Promise((resolve) => setTimeout(resolve, RETRY_INTERVAL_MS));
    }
  }
}
