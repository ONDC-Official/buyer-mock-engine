import express from "express";
import events from "events";
import cors from "cors";
require("dotenv").config();
import { logger } from "./utils/logger";
import { configLoader } from "./configs/index";
import { router } from "./router/route";
const app = express();

const eventEmitter = new events.EventEmitter();

configLoader
  .init()
  .then((data: any) => {
    logger.info("Config loaded successfully.");

    app.use(express.json({ limit: "10mb" }));
    app.use(cors());

    const PORT = process.env.PORT;
    app.use(express.json());

    app.use(router);

    app.listen(PORT, () => {
      logger.info("server listening at port " + PORT);
    });
  })
  .catch((e: any) => {
    console.error("Error loading config file:", e);
  });
