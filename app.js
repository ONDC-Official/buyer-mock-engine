const express = require("express");
const bodyParser = require("body-parser");
const events = require("events");
const app = express();
const cors = require("cors");
require("dotenv").config();
const logger = require("./utils/logger");
const { configLoader } = require("./configs/index");

const eventEmitter = new events.EventEmitter();

configLoader
  .init()
  .then((data) => {
    logger.info("Config loaded successfully.");

    app.use(bodyParser.json({ limit: "10mb" }));
    app.use(cors());

    const router = require("./router/route");

    const PORT = process.env.PORT;
    app.use(express.json());

    app.use(router);

    app.listen(PORT, () => {
      logger.info("server listening at port " + PORT);
    });
  })
  .catch((e) => {
    console.error("Error loading config file:", e);
  });
