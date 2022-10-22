// Extracting custom tracing from
// https://github.com/ethereum/go-ethereum/blob/c5436c8eb7380fc0efd02bc34ebd6b56b47f2db6/eth/tracers/js/internal/tracers/prestate_tracer_legacy.js

const stateTracer = {
  // prestate is the genesis that we're building.
  prestate: null,

  // poststate is the storage *after* the transaction
  poststate: null,

  // lookupAccount injects the specified account into the prestate object.
  lookupAccount: function (addr, db) {
    var acc = toHex(addr);
    if (this.prestate[acc] === undefined) {
      this.prestate[acc] = {
        balance: "0x" + db.getBalance(addr).toString(16),
        storage: {},
      };
    }
  },

  // lookupStorage injects the specified storage entry of the given account into
  // the prestate object.
  lookupStorage: function (addr, key, db) {
    var acc = toHex(addr);
    var idx = toHex(key);

    if (this.prestate[acc] === undefined) {
      this.prestate[acc] = {
        balance: "0x" + db.getBalance(addr).toString(16),
        storage: {},
      };
    }

    if (this.prestate[acc].storage[idx] === undefined) {
      this.prestate[acc].storage[idx] = toHex(db.getState(addr, key));
    }
  },

  // result is invoked when all the opcodes have been iterated over and returns
  // the final result of the tracing.
  result: function (ctx, db) {
    // At this point, we need to deduct the 'value' from the
    // outer transaction, and move it back to the origin
    this.lookupAccount(ctx.from, db);

    var fromBal = bigInt(this.prestate[toHex(ctx.from)].balance.slice(2), 16);
    var toBal = bigInt(this.prestate[toHex(ctx.to)].balance.slice(2), 16);

    this.prestate[toHex(ctx.to)].balance =
      "0x" + toBal.subtract(ctx.value).toString(16);
    this.prestate[toHex(ctx.from)].balance =
      "0x" +
      fromBal
        .add(ctx.value)
        .add((ctx.gasUsed + ctx.intrinsicGas) * ctx.gasPrice)
        .toString(16);

    // Remove empty create targets
    if (ctx.type == "CREATE") {
      // We can blindly delete the contract prestate, as any existing state would
      // have caused the transaction to be rejected as invalid in the first place.
      delete this.prestate[toHex(ctx.to)];
    }

    // Make sure post-state is valid
    this.poststate = {};

    // For each address in the prestate, look up the final balances and storage values
    var addresses = Object.keys(this.prestate);
    for (let i = 0; i < addresses.length; i++) {
      var curAddr = addresses[i];
      var curAddrBytes = toAddress(curAddr);

      this.poststate[curAddr] = {
        storage: {},
      };

      var curBal = "0x" + db.getBalance(curAddrBytes).toString(16);
      this.poststate[curAddr].balance = curBal;

      // Update storage
      var slots = Object.keys(this.prestate[curAddr].storage);
      for (let j = 0; j < slots.length; j++) {
        var curSlot = slots[j];
        var curValue = db.getState(curAddrBytes, toWord(curSlot));
        curValue = toHex(curValue);

        // No state changes, no need to display
        if (curValue === this.prestate[curAddr].storage[curSlot]) {
          delete this.prestate[curAddr].storage[curSlot];
        } else {
          this.poststate[curAddr].storage[curSlot] = curValue;
        }
      }
    }

    // Return the assembled allocations (prestate)
    return {
      prestate: this.prestate,
      poststate: this.poststate,
    };
  },

  // step is invoked for every opcode that the VM executes.
  step: function (log, db) {
    // Add the current account if we just started tracing
    if (this.prestate === null) {
      this.prestate = {};
      // Balance will potentially be wrong here, since this will include the value
      // sent along with the message. We fix that in 'result()'.
      this.lookupAccount(log.contract.getAddress(), db);
    }
    // Whenever new state is accessed, add it to the prestate
    switch (log.op.toString()) {
      case "EXTCODECOPY":
      case "EXTCODESIZE":
      case "BALANCE":
        this.lookupAccount(toAddress(log.stack.peek(0).toString(16)), db);
        break;
      case "CREATE":
        var from = log.contract.getAddress();
        this.lookupAccount(toContract(from, db.getNonce(from)), db);
        break;
      case "CREATE2":
        var from = log.contract.getAddress();
        // stack: salt, size, offset, endowment
        var offset = log.stack.peek(1).valueOf();
        var size = log.stack.peek(2).valueOf();
        var end = offset + size;
        this.lookupAccount(
          toContract2(
            from,
            log.stack.peek(3).toString(16),
            log.memory.slice(offset, end)
          ),
          db
        );
        break;
      case "CALL":
      case "CALLCODE":
      case "DELEGATECALL":
      case "STATICCALL":
        this.lookupAccount(toAddress(log.stack.peek(1).toString(16)), db);
        break;
      case "SSTORE":
      case "SLOAD":
        this.lookupStorage(
          log.contract.getAddress(),
          toWord(log.stack.peek(0).toString(16)),
          db
        );
        break;
    }
  },

  // fault is invoked when the actual execution of an opcode fails.
  fault: function (log, db) {},
};

module.exports = {
  stateTracer,
};
