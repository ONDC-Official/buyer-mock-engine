process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
import express from "express";
export const router = express.Router();
import axios from "axios";
import { v4 as uuidv4 } from "uuid";
import {
  getCache,
  insertSession,
  handleRequestForJsonMapper,
  updateProtocolSessionToAdditionalFlows,
  findPaylaodAgainstMessageId,
} from "../utils/utils";
import { extractPath } from "../utils/buildPayload";
import { configLoader } from "../configs/index";
import { logger } from "../utils/logger";
import { eventEmitter } from "../utils/eventEmitter";
import { Request, Response } from "express";

router.get("/cache", async (req: Request, res: Response) => {
  const logID = uuidv4();
  logger.info("/cache api controller", { uuid: logID });
  try {
    if (typeof req.query.transactionid !== "string") {
      const allCache = getCache("") || {
        message: "TransactionId does not have any data",
      };

      return res.status(200).send(allCache);
    }
    const response = getCache(req.query.transactionid) || {
      message: "TransactionId does not have any data",
    };
    res.send(response);
    logger.info("/cache api executed", { uuid: logID });
  } catch (err) {
    logger.error(`/cache  error - ${err}`, { uuid: logID });
  }
});

router.get("/event/unsolicited", (req: Request, res: Response) => {
  const logID = uuidv4();
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const onNewEvent = (data: any) => {
    logger.info("/event/unsolicited executed", { uuid: logID });
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  eventEmitter.on("unsolicitedCall", onNewEvent);

  req.on("close", () => {
    eventEmitter.removeListener("unsolicitedCall", onNewEvent);
  });
});

router.post("/mapper/session", (req: Request, res: Response) => {
  const logID = uuidv4();
  logger.info("/mapper/session api controller", { uuid: logID });
  const { country, cityCode, transaction_id, configName, additionalFlow } =
    req.body;

  logger.debug(`/mapper/session payload  ${JSON.stringify(req.body)}`, {
    uuid: logID,
  });

  if (!country || !cityCode || !transaction_id || !configName) {
    logger.error(
      "validations failed  country || cityCode || transaction_id || configName missing",
      { uuid: logID }
    );
    return res.status(400).send({
      data: "validations failed  country || cityCode || transaction_id || configName missing",
    });
  }

  try {
    const {
      filteredCalls,
      filteredInput,
      filteredDomain,
      filteredSessiondata,
      filteredAdditionalFlows,
      filteredsummary,
      additionalFlowConfig,
    } = configLoader.getConfigBasedOnFlow(configName, additionalFlow);

    const session = {
      ...req.body,
      ttl: "PT10M",
      domain: filteredDomain,
      summary: filteredsummary,
      ...filteredSessiondata,
      currentTransactionId: transaction_id,
      transactionIds: [transaction_id],
      input: filteredInput,
      protocolCalls: filteredCalls,
      additioalFlows: filteredAdditionalFlows,
      additionalFlowConfig: additionalFlowConfig,
    };

    insertSession(session);
    logger.info("/mapper/session api executed", { uuid: logID });
    res.send({ sucess: true, data: session });
  } catch (e) {
    logger.error(`/mapper/session error - ${e}`, { uuid: logID });
    res.status(500).send("Internal Server Error");
  }
});

router.post("/mapper/timeout", async (req: Request, res: Response) => {
  const logID = uuidv4();
  logger.info(`${req.body?.transactionId} - /mapper/timeout api controller`, {
    uuid: logID,
  });
  const { config, transactionId } = req.body;

  logger.debug(
    `${transactionId} - /mapper/timeout api payload - ${JSON.stringify(
      req.body
    )}`,
    { uuid: logID }
  );

  if (!config || !transactionId) {
    logger.error("validations failed config || transactionid missing", {
      uuid: logID,
    });
    return res
      .status(400)
      .send({ data: "validations failed config || transactionid missing" });
  }

  let session = getCache("jm_" + transactionId);

  if (!session) {
    logger.error("No session found.", { uuid: logID });
    return res.status(400).send({ data: "No session found." });
  }

  session.protocolCalls[config].shouldRender = false;
  const preConfig = session.protocolCalls[config].preRequest;

  session.protocolCalls[preConfig] = {
    ...session.protocolCalls[preConfig],
    executed: false,
    shouldRender: true,
    becknPayload: null,
    businessPayload: null,
    messageId: null,
  };

  insertSession(session);
  logger.info("/mapper/timeout api executed", { uuid: logID });
  return res.status(200).send({ session });
});

router.post("/mapper/extractPath", (req: Request, res: Response) => {
  const logID = uuidv4();
  logger.info(`/mapper/extractPath api controller`, { uuid: logID });
  const { path, obj } = req.body;

  logger.debug(
    `/mapper/extractPath api payload - ${JSON.stringify(req.body)}`,
    { uuid: logID }
  );

  if (!path || !obj) {
    logger.error("missing path || obj", { uuid: logID });
    return res.status(400).send({ data: "missing path || obj" });
  }
  try {
    const response = extractPath(path, obj);

    logger.info(`/mapper/extractPath api executed`, { uuid: logID });
    res.send({ response });
  } catch (e) {
    logger.info(`/mapper/extractPath error  - ${e}`, { uuid: logID });
    res.status(400).send({ error: true, data: e });
  }
});

router.post("/mapper/repeat", async (req: Request, res: Response) => {
  const logID = uuidv4();
  logger.info(`${req.body?.transactionId} - /mapper/repeat api controller`, {
    uuid: logID,
  });
  const { transactionId, config } = req.body;

  logger.debug(
    `${transactionId} - /mapper/repeat api payload - ${JSON.stringify(
      req.body
    )}`,
    { uuid: logID }
  );

  if (!transactionId || !config) {
    logger.error("missing transactionId || config", { uuid: logID });
    return res.status(400).send({ data: "missing transactionId || config" });
  }

  let session = getCache("jm_" + transactionId);

  if (!session) {
    logger.error("No session found.", { uuid: logID });
    return res.status(400).send({ data: "No session found." });
  }

  session.protocolCalls[config] = {
    ...session.protocolCalls[config],
    becknPayload: null,
    businessPayload: null,
    messageId: null,
    executed: false,
    shouldRender: true,
  };

  let nextConfig = session.protocolCalls[config].nextRequest;

  while (nextConfig) {
    if (
      !session.protocolCalls[nextConfig].shouldRender &&
      !session.protocolCalls[nextConfig].executed
    )
      break;

    session.protocolCalls[nextConfig] = {
      ...session.protocolCalls[nextConfig],
      becknPayload: null,
      businessPayload: null,
      messageId: null,
      executed: false,
      shouldRender: false,
    };

    nextConfig = session.protocolCalls[nextConfig].nextRequest;
  }

  insertSession(session);

  logger.info(`${req.body?.transactionId} - /mapper/repeat api executed`, {
    uuid: logID,
  });
  res.send({ session });
});

router.post("/mapper/addFlow", (req: Request, res: Response) => {
  const logID = uuidv4();
  logger.info(`${req.body?.transactionId} - /mapper/addFlow api controller`, {
    uuid: logID,
  });
  const { configName, transactionId } = req.body;

  logger.debug(
    `${
      req.body?.transactionId
    } - /mapper/addFlow api payload - ${JSON.stringify(req.body)}`,
    { uuid: logID }
  );

  let session = getCache("jm_" + transactionId);

  if (!session) {
    logger.error(`/mapper/addFlow error - No session found.`, { uuid: logID });
    return res.status(400).send({ data: "No session found." });
  }

  const { filteredCalls, filteredInput } =
    configLoader.getConfigBasedOnFlow(configName);

  session.protocolCalls = { ...session.protocolCalls, ...filteredCalls };
  session.input = { ...session.input, ...filteredInput };

  insertSession(session);

  logger.info(`${transactionId} - /mapper/addFlow api controller`, {
    uuid: logID,
  });
  res.send({ session });
});

router.get("/mapper/flows", (_req: Request, res: Response) => {
  const logID = uuidv4();
  logger.info("/mapper/flow api controller", { uuid: logID });
  const flows = configLoader.getListOfFlow();

  logger.info("/mapper/flow api executed", { uuid: logID });
  res.send({ data: flows });
});

router.get(
  "/mapper/additionalFlows/:configName",
  (req: Request, res: Response) => {
    const logID = uuidv4();
    logger.info("/mapper/additionalFlows/:configName api controller", {
      uuid: logID,
    });
    const configName = req.params.configName;
    logger.debug(
      `/mapper/additionalFlows/:configName api params - ${configName}`,
      { uuid: logID }
    );

    const additionalFlows = configLoader.getListOfAdditionalFlows(configName);

    logger.info("/mapper/additionalFlows/:configName api executed", {
      uuid: logID,
    });
    res.send({ data: additionalFlows });
  }
);

router.post("/mapper/unsolicited", async (req: Request, res: Response) => {
  const logID = uuidv4();
  logger.info(
    `${req.body?.updatedSession?.transaction_id} - /mapper/unsolicited api controller`,
    { uuid: logID }
  );
  const { businessPayload, updatedSession, messageId, response } = req.body;

  logger.debug(
    `${
      req.body?.updatedSession?.transaction_id
    } - /mapper/unsolicited api payload - ${JSON.stringify(req.body)}`,
    { uuid: logID }
  );

  if (!businessPayload || !updatedSession || !messageId || !response) {
    logger.error(
      "businessPayload || updatedSession|| response || messageId not present",
      { uuid: logID }
    );
    return res.status(400).send({
      message:
        "businessPayload || updatedSession|| response || messageId not present",
    });
  }

  handleRequestForJsonMapper(
    businessPayload,
    updatedSession,
    messageId,
    updatedSession?.transaction_id,
    response,
    true
  );

  logger.info(
    `${updatedSession?.transaction_id} - /mapper/unsolicited api controller executed`,
    { uuid: logID }
  );
  res.send({ success: true });
});

router.post("/mapper/ondc", async (req: Request, res: Response) => {
  const logID = uuidv4();
  logger.info(
    `${req.body?.updatedSession?.transaction_id} - /mapper/ondc api controller`,
    { uuid: logID }
  );
  const { businessPayload, updatedSession, messageId, response } = req.body;

  logger.debug(
    `${
      req.body?.updatedSession?.transaction_id
    } - /mapper/ondc api payload - ${JSON.stringify(req.body)}`,
    { uuid: logID }
  );

  if (!businessPayload || !updatedSession || !messageId || !response) {
    logger.error(
      "businessPayload || updatedSession || response || messageId not present",
      { uuid: logID }
    );
    return res.status(400).send({
      message:
        "businessPayload || updatedSession || response || messageId not present",
    });
  }

  handleRequestForJsonMapper(
    businessPayload,
    updatedSession,
    messageId,
    updatedSession?.transaction_id,
    response
  );

  logger.info(
    `${updatedSession?.transaction_id} - /mapper/ondc api controller executed`,
    { uuid: logID }
  );
  res.send({ success: true });
});

router.post("/mapper/:config", async (req: Request, res: Response) => {
  const logID = uuidv4();
  logger.info(`${req.body?.transactionId} - /mapper/:config api controller`, {
    uuid: logID,
  });
  const { transactionId, payload } = req.body;
  logger.debug(
    `${transactionId} /mapper/:config api payload - ${JSON.stringify(
      req.body
    )}`,
    { uuid: logID }
  );
  const config = req.params.config;
  let session = getCache("jm_" + transactionId);

  logger.info(
    `${req.body?.transactionId} - /mapper/:config api params - config : ${config}`,
    { uuid: logID }
  );

  if (!session) {
    logger.error(
      `${transactionId} - /mapper/:config error - No session exists`,
      { uuid: logID }
    );
    return res.status(400).send({ message: "No session exists" });
  }

  const isAdditionalFlowActive = session.additionalFlowActive;
  const protocolCalls = session.additionalFlowActive
    ? session.additionalFlowConfig.protocolCalls
    : session.protocolCalls;

  if (protocolCalls[config].type === "form") {
    protocolCalls[config] = {
      ...protocolCalls[config],
      executed: true,
      shouldRender: true,
      businessPayload: payload,
    };
    session = { ...session, ...payload };

    const nextRequest = protocolCalls[config].nextRequest;

    protocolCalls[nextRequest] = {
      ...protocolCalls[nextRequest],
      shouldRender: true,
    };

    try {
      await axios.post(`${process.env.PROTOCOL_SERVER_BASE_URL}updateSession`, {
        sessionData: payload,
        transactionId: transactionId,
      });
    } catch (e: any) {
      logger.error(
        `${transactionId} - /mapper/:config - Error while update session for protocol server: ${
          e?.messaage || e
        }`,
        { uuid: logID }
      );
      throw new Error("Error while update session for protocol server");
    }

    if (isAdditionalFlowActive) {
      session.additionalFlowConfig.protocolCalls = protocolCalls;
    } else {
      session.protocolCalls = protocolCalls;
    }

    insertSession(session);

    logger.info(`${transactionId} - /mapper/:config api executed`, {
      uuid: logID,
    });
    return res.status(200).send({ session });
  }

  let protocolSession = JSON.parse(JSON.stringify(session));
  delete protocolSession.input;
  delete protocolSession.protocolCalls;

  if (protocolCalls[config].target === "GATEWAY") {
    delete protocolSession.bpp_id;
  } else {
    payload.bpp_id = protocolSession.bpp_id;
  }

  try {
    const response = await axios.post(
      `${process.env.PROTOCOL_SERVER_BASE_URL}createPayload`,
      {
        type: protocolCalls[config].type,
        config: protocolCalls[config].type,
        configName: session.configName,
        data: payload,
        transactionId: transactionId,
        target: protocolCalls[config].target,
        session: {
          createSession:
            protocolCalls[config].target === "GATEWAY" ||
            protocolCalls[config].type === "settle",
          data: protocolSession,
        },
      }
    );

    let mode = "SYNC";

    const { becknPayload, updatedSession, becknReponse, businessPayload } =
      response.data.message;

    if (!businessPayload) {
      mode = "ASYNC";
    }

    session = { ...session, ...updatedSession, ...payload };

    // incase session is updated by unsolicited call
    const updatedLocalSession = getCache("jm_" + transactionId);

    session = { ...session, ...updatedLocalSession };

    if (mode === "ASYNC") {
      protocolCalls[config] = {
        ...protocolCalls[config],
        executed: true,
        shouldRender: true,
        becknPayload: becknPayload,
        businessPayload: payload,
        messageId: becknPayload.context.message_id,
        becknResponse: becknReponse,
      };

      const nextRequest = protocolCalls[config].nextRequest;

      protocolCalls[nextRequest] = {
        ...protocolCalls[nextRequest],
        shouldRender: true,
      };
    } else {
      protocolCalls[config] = {
        ...protocolCalls[config],
        executed: true,
        shouldRender: true,
        becknPayload: becknPayload.action,
        businessPayload: payload,
        messageId: becknPayload.action.context.message_id,
        // becknResponse: becknReponse,
      };

      let nextRequest = protocolCalls[config].nextRequest;

      protocolCalls[nextRequest] = {
        ...protocolCalls[nextRequest],
        executed: true,
        shouldRender: true,
        becknPayload: findPaylaodAgainstMessageId(
          becknPayload.on_action,
          becknPayload.action.context.message_id
        ),
        businessPayload: findPaylaodAgainstMessageId(
          businessPayload,
          becknPayload.action.context.message_id
        ),
        // messageId: becknPayload.action.context.message_id,
        // becknResponse: becknReponse,
      };

      nextRequest = protocolCalls[nextRequest].nextRequest;

      if (nextRequest) {
        if (protocolCalls[nextRequest].isSkipable) {
        }
        protocolCalls[nextRequest] = {
          ...protocolCalls[nextRequest],
          shouldRender: true,
        };
      } else {
        // case when transaction is complete
        // check for additional flows
        // if exists continue with additional flows

        if (session?.additionalFlowConfig) {
          session.additionalFlowActive = true;

          session.additionalFlowConfig.protocolCalls[
            session.additionalFlowStartPoint
          ].shouldRender = true;
        }

        updateProtocolSessionToAdditionalFlows(session);
      }
    }

    if (isAdditionalFlowActive) {
      session.additionalFlowConfig.protocolCalls = protocolCalls;
    } else {
      session.protocolCalls = protocolCalls;
    }

    insertSession(session);

    logger.info(`${transactionId} - /mapper/:config api executed`, {
      uuid: logID,
    });
    res.status(200).send({ response: response.data, session });
  } catch (e: any) {
    logger.error(
      `${transactionId} - /mapper/:config - Error while sending request  -  ${
        e?.response?.data || e
      }`,
      { uuid: logID }
    );
    return res.status(500).send({
      message: `Error while sending request - ${e?.response?.data || e}`,
    });
  }
});
