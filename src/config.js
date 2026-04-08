// https://docs.npmjs.com/cli/v10/configuring-npm/npmrc
// https://github.com/npm/cli/blob/569f3914dec870ecbb936249ca0dcd003bb93fe0/workspaces/config/lib/parse-field.js
// https://github.com/npm/cli/blob/569f3914dec870ecbb936249ca0dcd003bb93fe0/workspaces/config/lib/definitions/definitions.js
// https://github.com/npm/cli/blob/latest/workspaces/config/lib/index.js#L842
// https://github.com/npm/cli/blob/latest/workspaces/config/lib/index.js#L842
// https://github.com/npm/cli/issues/4763
// https://github.com/oven-sh/bun/issues/271

const registryRegex = /(@[a-zA-Z0-9-*~][a-zA-Z0-9-*._~]*:)?registry=(.*)/;
const authTokenRegex = /(.*:)?_authToken=(.*)/;
const passwordRegex = /(.*:)?_password=(.*)/;
const usernameRegex = /(.*:)?username=(.*)/;
const authRegex = /^(.*:)?_auth=(.*)/;
const userAndPasswordRegex = /https:\/\/(.*):(.*)@(.*)/;

const extractRegistry = (txt) => {
  if(!txt) return undefined
  return txt.replace(/\/\//, '')
}

const registryNpm = (txt) => {
  if(!txt) return ''
  return `//${txt}:`
}

const configType = {
  Default: "Default",
  Registry: "Registry",
  AuthToken: "AuthToken",
  Auth: "Auth",
  Password: "Password",
  Username: "Username",
  UrlAuth: "UrlAuth",
}

function parseRegistry(text) {
  let m = text.match(registryRegex);
  if (m) {
    const um= m[2].match(userAndPasswordRegex)
    if(um) {
      return {
        type: configType.UrlAuth,
        scope: m[1] ? m[1].replace(':', '') : m[1],
        registry: extractRegistry(um[3]),
        url: m[2],
        username: um[1],
        password: um[2],
        toString: function() {
          return `${this.scope ? this.scope + ':' : ''}registry=${this.url}`;
        }
      }
    }

    const registry = m[2].replace(/^https:\/\//, '')
    return {
      type: configType.Registry,
      scope: m[1] ? m[1].replace(':', '') : m[1],
      registry,
      url: m[2],
      toString: function() {
        return `${this.scope ? this.scope + ':' : ''}registry=${this.url}`;
      }
    }
  }
}

function parseAuthToken(text) {
  m = text.match(authTokenRegex);
  if (m) {
    return {
      type: configType.AuthToken,
      registry:  extractRegistry(m[1] ? m[1].replace(':', '') : m[1]),
      token: m[2],
      toString: function() {
        return `${registryNpm(this.registry)}_authToken=${this.token}`;
      }
    }
  }
}

function parseAuth(text) {
  m = text.match(authRegex);
  if (m) {
    const authDecode = Buffer.from(m[2], 'base64').toString('utf8')
    const authSplit = authDecode.split(':')
    const username = authSplit.shift()
    const password = authSplit.join(':')
    return {
      type: configType.Auth,
      registry:  extractRegistry(m[1] ? m[1].replace(':', '') : m[1]),
      auth: m[2],
      username,
      password,
      toString: function() {
        return `${registryNpm(this.registry)}_auth=${this.auth}`;
      }
    }
  }
}

function parsePassword(text) {
  m = text.match(passwordRegex);
  if (m) {
    return {
      type: configType.Password,
      registry:  extractRegistry(m[1] ? m[1].replace(':', '') : m[1]),
      password: m[2],
      toString: function() {
        return `${registryNpm(this.registry)}_password=${this.password}`;
      }
    }
  }
}

function parseUsername(text) {
  m = text.match(usernameRegex);
  if (m) {
    return {
      type: configType.UrlAuth,
      username: m[2],
      registry:  extractRegistry(m[1] ? m[1].replace(':', '') : m[1]),
      toString: function() {
        return `${registryNpm(this.registry)}username=${this.username}`;
      }
    }
  }
}

function parseConfig(text) {

  let m = parseRegistry(text) ||
          parseAuthToken(text) ||
          parsePassword(text) ||
          parseUsername(text) ||
          parseAuth(text)

  if(m) return m;

  return {
    type: configType.Default,
    toString: function() {
      return text;
    }
  }
}

module.exports = {
  configType,
  parseConfig,
  registryNpm
};
