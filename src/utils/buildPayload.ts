import { v4 as uuidv4 } from "uuid";
import { logger } from "./logger";

// function used inside eval function
const buildTags = (tags: any) => {
  return Object.keys(tags).map((key) => {
    const subObject = tags[key];
    const list = Object.keys(subObject).map((subKey) => {
      const value = subObject[subKey];
      return {
        descriptor: {
          code: subKey,
        },
        value: typeof value === "string" ? value : value.toString(),
      };
    });

    return {
      descriptor: {
        code: key,
      },
      //   display: false,
      list: list,
    };
  });
};

const createNestedField = (obj: any, path: string, value: any) => {
  const keys = path.split(".");
  let currentObj = obj;

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    const isArrayIndex = /\[\d+\]/.test(key); // Check if the key represents an array index

    if (isArrayIndex) {
      const arrayKey = key.substring(0, key.indexOf("["));
      const extract = key.match(/\[(\d+)\]/);
      if (!extract) {
        throw new Error("Invalid array index");
      }
      const index = parseInt(extract[1], 10);

      if (!currentObj[arrayKey]) {
        currentObj[arrayKey] = [];
      }

      if (!currentObj[arrayKey][index]) {
        currentObj[arrayKey][index] = {};
      }

      currentObj = currentObj[arrayKey][index];
    } else {
      if (!currentObj[key]) {
        currentObj[key] = {};
      }
      currentObj = currentObj[key];
    }
  }

  currentObj[keys[keys.length - 1]] = value;
};

const createPayload = (
  config: any,
  action: string,
  data: any,
  session: any
) => {
  const payload = {};
  const startPoint = "START";
  const endPoint = "END";
  const cancelName = "Ride Cancellation";
  const successStatus = "SUCCESS";
  const fulfillmentText = "fulfillment";
  const messageId = uuidv4();
  const paymentId = uuidv4();
  const timestamp = new Date().toISOString();
  const newTranscationId = uuidv4();

  config.map((item: any) => {
    if (eval(item.value) && (item.check ? eval(item.check) : true))
      createNestedField(
        payload,
        item.beckn_key,
        item.compute ? eval(item.compute) : eval(item.value)
      );
  });

  return payload;
};

const constructValueObject = (data: string, key = "business_key") => {
  const dataArray = data.split(",").map((val: string) => val.trim());
  let objArray: any[] = [];

  dataArray.forEach((item) => {
    const obj: any = {};
    const itemArray = item.split(":").map((val) => val.trim());
    obj[key] = itemArray[0];
    const value = "obj." + itemArray[1];
    obj["value"] = value.split(".").join("?.");
    objArray.push(obj);
  });

  return objArray;
};

const constructPath = (data: string) => {
  if (data.startsWith(".")) {
    data = data.substring(1, data.length);
  }

  data = "obj." + data;
  return data.split(".").join("?.");
};

const decodeInputString = (input: string) => {
  const tokens = input
    .split(/([\[\]\{\}])/)
    .filter((token) => token.trim() !== "");

  if (tokens.length === 1) {
    return "obj?." + tokens[0].split(".").join("?.");
  }

  let i = 0;
  let initalConfig: {
    path?: string;
    type?: string;
    value?: any;
    commanData?: any;
    check?: string;
  } = {};
  let currentConfig = initalConfig;
  let lastTokenSquareBracket = false;
  let lastTokenCurlyBracket = false;

  while (i < tokens.length) {
    if (lastTokenSquareBracket) {
      if (tokens[i] === "]") {
        currentConfig.type = "Array";
        lastTokenSquareBracket = false;

        if (tokens[i + 1] !== "{") {
          currentConfig.value = {};
          currentConfig = currentConfig.value;
        }
      } else {
        currentConfig.check =
          "_?." + tokens[i].substring(2, tokens[i].length - 1);
      }
    } else if (lastTokenCurlyBracket) {
      if (tokens[i] === "}") {
        if (i === tokens.length - 1) {
          if (!currentConfig.value) {
            currentConfig.value = {};
          }
          currentConfig.value.type = "Object";
          currentConfig.value.value = constructValueObject(
            tokens[i - 1],
            "key"
          );
          currentConfig = currentConfig.value;
        } else {
          currentConfig.commanData = constructValueObject(tokens[i - 1]);
          currentConfig.value = {};
          currentConfig = currentConfig.value;
        }
        lastTokenCurlyBracket = false;
      }
    } else if (tokens[i] === "[") {
      lastTokenSquareBracket = true;
    } else if (tokens[i] === "{") {
      lastTokenCurlyBracket = true;
    } else if (
      tokens[i] !== "[" ||
      tokens[i] !== "{" ||
      tokens[i] !== "]" ||
      tokens[i] !== "}"
    ) {
      currentConfig.path = constructPath(tokens[i]);
    }
    i += 1;
  }

  return initalConfig;
};

