import winston, { format, transports } from "winston";
import LokiTransport from "winston-loki";
require("winston-daily-rotate-file");

// const config = require('../config.json');
let envLocation = process.env.NODE_ENV || "development";
let environment = process.env.env || "development";
environment = environment.trim();
const { combine, timestamp, printf, colorize } = format;

const myFormat = printf(({ level, message, timestamp, uuid }) => {
  return `[${uuid}] [${timestamp}] [${level}]: ${message}`;
});

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.combine(
    winston.format.timestamp({
      format: "YYYY-MM-DD HH:mm:ss",
    }),
    winston.format.json()
  ),
  defaultMeta: { service: process.env.app_name },
  transports: [
    new LokiTransport({
      host: process.env.LOKI_HOST as string,
      labels: { app: process.env.LOKI_APP_NAME || `infra_${envLocation}` },
      json: true,
      format: format.json(),
      replaceTimestamp: true,
      onConnectionError: (err: any) => logger.error(err),
    }),
    new transports.Console({
      format: combine(timestamp(), colorize(), myFormat),
    }),
  ],
});

//
// If we're not in production then log to the `console` with the format:
// `${info.level}: ${info.message} JSON.stringify({ ...rest }) `
//
// if (process.env.env !== "production") {
//   logger.add(
//     new winston.transports.Console({
//       format: winston.format.combine(
//         winston.format.timestamp({
//           format: "YYYY-MM-DD HH:mm:ss",
//         }),
//         winston.format.simple()
//       ),
//     })
//   );
// }
