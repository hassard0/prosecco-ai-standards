import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const WORKER_SCRIPT = `
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

    return new Response(response.body, {
      status: response.status,
      headers: respHeaders,
    });
  },
};
`;

const WORKER_NAME = "prosecco-mcp-proxy";
const CUSTOM_DOMAIN = "mcp.prosecco.dev";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const CF_TOKEN = Deno.env.get("CLOUDFLARE_API_TOKEN");
    const CF_ACCOUNT = Deno.env.get("CLOUDFLARE_ACCOUNT_ID");
    const CF_ZONE = Deno.env.get("CLOUDFLARE_ZONE_ID");

    if (!CF_TOKEN || !CF_ACCOUNT || !CF_ZONE) {
      throw new Error("Missing Cloudflare credentials");
    }

    // Step 1: Upload the worker script as ES module
    console.log("Uploading worker script...");

    const metadata = JSON.stringify({
      main_module: "worker.js",
      compatibility_date: "2024-01-01",
    });

    const formData = new FormData();
    formData.append(
      "metadata",
      new Blob([metadata], { type: "application/json" })
    );
    formData.append(
      "worker.js",
      new Blob([WORKER_SCRIPT], { type: "application/javascript+module" }),
      "worker.js"
    );

    const uploadRes = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/workers/scripts/${WORKER_NAME}`,
      {
        method: "PUT",
        headers: { Authorization: `Bearer ${CF_TOKEN}` },
        body: formData,
      }
    );

    const uploadData = await uploadRes.json();
    if (!uploadRes.ok) {
      throw new Error(`Failed to upload worker: ${JSON.stringify(uploadData)}`);
    }
    console.log("Worker uploaded successfully");

    // Step 2: Set up custom domain for the worker
    console.log("Setting up custom domain...");

    // Check existing custom domains
    const listDomainsRes = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/workers/domains`,
      { headers: { Authorization: `Bearer ${CF_TOKEN}` } }
    );
    const listDomainsData = await listDomainsRes.json();
    const existingDomain = listDomainsData.result?.find(
      (d: { hostname: string }) => d.hostname === CUSTOM_DOMAIN
    );

    if (!existingDomain) {
      // Create custom domain
      const domainRes = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/workers/domains`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${CF_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            hostname: CUSTOM_DOMAIN,
            zone_id: CF_ZONE,
            service: WORKER_NAME,
            environment: "production",
          }),
        }
      );
      const domainData = await domainRes.json();
      if (!domainRes.ok) {
        throw new Error(`Failed to set custom domain: ${JSON.stringify(domainData)}`);
      }
      console.log("Custom domain created:", CUSTOM_DOMAIN);
    } else {
      console.log("Custom domain already exists:", CUSTOM_DOMAIN);
    }

    return new Response(
      JSON.stringify({
        success: true,
        worker: WORKER_NAME,
        domain: CUSTOM_DOMAIN,
        url: `https://${CUSTOM_DOMAIN}`,
        message: `MCP proxy worker deployed to https://${CUSTOM_DOMAIN}`,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("deploy-cf-worker error:", err);
    return new Response(
      JSON.stringify({ success: false, error: String(err) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
