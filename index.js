const { stateTracer, callTracer, fourByteTracer } = require("./pepeya/tracers");
const { bundle } = require("./pepeya/utils");
const { ETH_MAINNET_RPC_URL } = require("./pepeya/constants");

const ethers = require("ethers");
(async () => {
  // Testing dump
  const provider = new ethers.providers.JsonRpcProvider(ETH_MAINNET_RPC_URL);
  // const transaction = {
  //   tracer: bundle(callTracer),
  // };
  const transaction = await provider.send("debug_traceTransaction", [
    "0xc94f9224b4e52ee20da94954cd90f109dba0632772e59ceef62db3af5d832e8d",
    {
      tracer: bundle(fourByteTracer),
    },
  ]);
  console.log(JSON.stringify(transaction, null, 4));
})();
