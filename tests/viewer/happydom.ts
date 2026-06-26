// Registers a happy-dom global environment (window/document/etc.) for viewer
// React tests running under `bun test`. Import this module FIRST in any
// DOM-dependent test file — ESM evaluates imported modules in source order, so
// the registration here completes before @testing-library/react (and react-dom)
// evaluate. The guard makes repeated imports across files idempotent within the
// shared bun test process.
//
// The whole `bun test` suite shares ONE process, so GlobalRegistrator.register()
// replaces runtime/network primitives (fetch/Response/AbortController/URL/streams
// /...) process-wide. Non-DOM test files (server, SSE, CORS) rely on Bun's native
// implementations hitting real local servers, and happy-dom's stand-ins either
// behave differently or never connect — so a viewer test running earlier in the
// shared process would break them (observed: SSE clients hanging to a 5s timeout).
//
// Viewer tests stub fetch themselves (or mock the data hook) and never need
// happy-dom's networking, so we restore Bun's native runtime/network primitives
// immediately after registering the DOM. We keep every DOM-only global happy-dom
// ADDED (window, document, HTMLElement, Event, Node, ...) untouched so rendering
// and event dispatch still work.
import { GlobalRegistrator } from '@happy-dom/global-registrator';

declare global {
  // eslint-disable-next-line no-var
  var __HAPPY_DOM_REGISTERED__: boolean | undefined;
}

// Runtime/network/stream primitives that server-side tests depend on and that
// DOM rendering does not care about. Restored to their pre-registration values.
const NATIVE_PRIMITIVE_KEYS = [
  'fetch',
  'Response',
  'Request',
  'Headers',
  'WebSocket',
  'XMLHttpRequest',
  'AbortController',
  'AbortSignal',
  'URL',
  'URLSearchParams',
  'Blob',
  'File',
  'FormData',
  'ReadableStream',
  'WritableStream',
  'TransformStream',
] as const;

if (!globalThis.__HAPPY_DOM_REGISTERED__) {
  const target = globalThis as Record<string, unknown>;
  const hadKey = new Map<string, boolean>();
  const nativeValues = new Map<string, unknown>();
  for (const key of NATIVE_PRIMITIVE_KEYS) {
    hadKey.set(key, key in target);
    nativeValues.set(key, target[key]);
  }

  GlobalRegistrator.register();

  for (const key of NATIVE_PRIMITIVE_KEYS) {
    if (hadKey.get(key)) {
      target[key] = nativeValues.get(key);
    } else {
      delete target[key];
    }
  }

  globalThis.__HAPPY_DOM_REGISTERED__ = true;
}
