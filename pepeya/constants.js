require("dotenv").config();

const ENV_VARS = ["ETH_MAINNET_RPC_URL"];

let missingEnv = false;

for (let i = 0; i < ENV_VARS.length; i++) {
  if (process.env[ENV_VARS[i]] === undefined) {
    console.log(`Missing ENV_VAR ${ENV_VARS[i]}`);
    missingEnv = true;
  }
}

if (missingEnv) {
  process.exit(1);
}

module.exports = {
  ETH_MAINNET_RPC_URL: process.env.ETH_MAINNET_RPC_URL,
};
