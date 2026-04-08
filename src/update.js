// @ts-check
// Copyright 2019 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

const fs = require("fs");
const path = require("path");
const c = require("./config");
// @ts-ignore
const { parse: parseToml } = require("@iarna/toml");
const stringifyToToml = require("./to-toml");
// @ts-ignore
const BUN_INSTALL_CONFIG_ID = "install";
const BUN_INSTALL_SCOPE_CONFIG_ID = "scopes";
const BUN_REGISTRY_KEY = "registry";
const matchArtifactRegistryRegex = /[a-zA-Z0-9-]+[-]npm[.]pkg[.]dev\/.*\//;

/**
 * @param {object} scopedConfig
 */
function validScopedValue(scopedConfig) {
  const url =
    scopedConfig.url ||
    (scopedConfig.registry ? `https://${scopedConfig.registry}` : undefined);
  if (!url) {
    throw new Error("url or registry is not found");
  }
  if (
    !["token"].some((key) => {
      return scopedConfig[key] === undefined;
    })
  ) {
    return {
      url,
      token: scopedConfig.token,
    };
  }
  if (
    !["username", "password"].some((key) => {
      return scopedConfig[key] === undefined;
    })
  ) {
    return {
      url,
      username: scopedConfig.username,
      password: scopedConfig.password,
    };
  }
  return url;
}

/**
 * @param {object} scopedConfig
 */
function validUnscopedValue(scopedConfig) {
  const url =
    scopedConfig.url ||
    (scopedConfig.registry ? `https://${scopedConfig.registry}` : undefined);
  if (!url) {
    throw new Error("url or registry is not found");
  }
  if (
    !["token"].some((key) => {
      return scopedConfig[key] === undefined;
    })
  ) {
    return {
      url,
      token: scopedConfig.token,
    };
  }
  if (
    !["username", "password", "registry"].some((key) => {
      return scopedConfig[key] === undefined;
    })
  ) {
    return `https://${scopedConfig.username}:${scopedConfig.password}@${scopedConfig.registry}`;
  }
  return url;
}

/**
 * @param {object} bunfig Path to the npmrc file to read scope registry configs, should be the project npmrc filecreds
 * @param {object} parsedParams original bunfig path.
 */
function setData(bunfig, parsedParams) {
  if (!bunfig[BUN_INSTALL_CONFIG_ID]) {
    bunfig[BUN_INSTALL_CONFIG_ID] = {};
  }

  if (parsedParams.scope) {
    if (!bunfig[BUN_INSTALL_CONFIG_ID][BUN_INSTALL_SCOPE_CONFIG_ID]) {
      bunfig[BUN_INSTALL_CONFIG_ID][BUN_INSTALL_SCOPE_CONFIG_ID] = {};
    }

    bunfig[BUN_INSTALL_CONFIG_ID][BUN_INSTALL_SCOPE_CONFIG_ID][
      parsedParams.scope
    ] = validScopedValue(parsedParams);
    return bunfig;
  }

  bunfig[BUN_INSTALL_CONFIG_ID][BUN_REGISTRY_KEY] =
    validUnscopedValue(parsedParams);
  return bunfig;
}

/**
 * @param {string} line Path to the npmrc file to read scope registry configs, should be the project npmrc file.
 * @param {object} cache original bunfig path.
 */
function parseLine(line, cache) {
  let { type, toString, ...config } = c.parseConfig(line.trim());

  // @ts-ignore
  if (config.scope) {
    // @ts-ignore
    if (!cache[config.scope]) {
      // @ts-ignore
      cache[config.scope] = {};
    }
    // @ts-ignore
    cache[config.scope] = Object.assign(cache[config.scope], config);
  } else if (Object.keys(config).length > 0) {
    if (!cache[BUN_REGISTRY_KEY]) {
      // @ts-ignore
      cache[BUN_REGISTRY_KEY] = {};
    }
    cache[BUN_REGISTRY_KEY] = Object.assign(cache[BUN_REGISTRY_KEY], config);
  }
  return cache;
}

