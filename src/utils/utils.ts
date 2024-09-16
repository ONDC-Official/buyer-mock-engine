import cache from "node-cache";
import axios from "axios";
const myCache = new cache({ stdTTL: 100, checkperiod: 120 });
import { logger } from "./logger";
import { eventEmitter } from "./eventEmitter";

export function getCache(key: string | undefined): any {
  if (key === undefined || key === "") {
    return myCache.keys();
  }

  return myCache.get(key);
}

export const insertSession = (session: any) => {
  myCache.set("jm_" + session.transaction_id, session, 86400);
};

export const handleRequestForJsonMapper = async (
  businessPayload: Record<string, any>,
  updatedSession: any,
  messageId: string,
  sessionId: string,
  response: any,
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

  const protocolCalls = session.additionalFlowActive
    ? session.additionalFlowConfig.protocolCalls
    : session.protocolCalls;

  const protocolCallsEntries = Object.entries(protocolCalls);

  protocolCallsEntries.map((item: any, index) => {
    const [key, value] = item;
    if (value.messageId === messageId) {
      config = key;
    }

    if (value.shouldRender && !value.executed) {
      currentConfig = value.config;
    }

    // case for when all calls are executed
    if (index === protocolCallsEntries.length - 1 && currentConfig === "") {
      currentConfig = value.config;
    }
  });

  // unsolicited
  if (unsolicited) {
    logger.info("unsolicited call", response?.context);

    const action = response?.context?.action;
    if (!protocolCalls[action]) {
      return;
    }

    session = { ...session, ...updatedSession };

    protocolCalls[currentConfig] = {
      ...protocolCalls[currentConfig],
      unsolicited: [
        ...(protocolCalls[currentConfig].unsolicited || []),
        {
          config: action,
          type: action,
          executed: true,
          shouldRender: true,
          becknPayload: [response],
          businessPayload: [businessPayload],
          becknResponse: [ack],
        },
      ],
    };

    const eventData = session;
    eventEmitter.emit("unsolicitedCall", eventData);

    insertSession(session);
    return;
  }

  let nextRequest = protocolCalls[config]?.nextRequest;

  if (!nextRequest) {
    null;
  }

  session = { ...session, ...updatedSession };

  protocolCalls[nextRequest] = {
    ...protocolCalls[nextRequest],
    executed: true,
    shouldRender: true,
    becknPayload: [
      ...(protocolCalls[nextRequest]?.becknPayload || []),
      response,
    ],
    businessPayload: [
      ...(protocolCalls[nextRequest]?.businessPayload || []),
      businessPayload,
    ],
    becknResponse: [...(protocolCalls[nextRequest]?.becknResponse || []), ack],
  };

  const thirdRequest = protocolCalls[nextRequest]?.nextRequest;
  let isAdditionalFlowActive = false;
  if (thirdRequest) {
    if (
      protocolCalls[thirdRequest].isSkipable &&
      eval(protocolCalls[thirdRequest].isSkipable.condition)
    ) {
      protocolCalls[
        protocolCalls[thirdRequest].isSkipable.nextRequest
      ].shouldRender = true;
    } else {
      protocolCalls[thirdRequest].shouldRender = true;
    }
  } else {
    // case when transaction is complete
    // check for additional flows
    // if exists continue with additional flows

    if (session?.additionalFlowConfig) {
      isAdditionalFlowActive = true;
      // session.additionalFlowActive = true;

      session.additionalFlowConfig.protocolCalls[
        session.additionalFlowStartPoint
      ].shouldRender = true;
    }
  }

  if (session.additionalFlowActive) {
    session.additionalFlowConfig.protocolCalls = protocolCalls;
  } else {
    session.protocolCalls = protocolCalls;
  }

  if (isAdditionalFlowActive) {
    session.additionalFlowActive = true;
    updateProtocolSessionToAdditionalFlows(session);
  }

  insertSession(session);
};

export const updateProtocolSessionToAdditionalFlows = async (session: any) => {
  session.configName = session.additionalFlowConfig.configName;

  try {
    await axios.post(`${process.env.PROTOCOL_SERVER_BASE_URL}updateSession`, {
      sessionData: session,
      transactionId: session.transaction_id,
    });
  } catch (e: any) {
    logger.error(
      "Error while update session for protocol server: ",
      e?.messaage || e
    );
    throw new Error("Error while update session for protocol server");
  }
};

export const findPaylaodAgainstMessageId = (
  payload: Record<string, any>,
  msg_id: any
) => {
  let filteredPaylaod = null;

  payload.map((item: any) => {
    if (item.context.message_id === msg_id) {
      filteredPaylaod = item;
    }
  });

  return [filteredPaylaod];
};
