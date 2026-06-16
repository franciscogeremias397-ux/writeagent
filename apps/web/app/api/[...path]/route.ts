import { NextRequest, NextResponse } from "next/server";

const backendBase = process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:3001";

type RouteContext = {
  params: {
    path?: string[];
  };
};

function backendUrl(request: NextRequest, context: RouteContext) {
  const path = context.params.path?.join("/") ?? "";
  const url = new URL(request.url);
  const backend = new URL(`/api/${path}`, backendBase);

  backend.search = url.search;

  return backend.toString();
}

async function proxyRequest(request: NextRequest, context: RouteContext) {
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("content-length");

  const response = await fetch(backendUrl(request, context), {
    method: request.method,
    headers,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer(),
    cache: "no-store"
  });
  const responseHeaders = new Headers(response.headers);
  responseHeaders.delete("content-encoding");
  responseHeaders.delete("content-length");

  return new NextResponse(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders
  });
}

export function GET(request: NextRequest, context: RouteContext) {
  return proxyRequest(request, context);
}

export function POST(request: NextRequest, context: RouteContext) {
  return proxyRequest(request, context);
}

export function PATCH(request: NextRequest, context: RouteContext) {
  return proxyRequest(request, context);
}

export function DELETE(request: NextRequest, context: RouteContext) {
  return proxyRequest(request, context);
}