/**
 * Update the project and user npmrc files.
 *
 * @param {string} npmrcFile Path to the npmrc file to read scope registry configs, should be the project npmrc file.
 * @param {string} from original bunfig path.
 * @param {string} bunfigPath output bunfig path.
 * @param {string} creds Encrypted credentials.
 * @return {!Promise<undefined>}
 */
async function generateBunfigFile(npmrcFile, from, bunfigPath, creds) {
  npmrcFile = path.resolve(npmrcFile);

  // We do not use basic auth any more in `gcloud artifacts print-settings`; replace them.
  let npmrcFileLines = await fs.promises.readFile(npmrcFile, "utf8");
  const legacyRegex =
    /(\/\/[a-zA-Z1-9-]+[-]npm[.]pkg[.]dev\/.*\/):_password=.*(\n\/\/[a-zA-Z1-9-]+[-]npm[.]pkg[.]dev\/.*\/:username=oauth2accesstoken)/g;
  npmrcFileLines = npmrcFileLines.replace(
    legacyRegex,
    `$1:_authToken=${creds}`,
  );

  from = path.resolve(from);

  let bunfigOutObj = fs.existsSync(from)
    ? parseToml(fs.readFileSync(from, "utf8"))
    : {};

  let appendedInstallConfig = {};

  for (const line of npmrcFileLines.split("\n")) {
    appendedInstallConfig = parseLine(line, appendedInstallConfig);
  }
  for (const value of Object.values(appendedInstallConfig)) {
    // @ts-ignore
    if ((value.url || value.registry || "").match(matchArtifactRegistryRegex)) {
      // @ts-ignore
      value.token = creds;
    }
    bunfigOutObj = setData(bunfigOutObj, value);
  }

  bunfigPath = path.resolve(bunfigPath);
  const outString = stringifyToToml(bunfigOutObj);

  // @ts-ignore
  await fs.promises.writeFile(bunfigPath, outString);
}

async function generateNpmrcFile(npmrcFile, outputPath, creds) {
  fromConfigPath = path.resolve(npmrcFile);
  toConfigPath = path.resolve(outputPath);

  const toConfigs = [];
  const registryAuthConfigs = new Map();

  // We do not use basic auth any more in `gcloud artifacts print-settings`; replace them.
  let fromConfigLines = await fs.promises.readFile(fromConfigPath, "utf8");
  const legacyRegex =
    /(\/\/[a-zA-Z1-9-]+[-]npm[.]pkg[.]dev\/.*\/):_password=.*(\n\/\/[a-zA-Z1-9-]+[-]npm[.]pkg[.]dev\/.*\/:username=oauth2accesstoken)/g;
  fromConfigLines = fromConfigLines.replace(
    legacyRegex,
    `$1:_authToken=${creds}`,
  );

  // Read configs from project npmrc file. For each:
  // - registry config, create an auth token config in the user npmrc file (expect an auth token or password config already exists)
  // - auth token config, print a warning and remove it.
  // - password config, print a warning and move it to the user npmrc file.
  // - everything else, keep it in the project npmrc file.
  for (const line of fromConfigLines.split("\n")) {
    let config = c.parseConfig(line.trim());
    switch (config.type) {
      case c.configType.Registry:
        toConfigs.push(config);
        if (config.registry.match(matchArtifactRegistryRegex)) {
          registryAuthConfigs.set(config.registry, {
            type: c.configType.AuthToken,
            registry: config.registry,
            token: creds,
            toString: function () {
              return `${c.registryNpm(this.registry)}:_authToken=${this.token}`;
            },
          });
        }
        break;
      default:
        if (line && !matchArtifactRegistryRegex.test(line)) {
          toConfigs.push(line.trim());
        }
    }
  }

  toConfigs.push(...registryAuthConfigs.values());
console.log(toConfigs)
  // Registries that we need to move password configs from the project npmrc file
  // or write a new auth token config.

  // Write to the user npmrc file first so that if it failed the project npmrc file
  // would still be untouched.
  await fs.promises.writeFile(toConfigPath, toConfigs.join(`\n`));
}

module.exports = {
  generateBunfigFile,
  generateNpmrcFile,
};
