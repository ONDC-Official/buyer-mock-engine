const fs = require("fs");
const yaml = require("yaml");
const path = require("path");
const $RefParser = require("@apidevtools/json-schema-ref-parser");
const axios = require("axios");
const logger = require("../utils/logger");

class ConfigLoader {
  constructor() {
    this.config = null;
  }

  async init() {
    try {
      const url = process.env.CONFIG_URL;

      if (!url) {
        throw new Error("Config url not found");
      }

      const response = await axios.get(url);

      this.config = response.data;

      return response.data;
    } catch (e) {
      throw new Error(e);
    }
  }

  getConfig() {
    return this.config;
  }

  getConfigBasedOnFlow(flowId, additionalFlow) {
    let filteredInput = null;
    let filteredCalls = null;
    let filteredDomain = null;
    let filteredSessiondata = null;
    let filteredAdditionalFlows = null;
    let filteredsummary = "";
    let additionalFlowConfig = null;

    this.config.flows.forEach((flow) => {
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
      this.config.flows.forEach((flow) => {
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
      .map((flow) => {
        if (flow.shouldDispaly) return { key: flow.summary, value: flow.id };
      })
      .filter((flow) => flow);
  }

  getListOfAdditionalFlows(configName) {
    return this.config.flows
      .map((flow) => {
        if (flow.id === configName) return flow.additionalFlows;
      })
      .filter((flow) => flow)
      .flat();
  }
}

const configLoader = new ConfigLoader();

module.exports = { configLoader };
