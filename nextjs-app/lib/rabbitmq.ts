import amqp, {  Channel } from "amqplib";

let connection: Awaited<ReturnType<typeof amqp.connect>> | null = null;
let channel: Channel | null = null;

const QUEUE_NAME = "transcoding_jobs";

export async function getRabbitMQChannel(): Promise<Channel> {
  if (channel) return channel;

const conn = await amqp.connect(process.env.RABBITMQ_URL || "amqp://localhost:5672");
connection = conn;
channel = await conn.createChannel();
  await channel.assertQueue(QUEUE_NAME, { durable: true });

  return channel;
}

export async function publishJob(payload: object): Promise<void> {
  const ch = await getRabbitMQChannel();
  ch.sendToQueue(
    QUEUE_NAME,
    Buffer.from(JSON.stringify(payload)),
    { persistent: true }
  );
}

export { QUEUE_NAME };  