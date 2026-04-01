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
${SECURITY_HEADERS_SNIPPET}

// ── Rate Limiting (per-IP, in-memory per isolate) ────────────
const rateBuckets = new Map();
const RATE_LIMITS = { "/register": { max: 5, window: 60 }, "/token": { max: 20, window: 60 }, "/approve": { max: 10, window: 60 } };

function checkRate(ip, path) {
  const config = RATE_LIMITS[path];
  if (!config) return true;
  const key = ip + ":" + path;
  const now = Date.now();
  const entry = rateBuckets.get(key);
  if (!entry || now > entry.reset) {
    rateBuckets.set(key, { count: 1, reset: now + config.window * 1000 });
    return true;
  }
  entry.count++;
  return entry.count <= config.max;
}

const APP_URL = ${JSON.stringify(APP_URL)};

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;
    const origin = url.origin;
    const clientIp = request.headers.get("cf-connecting-ip") || "unknown";

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "content-type, accept, authorization, mcp-session-id",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS, DELETE",
      "Access-Control-Expose-Headers": "mcp-session-id",
    };

    function jsonResp(data, status = 200) {
      const h = new Headers(corsHeaders);
      h.set("Content-Type", "application/json");
      addSecurityHeaders(h);
      return new Response(JSON.stringify(data), { status, headers: h });
    }

    if (request.method === "OPTIONS") {
      const h = new Headers(corsHeaders);
      addSecurityHeaders(h);
      return new Response(null, { status: 204, headers: h });
    }

    // Rate limit sensitive endpoints at the edge
    const rateLimitPath = ["/register", "/token", "/approve"].find(p => path === p || path === p + "/");
    if (rateLimitPath && !checkRate(clientIp, rateLimitPath)) {
      return jsonResp({ error: "too_many_requests", error_description: "Rate limit exceeded. Try again later." }, 429);
    }

    if (
      path === "/.well-known/oauth-authorization-server" ||
      path === "/.well-known/openid-configuration" ||
      path === "/.well-known/oauth-authorization-server/mcp" ||
      path === "/.well-known/openid-configuration/mcp"
    ) {
      const h = new Headers(corsHeaders);
      h.set("Content-Type", "application/json");
      h.set("Cache-Control", "public, max-age=3600");
      addSecurityHeaders(h);
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
      }), { headers: h });
    }

    if (
      path === "/.well-known/oauth-protected-resource" ||
      path === "/.well-known/oauth-protected-resource/mcp"
    ) {
      const h = new Headers(corsHeaders);
      h.set("Content-Type", "application/json");
      h.set("Cache-Control", "public, max-age=3600");
      addSecurityHeaders(h);
      return new Response(JSON.stringify({
        resource: origin + "/mcp",
        authorization_servers: [origin],
        bearer_methods_supported: ["header"],
        scopes_supported: ["mcp"],
      }), { headers: h });
    }

    if (path === "/authorize" || path === "/authorize/") {
      if (request.method !== "GET") {
        return jsonResp({ error: "method_not_allowed" }, 405);
      }
      const redirectUrl = new URL(APP_URL + "/oauth/admin-mcp/authorize");
      redirectUrl.search = url.search;
      return Response.redirect(redirectUrl.toString(), 302);
    }

    // Proxy helper for auth endpoints
    async function proxyToAuth(oauthPath) {
      const UPSTREAM = "https://accdhfumccsrxmzdmpfi.supabase.co/functions/v1/admin-mcp-auth";
      const headers = new Headers(request.headers);
      headers.set("Host", "accdhfumccsrxmzdmpfi.supabase.co");
      headers.set("x-oauth-path", oauthPath);
      headers.set("x-forwarded-for", clientIp);

      const upstreamReq = new Request(UPSTREAM, {
        method: request.method,
        headers,
        body: request.method !== "GET" && request.method !== "HEAD" ? request.body : null,
        duplex: "half",
      });

      const response = await fetch(upstreamReq);
      const respHeaders = new Headers(response.headers);
      Object.entries(corsHeaders).forEach(([k, v]) => respHeaders.set(k, v));
      addSecurityHeaders(respHeaders);
      return new Response(response.body, { status: response.status, headers: respHeaders });
    }

    if (path === "/register" || path === "/register/") return proxyToAuth("/register");
    if (path === "/token" || path === "/token/") return proxyToAuth("/token");
    if (path === "/approve" || path === "/approve/") return proxyToAuth("/approve");

    // Default: proxy to admin MCP
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
    addSecurityHeaders(respHeaders);

    return new Response(response.body, { status: response.status, headers: respHeaders });
  },
};
`;

const SHARE_WORKER_SCRIPT = `
${SECURITY_HEADERS_SNIPPET}

