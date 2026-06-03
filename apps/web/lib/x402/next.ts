import { NextRequest, NextResponse } from "next/server";
import {
  x402HTTPResourceServer,
  type HTTPAdapter,
  type HTTPRequestContext,
  type RouteConfig,
} from "@x402/core/http";
import { getX402ResourceServer } from "./facilitator";

class NextRequestX402Adapter implements HTTPAdapter {
  constructor(private readonly req: NextRequest) {}

  getHeader(name: string): string | undefined {
    return this.req.headers.get(name) ?? undefined;
  }

  getMethod(): string {
    return this.req.method;
  }

  getPath(): string {
    return this.req.nextUrl.pathname;
  }

  getUrl(): string {
    return this.req.url;
  }

  getAcceptHeader(): string {
    return this.req.headers.get("accept") ?? "";
  }

  getUserAgent(): string {
    return this.req.headers.get("user-agent") ?? "";
  }

  getQueryParams(): Record<string, string | string[]> {
    const params: Record<string, string | string[]> = {};
    this.req.nextUrl.searchParams.forEach((value, key) => {
      const current = params[key];
      if (Array.isArray(current)) params[key] = [...current, value];
      else if (current) params[key] = [current, value];
      else params[key] = value;
    });
    return params;
  }

  getQueryParam(name: string): string | string[] | undefined {
    const all = this.req.nextUrl.searchParams.getAll(name);
    if (all.length === 0) return undefined;
    if (all.length === 1) return all[0];
    return all;
  }
}

export async function withX402Payment(
  req: NextRequest,
  routeConfig: RouteConfig,
  handler: () => Promise<NextResponse>
): Promise<NextResponse> {
  if (process.env.X402_ENFORCE !== "true") {
    return handler();
  }

  const server = await getX402ResourceServer();
  const httpServer = new x402HTTPResourceServer(server, {
    [`${req.method} ${req.nextUrl.pathname}`]: routeConfig,
  });
  await httpServer.initialize();

  const requestContext: HTTPRequestContext = {
    adapter: new NextRequestX402Adapter(req),
    path: req.nextUrl.pathname,
    method: req.method,
    paymentHeader: req.headers.get("PAYMENT-SIGNATURE") ?? undefined,
  };

  const paymentResult = await httpServer.processHTTPRequest(requestContext);
  if (paymentResult.type === "payment-error") {
    return new NextResponse(
      serializeX402Body(paymentResult.response.body),
      {
        status: paymentResult.response.status,
        headers: paymentResult.response.headers,
      }
    );
  }

  const response = await handler();
  if (paymentResult.type !== "payment-verified") {
    return response;
  }

  const responseBody = Buffer.from(await response.clone().arrayBuffer());
  const responseHeaders = Object.fromEntries(response.headers.entries());
  const settlement = await httpServer.processSettlement(
    paymentResult.paymentPayload,
    paymentResult.paymentRequirements,
    paymentResult.declaredExtensions,
    {
      request: requestContext,
      responseBody,
      responseHeaders,
    }
  );

  if (!settlement.success) {
    return new NextResponse(
      serializeX402Body(settlement.response.body),
      {
        status: settlement.response.status,
        headers: settlement.response.headers,
      }
    );
  }

  const headers = new Headers(response.headers);
  Object.entries(settlement.headers).forEach(([key, value]) => {
    headers.set(key, value);
  });

  return new NextResponse(responseBody, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function serializeX402Body(body: unknown): BodyInit | null {
  if (body === undefined || body === null) return null;
  if (typeof body === "string") return body;
  return JSON.stringify(body);
}
