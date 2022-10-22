const cors = require("cors");
const morgan = require("morgan");
const express = require("express");

const { ethers } = require("ethers");
const { stateTracer, callTracer } = require("./pepeya/tracers");
const {
  bundle,
  parseQueryStringBool,
  asyncHandler,
} = require("./pepeya/utils");
const { ETH_MAINNET_RPC_URL } = require("./pepeya/constants");

const app = express();
const port = 3000;

app.use(cors());
app.use(morgan("common"));

// Higher order function to help parse stuff
const tracerF = (providerUrl) => async (req, res) => {
  if (req.params.txid.length !== 66 || !req.params.txid.startsWith("0x")) {
    res.status(400);
    res.json({
      error: "Invalid txid",
    });
    return;
  }

  // Extract txid
  const { txid } = req.params;

  // By default everything is false
  const getStateTrace = parseQueryStringBool(req.query.stateTrace);
  const getCallTrace = parseQueryStringBool(req.query.callTrace);

  if (!getStateTrace && !getCallTrace) {
    res.json({
      info: "no trace specified options (one or more) are: [stateTrace|callTrace] in query string",
    });
    return;
  }

  // Gets the traces back
  const provider = new ethers.providers.JsonRpcProvider(providerUrl);
  const traceTxWith = (str) =>
    provider.send("debug_traceTransaction", [
      txid,
      {
        tracer: str,
      },
    ]);
  const queries = [
    getStateTrace ? traceTxWith(bundle(stateTracer)) : async () => null,
    getCallTrace ? traceTxWith(bundle(callTracer)) : async () => null,
  ];
  const [stateTrace, callTrace] = await Promise.all(queries);

  // Return the traces
  res.json({
    stateTrace,
    callTrace,
  });
};

app.get("/eth/:txid", asyncHandler(tracerF(ETH_MAINNET_RPC_URL)));

app.listen(port, () => {
  console.log(`pepeya listening on port ${port}`);
});
