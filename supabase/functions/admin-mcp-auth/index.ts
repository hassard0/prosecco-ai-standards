import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function hashSecret(secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(secret);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function signToken(payload: Record<string, unknown>, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  const body = btoa(JSON.stringify(payload))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  const signingInput = `${header}.${body}`;

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(signingInput));
  const signature = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  return `${signingInput}.${signature}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const signingSecret = Deno.env.get("MCP_SIGNING_SECRET");

    if (!signingSecret) {
      throw new Error("MCP_SIGNING_SECRET not configured");
    }

    const contentType = req.headers.get("content-type") || "";
    let clientId: string | null = null;
    let clientSecret: string | null = null;
    let grantType: string | null = null;

    // Support both form-urlencoded (OAuth spec) and JSON
    if (contentType.includes("application/x-www-form-urlencoded")) {
      const form = new URLSearchParams(await req.text());
      clientId = form.get("client_id");
      clientSecret = form.get("client_secret");
      grantType = form.get("grant_type");
    } else {
      const text = await req.text();
      if (!text || text.trim().length === 0) {
        return new Response(
          JSON.stringify({ error: "invalid_request", error_description: "Request body is empty. Send grant_type, client_id, and client_secret as form-urlencoded or JSON." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      try {
        const body = JSON.parse(text);
        clientId = body.client_id;
        clientSecret = body.client_secret;
        grantType = body.grant_type;
      } catch {
        return new Response(
          JSON.stringify({ error: "invalid_request", error_description: "Could not parse request body. Use application/x-www-form-urlencoded or valid JSON." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    if (grantType !== "client_credentials") {
      return new Response(
        JSON.stringify({ error: "unsupported_grant_type", error_description: "Only client_credentials grant is supported" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!clientId || !clientSecret) {
      return new Response(
        JSON.stringify({ error: "invalid_request", error_description: "client_id and client_secret are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // Look up client
    const { data: client, error: dbError } = await supabase
      .from("api_clients")
      .select("id, client_id, client_secret_hash, name, created_by, revoked_at")
      .eq("client_id", clientId)
      .maybeSingle();

    if (dbError || !client) {
      return new Response(
        JSON.stringify({ error: "invalid_client", error_description: "Client not found" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (client.revoked_at) {
      return new Response(
        JSON.stringify({ error: "invalid_client", error_description: "Client has been revoked" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify secret
    const secretHash = await hashSecret(clientSecret);
    if (secretHash !== client.client_secret_hash) {
      return new Response(
        JSON.stringify({ error: "invalid_client", error_description: "Invalid client secret" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Issue token (1 hour expiry)
    const now = Math.floor(Date.now() / 1000);
    const expiresIn = 3600;
    const token = await signToken(
      {
        sub: client.client_id,
        client_name: client.name,
        created_by: client.created_by,
        iat: now,
        exp: now + expiresIn,
        iss: "prosecco-admin-mcp",
      },
      signingSecret
    );

    return new Response(
      JSON.stringify({
        access_token: token,
        token_type: "Bearer",
        expires_in: expiresIn,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (err) {
    console.error("Token endpoint error:", err);
    return new Response(
      JSON.stringify({ error: "server_error", error_description: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
