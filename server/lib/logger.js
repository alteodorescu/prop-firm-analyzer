// ═══════════════════════════════════════════════════════════
// Simple logger with timestamps and levels
// ═══════════════════════════════════════════════════════════

const COLORS = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
};

function ts() {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

export const log = {
  info: (tag, msg, data) => {
    console.log(`${COLORS.gray}${ts()}${COLORS.reset} ${COLORS.cyan}[${tag}]${COLORS.reset} ${msg}`, data !== undefined ? data : "");
  },
  trade: (tag, msg, data) => {
    console.log(`${COLORS.gray}${ts()}${COLORS.reset} ${COLORS.green}[${tag}]${COLORS.reset} ${msg}`, data !== undefined ? data : "");
  },
  warn: (tag, msg, data) => {
    console.log(`${COLORS.gray}${ts()}${COLORS.reset} ${COLORS.yellow}[${tag}]${COLORS.reset} ${msg}`, data !== undefined ? data : "");
  },
  error: (tag, msg, data) => {
    console.log(`${COLORS.gray}${ts()}${COLORS.reset} ${COLORS.red}[${tag}]${COLORS.reset} ${msg}`, data !== undefined ? data : "");
  },
  signal: (tag, msg, data) => {
    console.log(`${COLORS.gray}${ts()}${COLORS.reset} ${COLORS.blue}[${tag}]${COLORS.reset} ${msg}`, data !== undefined ? data : "");
  },
};
