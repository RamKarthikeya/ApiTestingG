// src/utils/cache.js
import NodeCache from "node-cache";

const cache = new NodeCache({
  stdTTL: 300, // 5 minutes
  checkperiod: 60,
});

export default cache;
