// src/server.js
import app from "./app.js";
import { config } from "./config/env.js";

app.listen(config.port, () => {
  console.log(`
  🚀 Server running on http://localhost:${config.port}
  🔒 Environment: ${process.env.NODE_ENV || "development"}
  🤖 NVIDIA AI: Configured
  `);
});
