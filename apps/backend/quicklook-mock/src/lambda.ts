/**
 * AWS Lambda entry point (Function URL). Test environments only, never the live event.
 */
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { handle } from './app.js';

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> {
  const headers: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(event.headers ?? {})) headers[key.toLowerCase()] = value;
  if (event.cookies?.length) headers.cookie = event.cookies.join('; ');
  const body = event.body
    ? event.isBase64Encoded
      ? Buffer.from(event.body, 'base64').toString('utf8')
      : event.body
    : '';

  const response = await handle({
    method: event.requestContext.http.method,
    path: event.rawPath,
    query: new URLSearchParams(event.rawQueryString ?? ''),
    headers,
    body,
    origin: `https://${event.requestContext.domainName}`,
  });
  return {
    statusCode: response.status,
    headers: response.headers,
    cookies: response.cookies,
    body: response.body,
  };
}
