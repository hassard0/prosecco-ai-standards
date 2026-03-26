import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-oauth-path",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const signingSecret = Deno.env.get("MCP_SIGNING_SECRET")!;

function getServiceSupabase() {
  return createClient(supabaseUrl, serviceKey);
}

function base64UrlEncode(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function randomToken(bytes = 32) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return base64UrlEncode(arr);
}

async function hashSecret(secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(secret);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Base64Url(value: string): Promise<string> {
  const encoder = new TextEncoder();
  const hash = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return base64UrlEncode(new Uint8Array(hash));
}

async function signToken(payload: Record<string, unknown>, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" })).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const body = btoa(JSON.stringify(payload)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const signingInput = `${header}.${body}`;

  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(signingInput));
  const signature = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

  return `${signingInput}.${signature}`;
}

async function parseBody(req: Request): Promise<Record<string, unknown>> {
  const contentType = req.headers.get("content-type") || "";

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const form = new URLSearchParams(await req.text());
    return Object.fromEntries(form.entries());
  }

  const text = await req.text();
  if (!text.trim()) return {};
  return JSON.parse(text);
}

function json(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...headers },
  });
}

async function registerDynamicClient(req: Request) {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const body = await parseBody(req);
  const redirectUris = Array.isArray(body.redirect_uris)
    ? body.redirect_uris.filter((value): value is string => typeof value === "string" && value.startsWith("http"))
    : [];
  const clientName = typeof body.client_name === "string" && body.client_name.trim() ? body.client_name.trim().slice(0, 120) : "ChatGPT MCP Client";

  if (!redirectUris.length) {
    return json({ error: "invalid_client_metadata", error_description: "redirect_uris is required" }, 400);
  }

  const sb = getServiceSupabase();
  const { data: owner, error: ownerError } = await sb
    .from("user_roles")
    .select("user_id")
    .eq("role", "admin")
    .limit(1)
    .maybeSingle();

  if (ownerError || !owner) {
    return json({ error: "server_error", error_description: "No admin account is available to register clients" }, 500);
  }

  const clientId = `prs_dyn_${randomToken(15).toLowerCase()}`;
  const clientSecret = randomToken(32);
  const clientSecretHash = await hashSecret(clientSecret);
  const now = Math.floor(Date.now() / 1000);

  const { error } = await sb.from("api_clients").insert({
    client_id: clientId,
    client_secret_hash: clientSecretHash,
    name: clientName,
    created_by: owner.user_id,
    redirect_uris: redirectUris,
    grant_types: ["authorization_code"],
    token_endpoint_auth_method: "client_secret_post",
    is_dynamic: true,
  } as never);

  if (error) {
    return json({ error: "server_error", error_description: error.message }, 500);
  }

  return json({
    client_id: clientId,
    client_secret: clientSecret,
    client_id_issued_at: now,
    client_secret_expires_at: 0,
    client_name: clientName,
    redirect_uris: redirectUris,
    grant_types: ["authorization_code"],
    response_types: ["code"],
    token_endpoint_auth_method: "client_secret_post",
    scope: "mcp",
  }, 201, { "Cache-Control": "no-store" });
}

async function approveAuthorization(req: Request) {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return json({ error: "unauthorized", error_description: "Sign in required" }, 401);
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: authData, error: authError } = await authClient.auth.getUser();
  const user = authData.user;

  if (authError || !user) {
    return json({ error: "unauthorized", error_description: "Could not verify your session" }, 401);
  }

  const sb = getServiceSupabase();
  const { data: roles, error: rolesError } = await sb.from("user_roles").select("role").eq("user_id", user.id);
  if (rolesError) return json({ error: "server_error", error_description: rolesError.message }, 500);

  const allowed = (roles || []).some((row) => row.role === "admin" || row.role === "contributor");
  if (!allowed) {
    return json({ error: "forbidden", error_description: "You do not have access to authorize the admin MCP server" }, 403);
  }

  const body = await parseBody(req);
  const clientId = typeof body.client_id === "string" ? body.client_id : "";
  const redirectUri = typeof body.redirect_uri === "string" ? body.redirect_uri : "";
  const state = typeof body.state === "string" ? body.state : null;
  const codeChallenge = typeof body.code_challenge === "string" ? body.code_challenge : "";
  const codeChallengeMethod = typeof body.code_challenge_method === "string" ? body.code_challenge_method : "plain";
  const scope = typeof body.scope === "string" && body.scope.trim() ? body.scope.trim() : "mcp";

  if (!clientId || !redirectUri || !codeChallenge || codeChallengeMethod !== "S256") {
    return json({ error: "invalid_request", error_description: "Missing OAuth authorization parameters" }, 400);
  }

  const { data: client, error: clientError } = await sb
    .from("api_clients")
    .select("id, client_id, redirect_uris, revoked_at, is_dynamic")
    .eq("client_id", clientId)
    .maybeSingle();

  if (clientError || !client) return json({ error: "invalid_client", error_description: "Client not found" }, 400);
  if (client.revoked_at) return json({ error: "invalid_client", error_description: "Client has been revoked" }, 400);
  if (!client.redirect_uris.includes(redirectUri)) {
    return json({ error: "invalid_request", error_description: "redirect_uri is not registered for this client" }, 400);
  }

  const code = randomToken(32);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  const { error: codeError } = await sb.from("oauth_authorization_codes").insert({
    code,
    client_id: clientId,
    user_id: user.id,
    redirect_uri: redirectUri,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    scope,
    expires_at: expiresAt,
  } as never);

  if (codeError) return json({ error: "server_error", error_description: codeError.message }, 500);

  if (client.is_dynamic) {
    await sb.from("api_clients").update({ created_by: user.id } as never).eq("client_id", clientId);
  }

  const callbackUrl = new URL(redirectUri);
  callbackUrl.searchParams.set("code", code);
  if (state) callbackUrl.searchParams.set("state", state);

  return json({ redirect_to: callbackUrl.toString() });
}

