import $RefParser from "@apidevtools/json-schema-ref-parser";
import axios from "axios";
import { logger } from "../utils/logger";

class ConfigLoader {
  config: any;
  constructor() {
    this.config = null;
  }

  async init() {
    try {
      const localConfig = process.env.LOAD_LOCAL_CONFIG;

      if (localConfig === "true") {
        const schema = await $RefParser.dereference("config/index.yaml");

        this.config = schema;

        return schema;
      } else {
        const url = process.env.CONFIG_URL;

        if (!url) {
          throw new Error("Config url not found");
        }

        const response = await axios.get(url);

        this.config = response.data;

        return response.data;
      }
    } catch (e: any) {
      throw new Error(e);
    }
  }

  getConfig() {
    return this.config;
  }

  getConfigBasedOnFlow(flowId: string, additionalFlow?: any) {
    let filteredInput: any = null;
    let filteredCalls: any = null;
    let filteredDomain: string | null = null;
    let filteredSessiondata: any = null;
    let filteredAdditionalFlows: any = null;
    let filteredsummary = "";
    let additionalFlowConfig: any = null;

    this.config.flows.forEach((flow: any) => {
      if (flow.id === flowId) {
        const { input, calls, domain, sessionData, additioalFlows, summary } =
          flow;
        filteredInput = input;
        filteredCalls = calls;
        filteredDomain = domain;
        filteredSessiondata = sessionData;
        filteredAdditionalFlows = additioalFlows || [];
        filteredsummary = summary;
      }
    });

    if (additionalFlow) {
      this.config.flows.forEach((flow: any) => {
        if (flow.id === additionalFlow) {
          const { input, calls, sessionData, summary } = flow;
          additionalFlowConfig = {
            input: input,
            summary: summary,
            configName: additionalFlow,
            protocolCalls: calls,
          };

          filteredSessiondata = { ...filteredSessiondata, ...sessionData };
        }
      });
    }

    return {
      filteredCalls,
      filteredInput,
      filteredDomain,
      filteredSessiondata,
      filteredAdditionalFlows,
      filteredsummary,
      additionalFlowConfig,
    };
  }

  getListOfFlow() {
    return this.config.flows
      .map((flow: any) => {
        if (flow.shouldDispaly) return { key: flow.summary, value: flow.id };
      })
      .filter((flow: any) => flow);
  }

  getListOfAdditionalFlows(configName: string) {
    return this.config.flows
      .map((flow: any) => {
        if (flow.id === configName) return flow.additionalFlows;
      })
      .filter((flow: any) => flow)
      .flat();
  }
}

export const configLoader = new ConfigLoader();

// module.exports = { configLoader };
