const { stateTracer } = require("./pepeya/tracers/state");
const { callTracer } = require("./pepeya/tracers/call");
const { bundle } = require("./pepeya/utils");
const { ETH_MAINNET_RPC_URL } = require("./pepeya/constants");

const ethers = require("ethers");
(async () => {
  // Testing dump
  const provider = new ethers.providers.JsonRpcProvider(
    ETH_MAINNET_RPC_URL
  );
  // const transaction = {
  //   tracer: bundle(callTracer),
  // };
  const transaction = await provider.send("debug_traceTransaction", [
    "0xf5e1059066bc6543e38e48a3f24a20bbf364f0987bf3eae8848969af783b7819",
    {
      tracer: bundle(callTracer),
    },
  ]);
  console.log(JSON.stringify(transaction, null, 4));
})();