const OG_META_URL = "https://accdhfumccsrxmzdmpfi.supabase.co/functions/v1/og-meta";
const SITE_URL = "https://prosecco.dev";
const ANON_KEY = "${Deno.env.get("SUPABASE_ANON_KEY") || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFjY2RoZnVtY2NzcnhtemRtcGZpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyMDIwMjAsImV4cCI6MjA4OTc3ODAyMH0.8jnNNpjSC6OfriUduScLnTAnNmyC2LdIetjXzF_5fHQ"}";

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: addSecurityHeaders(new Headers({
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
      })) });
    }

    // Match /standard/:id
    const match = path.match(new RegExp("^/standard/([a-f0-9-]+)$", "i"));
    if (!match) {
      // Redirect anything else to main site
      return Response.redirect(SITE_URL + path, 302);
    }

    const standardId = match[1];
    const ogUrl = OG_META_URL + "?id=" + encodeURIComponent(standardId);

    try {
      const ogResp = await fetch(ogUrl, {
        headers: { "apikey": ANON_KEY, "Authorization": "Bearer " + ANON_KEY },
      });
      if (ogResp.ok) {
        const h = new Headers(ogResp.headers);
        addSecurityHeaders(h);
        h.set("Cache-Control", "public, max-age=3600, s-maxage=86400");
        return new Response(ogResp.body, { status: 200, headers: h });
      }
    } catch (e) {
      // Fall through to redirect
    }

    // Fallback: redirect to main site
    return Response.redirect(SITE_URL + "/standard/" + standardId, 302);
  },
};
`;


async function deployWorker(
  cfToken: string,
  cfAccount: string,
  cfZone: string,
  workerName: string,
  script: string,
  domain: string,
  routePattern?: string
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

  if (routePattern) {
    // Use Worker Routes for domains that already have DNS records
    const listRes = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${cfZone}/workers/routes`,
      { headers: { Authorization: `Bearer ${cfToken}` } }
    );
    const listData = await listRes.json();
    const existing = listData.result?.find((r: { pattern: string }) => r.pattern === routePattern);

    if (existing) {
      // Update existing route
      await fetch(
        `https://api.cloudflare.com/client/v4/zones/${cfZone}/workers/routes/${existing.id}`,
        {
          method: "PUT",
          headers: { Authorization: `Bearer ${cfToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ pattern: routePattern, script: workerName }),
        }
      );
    } else {
      const routeRes = await fetch(
        `https://api.cloudflare.com/client/v4/zones/${cfZone}/workers/routes`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${cfToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ pattern: routePattern, script: workerName }),
        }
      );
      const routeData = await routeRes.json();
      if (!routeRes.ok) throw new Error(`Failed to set route ${routePattern}: ${JSON.stringify(routeData)}`);
    }
    return { worker: workerName, route: routePattern, url: `https://${domain}` };
  } else {
    // Use Worker Domains for subdomains
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

    // Support action=list-routes for debugging
    let body: any = {};
    try { body = await req.json(); } catch {}
    
    if (body.action === "list-routes") {
      const routesRes = await fetch(
        `https://api.cloudflare.com/client/v4/zones/${CF_ZONE}/workers/routes`,
        { headers: { Authorization: `Bearer ${CF_TOKEN}` } }
      );
      const routesData = await routesRes.json();
      return new Response(JSON.stringify(routesData, null, 2), {
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    if (body.action === "enable-proxy") {
      // Enable Cloudflare proxy on the prosecco.dev A record
      const dnsRes = await fetch(
        `https://api.cloudflare.com/client/v4/zones/${CF_ZONE}/dns_records?name=prosecco.dev&type=A`,
        { headers: { Authorization: `Bearer ${CF_TOKEN}` } }
      );
      const dnsData = await dnsRes.json();
      const record = dnsData.result?.[0];
      if (!record) return new Response(JSON.stringify({ error: "A record not found" }), { status: 404 });

      const updateRes = await fetch(
        `https://api.cloudflare.com/client/v4/zones/${CF_ZONE}/dns_records/${record.id}`,
        {
          method: "PATCH",
          headers: { Authorization: `Bearer ${CF_TOKEN}`, "Content-Type": "application/json" },
          body: JSON.stringify({ proxied: true }),
        }
      );
      const updateData = await updateRes.json();
      return new Response(JSON.stringify(updateData, null, 2), {
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    if (body.action === "delete-route") {
      const routeId = body.route_id;
      if (!routeId) return new Response(JSON.stringify({ error: "route_id required" }), { status: 400 });
      const delRes = await fetch(
        `https://api.cloudflare.com/client/v4/zones/${CF_ZONE}/workers/routes/${routeId}`,
        { method: "DELETE", headers: { Authorization: `Bearer ${CF_TOKEN}` } }
      );
      const delData = await delRes.json();
      return new Response(JSON.stringify(delData, null, 2), {
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const results = [];
    results.push(await deployWorker(CF_TOKEN, CF_ACCOUNT, CF_ZONE, "prosecco-mcp-proxy", PUBLIC_WORKER_SCRIPT, "mcp.prosecco.dev"));
    results.push(await deployWorker(CF_TOKEN, CF_ACCOUNT, CF_ZONE, "prosecco-admin-mcp-proxy", ADMIN_WORKER_SCRIPT, "admin.prosecco.dev"));
    results.push(await deployWorker(CF_TOKEN, CF_ACCOUNT, CF_ZONE, "prosecco-share", SHARE_WORKER_SCRIPT, "share.prosecco.dev"));

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
