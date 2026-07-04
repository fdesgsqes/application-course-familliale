import serverModule from "../../server.js";

const { netlifyHandler } = serverModule;

export default async function handler(request) {
  const url = new URL(request.url);
  const body = request.method === "GET" || request.method === "HEAD"
    ? ""
    : await request.text();
  const headers = Object.fromEntries(request.headers.entries());
  const result = await netlifyHandler({
    httpMethod: request.method,
    path: url.pathname,
    rawQuery: url.search ? url.search.slice(1) : "",
    headers,
    body,
    isBase64Encoded: false
  });

  return new Response(result.body, {
    status: result.statusCode,
    headers: result.headers
  });
}
