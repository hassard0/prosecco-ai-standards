import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Two workers: public MCP proxy + admin MCP proxy
const PUBLIC_WORKER_SCRIPT = `
export default {
  async fetch(request) {
    const UPSTREAM = "https://accdhfumccsrxmzdmpfi.supabase.co/functions/v1/mcp";
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "content-type, accept, mcp-session-id",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS, DELETE",
          "Access-Control-Expose-Headers": "mcp-session-id",
        },
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

    return new Response(response.body, { status: response.status, headers: respHeaders });
  },
};
`;

const ADMIN_WORKER_SCRIPT = `
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
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // OAuth 2.1 Authorization Server Metadata (RFC 8414)
    if (path === "/.well-known/oauth-authorization-server" || path === "/.well-known/openid-configuration") {
      return new Response(JSON.stringify({
        issuer: origin,
        token_endpoint: origin + "/token",
        registration_endpoint: origin + "/register",
        grant_types_supported: ["client_credentials"],
        token_endpoint_auth_methods_supported: ["client_secret_post"],
        response_types_supported: ["token"],
        scopes_supported: ["mcp"],
        service_documentation: "https://prosecco.dev/mcp",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "public, max-age=3600" },
      });
    }

    // Dynamic client registration stub — returns instructions
    if (path === "/register" || path === "/register/") {
      return new Response(JSON.stringify({
        error: "registration_not_supported",
        error_description: "Dynamic client registration is not supported. Please create API clients at https://prosecco.dev/admin/users",
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Route /token to the auth endpoint
    if (path === "/token" || path === "/token/") {
      const UPSTREAM = "https://accdhfumccsrxmzdmpfi.supabase.co/functions/v1/admin-mcp-auth";

      const headers = new Headers(request.headers);
      headers.set("Host", "accdhfumccsrxmzdmpfi.supabase.co");

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

    // Everything else goes to the admin MCP server
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

  // Set up custom domain
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
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const CF_TOKEN = Deno.env.get("CLOUDFLARE_API_TOKEN")!;
    const CF_ACCOUNT = Deno.env.get("CLOUDFLARE_ACCOUNT_ID")!;
    const CF_ZONE = Deno.env.get("CLOUDFLARE_ZONE_ID")!;

    if (!CF_TOKEN || !CF_ACCOUNT || !CF_ZONE) throw new Error("Missing Cloudflare credentials");

    const results = [];

    // Deploy public MCP proxy
    results.push(await deployWorker(CF_TOKEN, CF_ACCOUNT, CF_ZONE, "prosecco-mcp-proxy", PUBLIC_WORKER_SCRIPT, "mcp.prosecco.dev"));

    // Deploy admin MCP proxy
    results.push(await deployWorker(CF_TOKEN, CF_ACCOUNT, CF_ZONE, "prosecco-admin-mcp-proxy", ADMIN_WORKER_SCRIPT, "admin.prosecco.dev"));

    return new Response(JSON.stringify({ success: true, workers: results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("deploy-cf-worker error:", err);
    return new Response(JSON.stringify({ success: false, error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
