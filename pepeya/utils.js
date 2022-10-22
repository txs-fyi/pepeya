// Bundles the JavaScript EVM tracer into a string
// This is cus JSON.stringify omits function types
const bundle = function (obj) {
  if (obj === null) return "null";
  if (Array.isArray(obj)) {
    return "[" + obj.map(x => bundle(x)) + "]"
  }

  var type = typeof obj;
  if (type === "string") return "'" + obj + "'";
  if (type === "boolean" || type === "number") return obj;
  if (type === "function") return obj.toString();
  var ret = [];
  for (var prop in obj) {
    ret.push(prop + ": " + bundle(obj[prop]));
  }
  return "{" + ret.join(",") + "}";
};

module.exports = {
  bundle,
};
