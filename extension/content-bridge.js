const WEB_SOURCE = 'module-web';
const EXTENSION_SOURCE = 'module-extension';
const REQUEST_TYPE = 'MODULE_FOCUS_REQUEST';
const RESPONSE_TYPE = 'MODULE_FOCUS_RESPONSE';

window.addEventListener('message', (event) => {
  if (event.source !== window || event.origin !== window.location.origin) return;

  const message = event.data;
  if (
    !message ||
    message.source !== WEB_SOURCE ||
    message.type !== REQUEST_TYPE ||
    typeof message.requestId !== 'string'
  ) {
    return;
  }

  chrome.runtime.sendMessage(message.payload, (response) => {
    const runtimeError = chrome.runtime.lastError;

    window.postMessage(
      {
        source: EXTENSION_SOURCE,
        type: RESPONSE_TYPE,
        requestId: message.requestId,
        response: runtimeError
          ? {
              ok: false,
              error: runtimeError.message || 'Module Focus extension bridge failed.'
            }
          : response ?? {
              ok: false,
              error: 'Module Focus extension returned no response.'
            }
      },
      window.location.origin
    );
  });
});
