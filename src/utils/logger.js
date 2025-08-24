const pino = require('pino');

const logger = pino({
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname',
      messageKey: 'msg',
      singleLine: true
    }
  },
  level: 'info'
});

module.exports = logger;