import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const ALLOWED_ORIGINS = [
  "https://prosecco.dev",
  "https://www.prosecco.dev",
  "https://prosecco-ai-standards.lovable.app",
];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
    "Vary": "Origin",
  };
}

const APP_URL = "https://id-preview--477feacf-8b45-4c31-ba59-3c1bb9613fad.lovable.app";

// Two workers: public MCP proxy + admin MCP proxy
const SECURITY_HEADERS_SNIPPET = `
const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
};

function addSecurityHeaders(headers) {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
    headers.set(k, v);
  }
  return headers;
}
`;

const PUBLIC_WORKER_SCRIPT = `
${SECURITY_HEADERS_SNIPPET}

export default {
  async fetch(request) {
    const UPSTREAM = "https://accdhfumccsrxmzdmpfi.supabase.co/functions/v1/mcp";
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: addSecurityHeaders(new Headers({
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "content-type, accept, mcp-session-id",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS, DELETE",
          "Access-Control-Expose-Headers": "mcp-session-id",
        })),
      });
    }

    const headers = new Headers(request.headers);
    headers.set("Host", "accdhfumccsrxmzdmpfi.supabase.co");

    const upstreamReq = new Request(UPSTREAM + url.search, {
      method: request.method,
      headers,
      body: request.method !== "GET" && request.method !== "HEAD" ? request.body : null,
      duplex: "half",
    });

    const response = await fetch(upstreamReq);
    const respHeaders = new Headers(response.headers);
    respHeaders.set("Access-Control-Allow-Origin", "*");
    respHeaders.set("Access-Control-Allow-Headers", "content-type, accept, mcp-session-id");
    respHeaders.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS, DELETE");
    respHeaders.set("Access-Control-Expose-Headers", "mcp-session-id");
    addSecurityHeaders(respHeaders);

    return new Response(response.body, { status: response.status, headers: respHeaders });
  },
};
`;

const ADMIN_WORKER_SCRIPT = `
const APP_URL = ${JSON.stringify(APP_URL)};

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;
    const origin = url.origin;

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "content-type, accept, authorization, mcp-session-id",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS, DELETE",
      "Access-Control-Expose-Headers": "mcp-session-id",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: getCorsHeaders(req) });
    }

    if (
      path === "/.well-known/oauth-authorization-server" ||
      path === "/.well-known/openid-configuration" ||
      path === "/.well-known/oauth-authorization-server/mcp" ||
      path === "/.well-known/openid-configuration/mcp"
    ) {
      return new Response(JSON.stringify({
        issuer: origin,
        authorization_endpoint: origin + "/authorize",
        token_endpoint: origin + "/token",
        registration_endpoint: origin + "/register",
        grant_types_supported: ["authorization_code", "client_credentials"],
        response_types_supported: ["code"],
        token_endpoint_auth_methods_supported: ["client_secret_post"],
        code_challenge_methods_supported: ["S256"],
        scopes_supported: ["mcp"],
        service_documentation: "https://prosecco.dev/mcp",
      }), {
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json", "Cache-Control": "public, max-age=3600" },
      });
    }

    if (
      path === "/.well-known/oauth-protected-resource" ||
      path === "/.well-known/oauth-protected-resource/mcp"
    ) {
      return new Response(JSON.stringify({
        resource: origin + "/mcp",
        authorization_servers: [origin],
        bearer_methods_supported: ["header"],
        scopes_supported: ["mcp"],
      }), {
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json", "Cache-Control": "public, max-age=3600" },
      });
    }

    if (path === "/authorize" || path === "/authorize/") {
      if (request.method !== "GET") {
        return new Response(JSON.stringify({ error: "method_not_allowed" }), {
          status: 405,
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }

      const redirectUrl = new URL(APP_URL + "/oauth/admin-mcp/authorize");
      redirectUrl.search = url.search;
      return Response.redirect(redirectUrl.toString(), 302);
    }

    if (path === "/register" || path === "/register/") {
      const UPSTREAM = "https://accdhfumccsrxmzdmpfi.supabase.co/functions/v1/admin-mcp-auth";
      const headers = new Headers(request.headers);
      headers.set("Host", "accdhfumccsrxmzdmpfi.supabase.co");
      headers.set("x-oauth-path", "/register");

      const upstreamReq = new Request(UPSTREAM, {
        method: request.method,
        headers,
        body: request.method !== "GET" && request.method !== "HEAD" ? request.body : null,
        duplex: "half",
      });

      const response = await fetch(upstreamReq);
      const respHeaders = new Headers(response.headers);
      Object.entries(corsHeaders).forEach(([k, v]) => respHeaders.set(k, v));
      return new Response(response.body, { status: response.status, headers: respHeaders });
    }

    if (path === "/token" || path === "/token/") {
      const UPSTREAM = "https://accdhfumccsrxmzdmpfi.supabase.co/functions/v1/admin-mcp-auth";
      const headers = new Headers(request.headers);
      headers.set("Host", "accdhfumccsrxmzdmpfi.supabase.co");
      headers.set("x-oauth-path", "/token");

      const upstreamReq = new Request(UPSTREAM, {
        method: request.method,
        headers,
        body: request.method !== "GET" && request.method !== "HEAD" ? request.body : null,
        duplex: "half",
      });

      const response = await fetch(upstreamReq);
      const respHeaders = new Headers(response.headers);
      Object.entries(corsHeaders).forEach(([k, v]) => respHeaders.set(k, v));
      return new Response(response.body, { status: response.status, headers: respHeaders });
    }

    if (path === "/approve" || path === "/approve/") {
      const UPSTREAM = "https://accdhfumccsrxmzdmpfi.supabase.co/functions/v1/admin-mcp-auth";
      const headers = new Headers(request.headers);
      headers.set("Host", "accdhfumccsrxmzdmpfi.supabase.co");
      headers.set("x-oauth-path", "/approve");

      const upstreamReq = new Request(UPSTREAM, {
        method: request.method,
        headers,
        body: request.method !== "GET" && request.method !== "HEAD" ? request.body : null,
        duplex: "half",
      });

      const response = await fetch(upstreamReq);
      const respHeaders = new Headers(response.headers);
      Object.entries(corsHeaders).forEach(([k, v]) => respHeaders.set(k, v));
      return new Response(response.body, { status: response.status, headers: respHeaders });
    }

    const UPSTREAM = "https://accdhfumccsrxmzdmpfi.supabase.co/functions/v1/admin-mcp";
    const headers = new Headers(request.headers);
    headers.set("Host", "accdhfumccsrxmzdmpfi.supabase.co");

    const upstreamReq = new Request(UPSTREAM + url.search, {
      method: request.method,
      headers,
      body: request.method !== "GET" && request.method !== "HEAD" ? request.body : null,
      duplex: "half",
    });

    const response = await fetch(upstreamReq);
    const respHeaders = new Headers(response.headers);
    Object.entries(corsHeaders).forEach(([k, v]) => respHeaders.set(k, v));

    return new Response(response.body, { status: response.status, headers: respHeaders });
  },
};
`;

