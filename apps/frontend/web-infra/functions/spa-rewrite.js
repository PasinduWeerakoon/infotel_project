// CloudFront Function (viewer request): app routes such as /play/ent_123 serve index.html,
// files with an extension (/assets/index-abc.js) are served as they are.
function handler(event) {
  const request = event.request;
  const last = request.uri.split('/').pop();
  if (last.indexOf('.') === -1) request.uri = '/index.html';
  return request;
}
