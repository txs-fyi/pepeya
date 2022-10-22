// Bundles the JavaScript EVM tracer into a string
// This is cus JSON.stringify omits function types
const bundle = function (obj) {
  if (obj === null) return "null";
  if (Array.isArray(obj)) {
    return "[" + obj.map((x) => bundle(x)) + "]";
  }

  const type = typeof obj;
  if (type === "string") return "'" + obj + "'";
  if (type === "boolean" || type === "number") return obj;
  if (type === "function") return obj.toString();
  const ret = [];
  for (const prop in obj) {
    ret.push(prop + ": " + bundle(obj[prop]));
  }
  return "{" + ret.join(",") + "}";
};

// Parses query string boolean
const parseQueryStringBool = (qs, qsDefault = "") =>
  Boolean((qs || qsDefault).replace(/\s*(false|null|undefined|0)\s*/i, ""));

// async handler for express
const asyncHandler = (fun) => (req, res, next) => {
  Promise.resolve(fun(req, res, next)).catch(next);
};

module.exports = {
  bundle,
  parseQueryStringBool,
  asyncHandler,
};
