process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const router = require("express").Router();
const axios = require("axios");
const {
  getCache,
  insertSession,
  handleRequestForJsonMapper,
} = require("../utils/utils");
const { extractPath } = require("../utils/buildPayload");
const { configLoader } = require("../configs/index");
const logger = require("../utils/logger");

router.get("/cache", async (req, res) => {
  try {
    const response = getCache(req.query.transactionid) || {
      message: "TransactionId does not have any data",
    };
    res.send(response);
  } catch (err) {
    logger.error("/cache  -  ", err);
  }
});

router.post("/mapper/session", (req, res) => {
  const { country, cityCode, transaction_id, configName } = req.body;

  if (!country || !cityCode || !transaction_id || !configName) {
    return res.status(400).send({
      data: "validations failed  country || cityCode || transaction_id || configName missing",
    });
  }

  logger.info("body>>>>> /mapper/session  -  ", req.body);

  try {
    const {
      filteredCalls,
      filteredInput,
      filteredDomain,
      filteredSessiondata,
      filteredAdditionalFlows,
      filteredsummary,
    } = configLoader.getConfigBasedOnFlow(configName);

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
    };

    insertSession(session);
    res.send({ sucess: true, data: session });
  } catch (e) {
    logger.error("Error while creating session  -  ", e);
    res.status(500).send("Internal Server Error");
  }
});

router.post("/mapper/timeout", async (req, res) => {
  const { config, transactionId } = req.body;

  if (!config || !transactionId) {
    return res
      .status(400)
      .send({ data: "validations failed config || transactionid missing" });
  }

  let session = getCache("jm_" + transactionId);

  if (!session) {
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
  return res.status(200).send({ session });
});

router.post("/mapper/extractPath", (req, res) => {
  const { path, obj } = req.body;

  if (!path || !obj) {
    return res.status(400).send({ data: "missing path || obj " });
  }
  try {
    const response = extractPath(path, obj);

    res.send({ response });
  } catch (e) {
    logger.info("Error while extracting path  -  ", e);
    res.status(400).send({ error: true, data: e });
  }
});

router.post("/mapper/repeat", async (req, res) => {
  const { transactionId, config } = req.body;

  if (!transactionId || !config) {
    return res.status(400).send({ data: "missing transactionId || config" });
  }

  let session = getCache("jm_" + transactionId);

  if (!session) {
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

  res.send({ session });
});

router.post("/mapper/addFlow", (req, res) => {
  const { configName, transactionId } = req.body;

  let session = getCache("jm_" + transactionId);

  if (!session) {
    return res.status(400).send({ data: "No session found." });
  }

  const { filteredCalls, filteredInput } =
    configLoader.getConfigBasedOnFlow(configName);

  session.protocolCalls = { ...session.protocolCalls, ...filteredCalls };
  session.input = { ...session.input, ...filteredInput };

  insertSession(session);

  res.send({ session });
});

router.get("/mapper/flows", (_req, res) => {
  const flows = configLoader.getListOfFlow();

  logger.info("Flows", flows);

  res.send({ data: flows });
});

router.post("/mapper/unsolicited", async (req, res) => {
  logger.info("Indise mapper unsolicited");
  const { businessPayload, updatedSession, messageId, response } = req.body;

  if (!businessPayload || !updatedSession || !messageId || !response) {
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

  res.send({ success: true });
});

router.post("/mapper/ondc", async (req, res) => {
  logger.info("Indise mapper config");
  const { businessPayload, updatedSession, messageId, response } = req.body;

  if (!businessPayload || !updatedSession || !messageId || !response) {
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

  res.send({ success: true });
});

router.post("/mapper/:config", async (req, res) => {
  const { transactionId, payload } = req.body;
  const config = req.params.config;
  let session = getCache("jm_" + transactionId);

  logger.info("cofig> ", config);

  if (!session) {
    return res.status(400).send({ message: "No session exists" });
  }

  if (session.protocolCalls[config].type === "form") {
    session.protocolCalls[config] = {
      ...session.protocolCalls[config],
      executed: true,
      shouldRender: true,
      businessPayload: payload,
    };
    session = { ...session, ...payload };

    const nextRequest = session.protocolCalls[config].nextRequest;

    session.protocolCalls[nextRequest] = {
      ...session.protocolCalls[nextRequest],
      shouldRender: true,
    };

    try {
      await axios.post(`${process.env.PROTOCOL_SERVER_BASE_URL}updateSession`, {
        sessionData: payload,
        transactionId: transactionId,
      });
    } catch (e) {
      logger.error(
        "Error while update session for protocol server: ",
        e?.messaage || e
      );
      throw new Error({
        message: "Error while update session for protocol server",
      });
    }

    insertSession(session);

    return res.status(200).send({ session });
  }

  let protocolSession = JSON.parse(JSON.stringify(session));
  delete protocolSession.input;
  delete protocolSession.protocolCalls;

  console.log("sending Transdcaiton ID", transactionId);
  try {
    const response = await axios.post(
      `${process.env.PROTOCOL_SERVER_BASE_URL}createPayload`,
      {
        type: session.protocolCalls[config].type,
        config: config,
        configName: session.configName,
        data: payload,
        transactionId: transactionId,
        target: session.protocolCalls[config].target,
        session: {
          createSession: session.protocolCalls[config].target === "GATEWAY",
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

    console.log("MODE", mode);

    if (mode === "ASYNC") {
      session.protocolCalls[config] = {
        ...session.protocolCalls[config],
        executed: true,
        shouldRender: true,
        becknPayload: becknPayload,
        businessPayload: payload,
        messageId: becknPayload.context.message_id,
        becknResponse: becknReponse,
      };

      const nextRequest = session.protocolCalls[config].nextRequest;

      session.protocolCalls[nextRequest] = {
        ...session.protocolCalls[nextRequest],
        shouldRender: true,
      };
    } else {
      session.protocolCalls[config] = {
        ...session.protocolCalls[config],
        executed: true,
        shouldRender: true,
        becknPayload: becknPayload.action,
        businessPayload: payload,
        messageId: becknPayload.action.context.message_id,
        // becknResponse: becknReponse,
      };

      let nextRequest = session.protocolCalls[config].nextRequest;

      session.protocolCalls[nextRequest] = {
        ...session.protocolCalls[nextRequest],
        executed: true,
        shouldRender: true,
        becknPayload: becknPayload.on_action,
        businessPayload: businessPayload,
        // messageId: becknPayload.action.context.message_id,
        // becknResponse: becknReponse,
      };

      nextRequest = session.protocolCalls[nextRequest].nextRequest;

      if (nextRequest) {
        session.protocolCalls[nextRequest] = {
          ...session.protocolCalls[nextRequest],
          shouldRender: true,
        };
      }
    }

    insertSession(session);

    res.status(200).send({ response: response.data, session });
  } catch (e) {
    logger.error("Error while sending request  -  ", e?.response?.data || e);
    return res.status(500).send({ message: "Error while sending request", e });
  }
});

router.post("/submissionId", async (req, res) => {
  const { url } = req.body;

  try {
    const response = await axios.post(url, {});

    console.log("response", response);

    res.send({ id: response.data.submission_id });
  } catch (e) {
    res.status(400).send({ error: true, message: e.message || e });
  }
});

router.post("/executeTransaction/:transactionId", async (req, res) => {
  const transactionId = req.params.transactionId;

  let session = getCache("jm_" + transactionId);

  session.protocolCalls;
});

module.exports = router;
