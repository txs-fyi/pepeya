/* eslint-disable */

// https://github.com/ethereum/go-ethereum/blob/c5436c8eb7380fc0efd02bc34ebd6b56b47f2db6/eth/tracers/js/internal/tracers/call_tracer_legacy.js

const executionTracer = {
  byte2Hex: function (byte) {
    if (byte < 0x10) {
      return "0" + byte.toString(16);
    }
    return byte.toString(16);
  },

  array2Hex: function (arr) {
    var retVal = "";
    for (let i = 0; i < arr.length; i++) {
      retVal += this.byte2Hex(arr[i]);
    }
    return retVal;
  },

  // Cache of all sha3, to determine the k-v mapping
  sha3Cache: [],

  // callstack is the current recursive call stack of the EVM execution.
  callstack: [{}],

  // descended tracks whether we've just descended from an outer transaction into
  // an inner call.
  descended: false,

  // step is invoked for every opcode that the VM executes.
  step: function (log, db) {
    // Capture any errors immediately
    var error = log.getError();
    if (error !== undefined) {
      this.fault(log, db);
      return;
    }

    // We only care about system opcodes, faster if we pre-check once
    var syscall = (log.op.toNumber() & 0xf0) == 0xf0;
    if (syscall) {
      var op = log.op.toString();
    }

    // If a new contract is being created, add to the call stack
    if (syscall && (op == "CREATE" || op == "CREATE2")) {
      var inOff = log.stack.peek(1).valueOf();
      var inEnd = inOff + log.stack.peek(2).valueOf();

      // Assemble the internal call report and store for completion
      var call = {
        type: op,
        from: toHex(log.contract.getAddress()),
        input: toHex(log.memory.slice(inOff, inEnd)),
        gasIn: log.getGas(),
        gasCost: log.getCost(),
        value: "0x" + log.stack.peek(0).toString(16)
      };
      this.callstack.push(call);
      this.descended = true;
      return;
    }

    // If a contract is being self destructed, gather that as a subcall too
    if (syscall && op == "SELFDESTRUCT") {
      var left = this.callstack.length;
      if (this.callstack[left - 1].calls === undefined) {
        this.callstack[left - 1].calls = [];
      }
      this.callstack[left - 1].calls.push({
        type: op,
        from: toHex(log.contract.getAddress()),
        to: toHex(toAddress(log.stack.peek(0).toString(16))),
        gasIn: log.getGas(),
        gasCost: log.getCost(),
        value: "0x" + db.getBalance(log.contract.getAddress()).toString(16),
        storage: [],
        logs: [],
      });
      return;
    }

    // If a new method invocation is being done, add to the call stack
    if (
      syscall &&
      (op == "CALL" ||
        op == "CALLCODE" ||
        op == "DELEGATECALL" ||
        op == "STATICCALL")
    ) {
      // Skip any pre-compile invocations, those are just fancy opcodes
      var to = toAddress(log.stack.peek(1).toString(16));
      if (isPrecompiled(to)) {
        return;
      }
      var off = op == "DELEGATECALL" || op == "STATICCALL" ? 0 : 1;

      var inOff = log.stack.peek(2 + off).valueOf();
      var inEnd = inOff + log.stack.peek(3 + off).valueOf();

      // Assemble the internal call report and store for completion
      var call = {
        type: op,
        from: toHex(log.contract.getAddress()),
        to: toHex(to),
        input: toHex(log.memory.slice(inOff, inEnd)),
        gasIn: log.getGas(),
        gasCost: log.getCost(),
        outOff: log.stack.peek(4 + off).valueOf(),
        outLen: log.stack.peek(5 + off).valueOf(),
        storage: [],
        logs: [],
      };
      if (op != "DELEGATECALL" && op != "STATICCALL") {
        call.value = "0x" + log.stack.peek(2).toString(16);
      }
      this.callstack.push(call);
      this.descended = true;
      return;
    }

    // If we've just descended into an inner call, retrieve it's true allowance. We
    // need to extract if from within the call as there may be funky gas dynamics
    // with regard to requested and actually given gas (2300 stipend, 63/64 rule).
    if (this.descended) {
      if (log.getDepth() >= this.callstack.length) {
        this.callstack[this.callstack.length - 1].gas = log.getGas();
      } else {
        // TODO(karalabe): The call was made to a plain account. We currently don't
        // have access to the true gas amount inside the call and so any amount will
        // mostly be wrong since it depends on a lot of input args. Skip gas for now.
      }
      this.descended = false;
    }

    // If an existing call is returning, pop off the call stack
    if (syscall && op == "REVERT") {
      this.callstack[this.callstack.length - 1].error = "execution reverted";
      return;
    }

    if (log.getDepth() == this.callstack.length - 1) {
      // Pop off the last call and get the execution results
      var call = this.callstack.pop();

      if (call.type == "CREATE" || call.type == "CREATE2") {
        // If the call was a CREATE, retrieve the contract address and output code
        call.gasUsed =
          "0x" + bigInt(call.gasIn - call.gasCost - log.getGas()).toString(16);
        delete call.gasIn;
        delete call.gasCost;

        var ret = log.stack.peek(0);
        if (!ret.equals(0)) {
          call.to = toHex(toAddress(ret.toString(16)));
          call.output = toHex(db.getCode(toAddress(ret.toString(16))));
        } else if (call.error === undefined) {
          call.error = "internal failure"; // TODO(karalabe): surface these faults somehow
        }
      } else {
        // If the call was a contract call, retrieve the gas usage and output
        if (call.gas !== undefined) {
          call.gasUsed =
            "0x" +
            bigInt(
              call.gasIn - call.gasCost + call.gas - log.getGas()
            ).toString(16);
        }
        var ret = log.stack.peek(0);
        if (!ret.equals(0)) {
          call.output = toHex(
            log.memory.slice(call.outOff, call.outOff + call.outLen)
          );
        } else if (call.error === undefined) {
          call.error = "internal failure"; // TODO(karalabe): surface these faults somehow
        }
        delete call.gasIn;
        delete call.gasCost;
        delete call.outOff;
        delete call.outLen;
      }
      if (call.gas !== undefined) {
        call.gas = "0x" + bigInt(call.gas).toString(16);
      }
      // Inject the call into the previous one
      var left = this.callstack.length;
      if (this.callstack[left - 1].calls === undefined) {
        this.callstack[left - 1].calls = [];
      }
      this.callstack[left - 1].calls.push(call);
    }

    // Logs
    var logcall = (log.op.toNumber() & 0xa0) == 0xa0;
    if (logcall) {
      var logop = log.op.toString();
    }

    // Append log data
    if (logcall && logop.startsWith("LOG")) {
      var offset = parseInt(log.stack.peek(0));
      var length = parseInt(log.stack.peek(1));
      var data = log.memory.slice(offset, offset + length);
      var topics = [];

      var topicNo = log.op.toNumber() - 0xa0;

      // LOG0 = 0xa0
      // LOG1 = 0xa1
      // LOG2 = 0xa2
      // ....
      for (let i = 0; i < topicNo; i++) {
        var curTopic =
          "0x" +
          bigInt(log.stack.peek(2 + i))
            .toString(16)
            .padStart(64, "0");
        topics.push(curTopic);
      }

      var left = this.callstack.length;
      if (this.callstack[left - 1].calls === undefined) {
        this.callstack[left - 1].calls = [];
      }

      this.callstack[left - 1].calls.push({
        type: logop,
        address: toHex(log.contract.getAddress()),
        data: toHex(data),
        topics,
      });
    }

    // KECCAK256 to build up an index of hashes
    // Used for SSTORE mapping (in the future)
    var sha3call = log.op.toNumber() == 0x20;
    if (sha3call) {
      var offset = parseInt(log.stack.peek(0));
      var length = parseInt(log.stack.peek(1));
      var data = log.memory.slice(offset, offset + length);
      this.sha3Cache.push(this.array2Hex(data));
    }

    // SSTORE
    var storecall = log.op.toNumber() == 0x55;
    if (storecall && log.op.toString() == "SSTORE") {
      var slot = toWord(log.stack.peek(0).toString(16));
      var slotHex = toHex(slot);
      var addr = log.contract.getAddress();
      var prestate = toHex(db.getState(addr, slot));
      var poststate = toHex(toWord(log.stack.peek(1).toString(16)));

      var left = this.callstack.length;
      if (this.callstack[left - 1].calls === undefined) {
        this.callstack[left - 1].calls = [];
      }

      // Storage address will the the "to" field
      this.callstack[left - 1].calls.push({
        type: 'SSTORE',
        slot: slotHex,
        before: prestate,
        after: poststate,
        sha3Cache: this.sha3Cache,
      });

      // Clears the cache
      this.sha3Cache = [];
    }
  },

  // fault is invoked when the actual execution of an opcode fails.
  fault: function (log, db) {
    // If the topmost call already reverted, don't handle the additional fault again
    if (this.callstack[this.callstack.length - 1].error !== undefined) {
      return;
    }
    // Pop off the just failed call
    var call = this.callstack.pop();
    call.error = log.getError();

    // Consume all available gas and clean any leftovers
    if (call.gas !== undefined) {
      call.gas = "0x" + bigInt(call.gas).toString(16);
      call.gasUsed = call.gas;
    }
    delete call.gasIn;
    delete call.gasCost;
    delete call.outOff;
    delete call.outLen;

    // Flatten the failed call into its parent
    var left = this.callstack.length;
    if (left > 0) {
      if (this.callstack[left - 1].calls === undefined) {
        this.callstack[left - 1].calls = [];
      }
      this.callstack[left - 1].calls.push(call);
      return;
    }
    // Last call failed too, leave it in the stack
    this.callstack.push(call);
  },

  // result is invoked when all the opcodes have been iterated over and returns
  // the final result of the tracing.
  result: function (ctx, db) {
    var result = {
      type: ctx.type,
      from: toHex(ctx.from),
      to: toHex(ctx.to),
      value: "0x" + ctx.value.toString(16),
      gas: "0x" + bigInt(ctx.gas).toString(16),
      gasUsed: "0x" + bigInt(ctx.gasUsed).toString(16),
      input: toHex(ctx.input),
      output: toHex(ctx.output),
      time: ctx.time,
    };
    if (this.callstack[0].calls !== undefined) {
      result.calls = this.callstack[0].calls;
    }
    if (this.callstack[0].error !== undefined) {
      result.error = this.callstack[0].error;
    } else if (ctx.error !== undefined) {
      result.error = ctx.error;
    }
    // if (
    //   result.error !== undefined &&
    //   (result.error !== "execution reverted" || result.output === "0x")
    // ) {
    //   delete result.output;
    // }
    return this.finalize(result);
  },

  // finalize recreates a call object using the final desired field oder for json
  // serialization. This is a nicety feature to pass meaningfully ordered results
  // to users who don't interpret it, just display it.
  finalize: function (call) {
    var sorted = {
      type: call.type,
      from: call.from,
      to: call.to,
      value: call.value,
      gas: call.gas,
      gasUsed: call.gasUsed,
      input: call.input,
      output: call.output,
      error: call.error,
      time: call.time,
      calls: call.calls,

      // SSTORE
      slot: call.slot,
      before: call.before,
      after: call.after,
      sha3Cache: call.sha3Cache,

      // LOG
      address: call.address,
      data: call.data,
      topics: call.topics,
    };

    for (var key in sorted) {
      if (sorted[key] === undefined) {
        delete sorted[key];
      }
    }
    if (sorted.calls !== undefined) {
      for (var i = 0; i < sorted.calls.length; i++) {
        sorted.calls[i] = this.finalize(sorted.calls[i]);
      }
    }
    return sorted;
  },
};

module.exports = {
  executionTracer,
};