async function issueToken(req: Request) {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const body = await parseBody(req);
  const grantType = typeof body.grant_type === "string" ? body.grant_type : null;
  const clientId = typeof body.client_id === "string" ? body.client_id : null;
  const clientSecret = typeof body.client_secret === "string" ? body.client_secret : null;

  if (!grantType) {
    return json({ error: "invalid_request", error_description: "grant_type is required" }, 400);
  }

  const sb = getServiceSupabase();

  if (grantType === "authorization_code") {
    const code = typeof body.code === "string" ? body.code : "";
    const redirectUri = typeof body.redirect_uri === "string" ? body.redirect_uri : "";
    const codeVerifier = typeof body.code_verifier === "string" ? body.code_verifier : "";
    const resource = typeof body.resource === "string" ? body.resource : undefined;

    if (!clientId || !clientSecret || !code || !redirectUri || !codeVerifier) {
      return json({ error: "invalid_request", error_description: "client_id, client_secret, code, redirect_uri, and code_verifier are required" }, 400);
    }

    const { data: client, error: clientError } = await sb
      .from("api_clients")
      .select("client_id, client_secret_hash, name, created_by, revoked_at")
      .eq("client_id", clientId)
      .maybeSingle();

    if (clientError || !client) return json({ error: "invalid_client", error_description: "Client not found" }, 401);
    if (client.revoked_at) return json({ error: "invalid_client", error_description: "Client has been revoked" }, 401);

    const secretHash = await hashSecret(clientSecret);
    if (secretHash !== client.client_secret_hash) {
      return json({ error: "invalid_client", error_description: "Invalid client secret" }, 401);
    }

    const { data: authCode, error: codeError } = await sb
      .from("oauth_authorization_codes")
      .select("id, user_id, redirect_uri, code_challenge, code_challenge_method, scope, expires_at, used_at")
      .eq("code", code)
      .eq("client_id", clientId)
      .maybeSingle();

    if (codeError || !authCode) return json({ error: "invalid_grant", error_description: "Authorization code not found" }, 400);
    if (authCode.used_at) return json({ error: "invalid_grant", error_description: "Authorization code has already been used" }, 400);
    if (authCode.redirect_uri !== redirectUri) return json({ error: "invalid_grant", error_description: "redirect_uri does not match" }, 400);
    if (new Date(authCode.expires_at).getTime() <= Date.now()) {
      return json({ error: "invalid_grant", error_description: "Authorization code has expired" }, 400);
    }

    const expectedChallenge = await sha256Base64Url(codeVerifier);
    if (authCode.code_challenge_method !== "S256" || expectedChallenge !== authCode.code_challenge) {
      return json({ error: "invalid_grant", error_description: "PKCE verification failed" }, 400);
    }

    await sb.from("oauth_authorization_codes").update({ used_at: new Date().toISOString() } as never).eq("id", authCode.id);

    const now = Math.floor(Date.now() / 1000);
    const expiresIn = 3600;
    const token = await signToken({
      sub: client.client_id,
      client_name: client.name,
      created_by: authCode.user_id,
      authorized_user_id: authCode.user_id,
      scope: authCode.scope,
      iat: now,
      exp: now + expiresIn,
      iss: "prosecco-admin-mcp",
    }, signingSecret);

    return json({
      access_token: token,
      token_type: "Bearer",
      expires_in: expiresIn,
      scope: authCode.scope,
      ...(resource ? { resource } : {}),
    }, 200, { "Cache-Control": "no-store" });
  }

  if (grantType !== "client_credentials") {
    return json({ error: "unsupported_grant_type", error_description: "Supported grants: authorization_code, client_credentials" }, 400);
  }

  if (!clientId || !clientSecret) {
    return json({ error: "invalid_request", error_description: "client_id and client_secret are required" }, 400);
  }

  const { data: client, error: dbError } = await sb
    .from("api_clients")
    .select("client_id, client_secret_hash, name, created_by, revoked_at")
    .eq("client_id", clientId)
    .maybeSingle();

  if (dbError || !client) return json({ error: "invalid_client", error_description: "Client not found" }, 401);
  if (client.revoked_at) return json({ error: "invalid_client", error_description: "Client has been revoked" }, 401);

  const secretHash = await hashSecret(clientSecret);
  if (secretHash !== client.client_secret_hash) {
    return json({ error: "invalid_client", error_description: "Invalid client secret" }, 401);
  }

  const now = Math.floor(Date.now() / 1000);
  const expiresIn = 3600;
  const token = await signToken({
    sub: client.client_id,
    client_name: client.name,
    created_by: client.created_by,
    scope: "mcp",
    iat: now,
    exp: now + expiresIn,
    iss: "prosecco-admin-mcp",
  }, signingSecret);

  return json({ access_token: token, token_type: "Bearer", expires_in: expiresIn, scope: "mcp" }, 200, {
    "Cache-Control": "no-store",
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const oauthPath = req.headers.get("x-oauth-path") || "/token";

    if (oauthPath === "/register" || oauthPath === "/register/") {
      return await registerDynamicClient(req);
    }

    if (oauthPath === "/approve" || oauthPath === "/approve/") {
      return await approveAuthorization(req);
    }

    return await issueToken(req);
  } catch (err) {
    console.error("OAuth endpoint error:", err);
    return json({ error: "server_error", error_description: String(err) }, 500);
  }
});