const extractData = (obj: Record<string, any>, config: any, commData = {}) => {
  if (config?.commanData?.length) {
    config.commanData.map((item: any) => {
      createNestedField(
        commData,
        item.business_key,
        typeof item.value === "string"
          ? eval(item.value)
          : extractData(obj, item)
      );
    });
  }

  const item = config.value;
  if (item.type === "Array") {
    const response: any = [];
    eval(item.path)?.some((data: any) => {
      const _ = data;
      if (item.check ? eval(item.check) : true) {
        const result = extractData(data, item, commData);
        if (result) {
          response.push(result);
        }
      }
    });
    return response;
  } else if (item.type === "String") {
    let data: any = {};
    data[`${item.key}`] = eval(item.path);

    return { ...data, ...commData };
  } else if (item.type === "Object") {
    const data: any = {};
    item.value.map((val: any) => {
      if (!eval(val.value)) {
        throw new Error(`key ${val.value} not found`);
      }
      data[val.key] = eval(val.value);
    });
    return { ...data, ...commData };
  }
};

const createBusinessPayload = (myconfig: any, obj: any) => {
  const payload = {};

  try {
    myconfig.map((conf: any) => {
      if (conf.extractionPath) {
        conf = {
          ...conf,
          value: decodeInputString(conf.extractionPath),
        };

        createNestedField(
          payload,
          conf.business_key,
          typeof conf.value === "string"
            ? eval(conf.value)
            : extractData(obj, conf).flat(Infinity)
        );
      }
    });

    return payload;
  } catch (e) {
    logger.info("error while creating bussniss payload", e);
    return payload;
  }
};

export const createBecknObject = (
  session: any,
  call: any,
  data: any,
  protocol: any
) => {
  // const parsedYaml = yaml.load(getYamlConfig(session.configName));
  const config = protocol;
  if (config.sessionData) {
    const updatedSession = createPayload(
      config.sessionData,
      call.type,
      data,
      session
    );

    session = { ...session, ...updatedSession };
  }
  const payload = createPayload(config.mapping, call.type, data, session);

  return { payload, session };
};

export const extractBusinessData = (
  type: any,
  payload: any,
  session: any,
  protocol: any
) => {
  // const parsedYaml = yaml.load(getYamlConfig(session.configName));

  if (protocol.sessionData) {
    const parsedSchema = createBusinessPayload(protocol.sessionData, payload);

    console.log("parsedSchaems", parsedSchema);

    session = { ...session, ...parsedSchema };
  }

  const result = createBusinessPayload(protocol.mapping, payload);

  return { result, session };
};

export const extractPath = (path: string, obj: Record<string, any>) => {
  const payload = {};

  try {
    const value = decodeInputString(path);

    createNestedField(
      payload,
      "data",
      typeof value === "string"
        ? eval(value)
        : extractData(obj, { value }).flat(Infinity)
    );

    return payload;
  } catch (e) {
    logger.info("error while creating bussniss payload", e);
    return payload;
  }
};

module.exports = {
  createBecknObject,
  extractBusinessData,
  extractPath,
};
