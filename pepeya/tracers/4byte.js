/* eslint-disable */ 

// Built into Geth, unfortunately most cloudproviders don't have it so defining it here for convinience
// https://github.com/etclabscore/core-geth/blob/master/eth/tracers/js/internal/tracers/4byte_tracer_legacy.js

const fourByteTracer = {
  // ids aggregates the 4byte ids found.
  ids: {},

  // callType returns 'false' for non-calls, or the peek-index for the first param
  // after 'value', i.e. meminstart.
  callType: function (opstr) {
    switch (opstr) {
      case "CALL":
      case "CALLCODE":
        // gas, addr, val, memin, meminsz, memout, memoutsz
        return 3; // stack ptr to memin

      case "DELEGATECALL":
      case "STATICCALL":
        // gas, addr, memin, meminsz, memout, memoutsz
        return 2; // stack ptr to memin
    }
    return false;
  },

  // store save the given identifier and datasize.
  store: function (id, size) {
    var key = "" + toHex(id);
    this.ids[key] = this.ids[key] + 1 || 1;
  },

  // step is invoked for every opcode that the VM executes.
  step: function (log, db) {
    // Skip any opcodes that are not internal calls
    var ct = this.callType(log.op.toString());
    if (!ct) {
      return;
    }
    // Skip any pre-compile invocations, those are just fancy opcodes
    if (isPrecompiled(toAddress(log.stack.peek(1).toString(16)))) {
      return;
    }
    // Gather internal call details
    var inSz = log.stack.peek(ct + 1).valueOf();
    if (inSz >= 4) {
      var inOff = log.stack.peek(ct).valueOf();
      this.store(log.memory.slice(inOff, inOff + 4), inSz - 4);
    }
  },

  // fault is invoked when the actual execution of an opcode fails.
  fault: function (log, db) {},

  // result is invoked when all the opcodes have been iterated over and returns
  // the final result of the tracing.
  result: function (ctx) {
    // Save the outer calldata also
    if (ctx.input.length >= 4) {
      this.store(slice(ctx.input, 0, 4), ctx.input.length - 4);
    }
    return this.ids;
  },
};

module.exports = {
  fourByteTracer,
};
