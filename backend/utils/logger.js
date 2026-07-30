function write(level, event, context = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    event,
    service: "portfolio-chat-backend",
    ...context,
  };
  const output = JSON.stringify(entry);
  if (level === "error") console.error(output);
  else console.log(output);
}

export const logger = {
  info: (event, context) => write("info", event, context),
  warn: (event, context) => write("warn", event, context),
  error: (event, context) => write("error", event, context),
};

