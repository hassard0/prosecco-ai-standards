import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const tables = [
      "standards",
      "standard_summaries",
      "standard_flags",
      "tags",
      "user_roles",
    ];

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupData: Record<string, unknown[]> = {};
    const errors: string[] = [];

    for (const table of tables) {
      const { data, error } = await supabase.from(table).select("*");
      if (error) {
        errors.push(`${table}: ${error.message}`);
      } else {
        backupData[table] = data || [];
      }
    }

    const payload = JSON.stringify(
      {
        created_at: new Date().toISOString(),
        tables: backupData,
        row_counts: Object.fromEntries(
          Object.entries(backupData).map(([k, v]) => [k, v.length])
        ),
      },
      null,
      2
    );

    const filePath = `daily/${timestamp}.json`;

    const { error: uploadError } = await supabase.storage
      .from("backups")
      .upload(filePath, new Blob([payload], { type: "application/json" }), {
        contentType: "application/json",
        upsert: false,
      });

    if (uploadError) {
      throw new Error(`Upload failed: ${uploadError.message}`);
    }

    // Clean up backups older than 30 days
    const { data: files } = await supabase.storage
      .from("backups")
      .list("daily", { sortBy: { column: "created_at", order: "asc" } });

    if (files && files.length > 30) {
      const toDelete = files.slice(0, files.length - 30).map((f) => `daily/${f.name}`);
      await supabase.storage.from("backups").remove(toDelete);
    }

    const result = {
      success: true,
      file: filePath,
      row_counts: Object.fromEntries(
        Object.entries(backupData).map(([k, v]) => [k, v.length])
      ),
      errors: errors.length > 0 ? errors : undefined,
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: String(err) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
