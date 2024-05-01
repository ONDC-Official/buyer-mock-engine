const cache = require("node-cache");
const {
  createAuthorizationHeader,
  isSignatureValid,
} = require("ondc-crypto-sdk-nodejs");
const axios = require("axios");
const { extractBusinessData } = require("./buildPayload");
const myCache = new cache({ stdTTL: 100, checkperiod: 120 });
const logger = require("./logger");

function getCache(key) {
  if (key === undefined || key === "") {
    return myCache.keys();
  }

  return myCache.get(key);
}

const insertSession = (session) => {
  myCache.set("jm_" + session.transaction_id, session, 86400);
};

const handleRequestForJsonMapper = async (
  businessPayload,
  updatedSession,
  messageId,
  sessionId,
  response,
  unsolicited = false
) => {
  const ack = {
    message: {
      ack: {
        status: "ACK",
      },
    },
  };

  let session = getCache("jm_" + sessionId);

  if (!session) {
    logger.info("No session exists");
    return;
  }

  let config = "";
  let currentConfig = "";

  Object.entries(session.protocolCalls).map((item) => {
    const [key, value] = item;
    if (value.messageId === messageId) {
      config = key;
    }

    if (value.shouldRender && !value.executed) {
      currentConfig = value.config;
    }
  });

  // unsolicited
  if (unsolicited) {
    logger.info("unsolicited call", response?.context);

    const action = response?.context?.action;
    if (!session.protocolCalls[action]) {
      return;
    }
    // const { result: businessPayload, session: updatedSession } =
    //   extractBusinessData(
    //     action,
    //     response,
    //     session,
    //     session.protocolCalls[action].protocol
    //   );

    session = { ...session, ...updatedSession };

    session.protocolCalls[currentConfig] = {
      ...session.protocolCalls[currentConfig],
      unsolicited: {
        config: action,
        type: action,
        executed: true,
        shouldRender: true,
        becknPayload: [response],
        businessPayload: [businessPayload],
        becknResponse: [ack],
      },
    };

    insertSession(session);
    return;
  }

  console.log("got config", config);

  let nextRequest = session.protocolCalls[config]?.nextRequest;

  if (!nextRequest) {
    null;
  }

  // const { result: businessPayload, session: updatedSession } =
  //   extractBusinessData(
  //     nextRequest,
  //     response,
  //     session,
  //     session.protocolCalls[nextRequest].protocol
  //   );

  session = { ...session, ...updatedSession };

  session.protocolCalls[nextRequest] = {
    ...session.protocolCalls[nextRequest],
    executed: true,
    shouldRender: true,
    becknPayload: [
      ...(session.protocolCalls[nextRequest].becknPayload || []),
      response,
    ],
    businessPayload: [
      ...(session.protocolCalls[nextRequest].businessPayload || []),
      businessPayload,
    ],
    becknResponse: [
      ...(session.protocolCalls[nextRequest].becknResponse || []),
      ack,
    ],
  };

  const thirdRequest = session.protocolCalls[nextRequest].nextRequest;
  if (thirdRequest) {
    session.protocolCalls[thirdRequest].shouldRender = true;
  }

  insertSession(session);
};

module.exports = {
  getCache,
  insertSession,
  handleRequestForJsonMapper,
};
