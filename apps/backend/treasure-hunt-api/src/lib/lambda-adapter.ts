/**
 * Converts API Gateway HTTP API (payload v2) events to `ApiRequest` and back.
 */
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { type ApiRequest, type ApiResponse, type RouteHandler, parseCookies } from './http.js';

export function toApiRequest(event: APIGatewayProxyEventV2): ApiRequest {
  const rawBody = event.body
    ? event.isBase64Encoded
      ? Buffer.from(event.body, 'base64').toString('utf8')
      : event.body
    : '';
  const headers: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(event.headers ?? {})) headers[key.toLowerCase()] = value;

  return {
    method: event.requestContext.http.method.toUpperCase(),
    path: event.rawPath,
    params: {},
    query: { ...(event.queryStringParameters ?? {}) },
    headers,
    cookies: parseCookies(event.cookies ?? headers.cookie),
    body: safeJson(rawBody),
    rawBody,
    requestId: event.requestContext.requestId,
  };
}

export function toLambdaResult(response: ApiResponse): APIGatewayProxyStructuredResultV2 {
  const isText = response.text !== undefined;
  return {
    statusCode: response.status,
    headers: {
      'content-type': isText ? 'text/plain; charset=utf-8' : 'application/json',
      'cache-control': 'no-store',
      ...response.headers,
    },
    cookies: response.cookies,
    body: isText ? response.text : response.body === undefined ? '' : JSON.stringify(response.body),
  };
}

/** Wraps a router as a Lambda handler. */
export function lambdaHandler(router: RouteHandler) {
  return async (event: APIGatewayProxyEventV2) => toLambdaResult(await router(toApiRequest(event)));
}

function safeJson(text: string): unknown {
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