async function deployWorker(
  cfToken: string,
  cfAccount: string,
  cfZone: string,
  workerName: string,
  script: string,
  domain: string
) {
  const metadata = JSON.stringify({ main_module: "worker.js", compatibility_date: "2024-01-01" });
  const formData = new FormData();
  formData.append("metadata", new Blob([metadata], { type: "application/json" }));
  formData.append("worker.js", new Blob([script], { type: "application/javascript+module" }), "worker.js");

  const uploadRes = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${cfAccount}/workers/scripts/${workerName}`,
    { method: "PUT", headers: { Authorization: `Bearer ${cfToken}` }, body: formData }
  );
  const uploadData = await uploadRes.json();
  if (!uploadRes.ok) throw new Error(`Failed to upload ${workerName}: ${JSON.stringify(uploadData)}`);

  const listRes = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${cfAccount}/workers/domains`,
    { headers: { Authorization: `Bearer ${cfToken}` } }
  );
  const listData = await listRes.json();
  const existing = listData.result?.find((d: { hostname: string }) => d.hostname === domain);

  if (!existing) {
    const domainRes = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${cfAccount}/workers/domains`,
      {
        method: "PUT",
        headers: { Authorization: `Bearer ${cfToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ hostname: domain, zone_id: cfZone, service: workerName, environment: "production" }),
      }
    );
    const domainData = await domainRes.json();
    if (!domainRes.ok) throw new Error(`Failed to set domain ${domain}: ${JSON.stringify(domainData)}`);
  }

  return { worker: workerName, domain, url: `https://${domain}` };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  try {
    const CF_TOKEN = Deno.env.get("CLOUDFLARE_API_TOKEN")!;
    const CF_ACCOUNT = Deno.env.get("CLOUDFLARE_ACCOUNT_ID")!;
    const CF_ZONE = Deno.env.get("CLOUDFLARE_ZONE_ID")!;

    if (!CF_TOKEN || !CF_ACCOUNT || !CF_ZONE) throw new Error("Missing Cloudflare credentials");

    const results = [];
    results.push(await deployWorker(CF_TOKEN, CF_ACCOUNT, CF_ZONE, "prosecco-mcp-proxy", PUBLIC_WORKER_SCRIPT, "mcp.prosecco.dev"));
    results.push(await deployWorker(CF_TOKEN, CF_ACCOUNT, CF_ZONE, "prosecco-admin-mcp-proxy", ADMIN_WORKER_SCRIPT, "admin.prosecco.dev"));

    return new Response(JSON.stringify({ success: true, workers: results }), {
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("deploy-cf-worker error:", err);
    return new Response(JSON.stringify({ success: false, error: String(err) }), {
      status: 500,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
