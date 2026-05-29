"use strict";
// This polyfill runs BEFORE any app module. It captures errors that happen
// during module initialization — before _layout.tsx sets up its own handler.
if (typeof ErrorUtils !== "undefined") {
  var _prev = ErrorUtils.getGlobalHandler();
  ErrorUtils.setGlobalHandler(function (error, isFatal) {
    globalThis.__earlyErrors = globalThis.__earlyErrors || [];
    globalThis.__earlyErrors.push(
      "[" + (isFatal ? "FATAL" : "warn") + "] " +
      (error ? error.message : "unknown error") +
      "\n" + (error && error.stack ? error.stack : "(no stack)")
    );
    if (_prev) _prev(error, isFatal);
  });
}
