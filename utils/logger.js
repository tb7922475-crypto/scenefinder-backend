/**
 * Simple structured logger for SceneFinder.
 * All output goes to stdout/stderr with ISO timestamps and a [SceneFinder] prefix.
 */

const PREFIX = '[SceneFinder]';

const timestamp = () => new Date().toISOString();

const logger = {
  info: (...args) => {
    console.log(`${timestamp()} ${PREFIX} [INFO]`, ...args);
  },
  warn: (...args) => {
    console.warn(`${timestamp()} ${PREFIX} [WARN]`, ...args);
  },
  error: (...args) => {
    console.error(`${timestamp()} ${PREFIX} [ERROR]`, ...args);
  },
  debug: (...args) => {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`${timestamp()} ${PREFIX} [DEBUG]`, ...args);
    }
  },
};

module.exports = logger;
