import { Redis } from 'ioredis';

const redisClient = new Redis({
  host:
    process.env.REDIS_HOST ||
    '127.0.0.1',

  port: Number(
    process.env.REDIS_PORT ||
      6379,
  ),

  password:
    process.env.REDIS_PASSWORD ||
    undefined,

  /*
   * Không làm server dừng ngay khi Redis
   * tạm thời chưa kết nối được.
   */
  maxRetriesPerRequest: null,
});

redisClient.on(
  'connect',
  () => {
    console.log(
      '✅ Đã kết nối tới Redis Server (Sẵn sàng khóa ghế)',
    );
  },
);

redisClient.on(
  'error',
  (error: Error) => {
    console.error(
      '❌ Redis connection error:',
      error.message,
    );
  },
);

export default redisClient;