const Redis = require('ioredis');

const redisClient = new Redis({
  host: process.env.REDIS_HOST || 'redis',
  port: process.env.REDIS_PORT || 6379,
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  }
});

redisClient.on('connect', () => {
  console.log('✅ Redis conectado com sucesso');
});

redisClient.on('error', (err) => {
  console.error('❌ Erro na conexão Redis:', err);
});

module.exports = redisClient;