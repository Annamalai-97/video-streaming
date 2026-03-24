import amqp, { Channel } from "amqplib";
import dotenv from "dotenv";
import { transcodeVideo } from "./transcoder";

dotenv.config();

const QUEUE_NAME = "transcoding_jobs";
const RABBITMQ_URL = process.env.RABBITMQ_URL || "amqp://localhost:5672";

interface TranscodeJob {
  videoId: string;
  fileName: string;
  filePath: string;
  originalName: string;
  uploadedAt: string;
}

async function connectWithRetry(retries = 5, delay = 3000): Promise<Awaited<ReturnType<typeof amqp.connect>>> {
  for (let i = 0; i < retries; i++) {
    try {
      console.log(`Connecting to RabbitMQ... attempt ${i + 1}`);
      const conn = await amqp.connect(RABBITMQ_URL);
      console.log("Connected to RabbitMQ!");
      return conn;
    } catch (err) {
      console.error(`Connection failed. Retrying in ${delay / 1000}s...`);
      await new Promise((res) => setTimeout(res, delay));
    }
  }
  throw new Error("Could not connect to RabbitMQ after multiple attempts");
}

async function start() {
  const connection = await connectWithRetry();
  const channel: Channel = await connection.createChannel();

  await channel.assertQueue(QUEUE_NAME, { durable: true });
  channel.prefetch(1); // Process one job at a time

  console.log(`Waiting for jobs in queue: ${QUEUE_NAME}`);

  channel.consume(QUEUE_NAME, async (msg) => {
    if (!msg) return;

    let job: TranscodeJob | null = null;

    try {
      job = JSON.parse(msg.content.toString()) as TranscodeJob;
      console.log(`\nReceived job: ${job.videoId}`);
      console.log(`File: ${job.originalName}`);

      await transcodeVideo(job.videoId, job.filePath);

      channel.ack(msg); // Acknowledge success
      console.log(`Job completed: ${job.videoId}`);
    } catch (err) {
      console.error("Job failed:", err);
      channel.nack(msg, false, false); // Don't requeue failed job
    }
  });
}

start().catch((err) => {
  console.error("Transcoder crashed:", err);
  process.exit(1);
});