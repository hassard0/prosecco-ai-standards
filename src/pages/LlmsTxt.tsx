import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

export default function LlmsTxt() {
  const [text, setText] = useState("Loading…");
  const location = useLocation();
  const full = location.pathname.includes("llms-full");

  useEffect(() => {
    const fetchTxt = async () => {
      try {
        const { data, error } = await supabase.functions.invoke("llms-txt", {
          body: {},
          method: "POST",
        });
        // The edge function returns plain text, but invoke wraps it
        // Try using fetch directly for plain text response
        const url = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/llms-txt${full ? "?full=true" : ""}`;
        const resp = await fetch(url);
        if (!resp.ok) throw new Error("Failed to fetch");
        setText(await resp.text());
      } catch (e) {
        setText("Error loading llms.txt");
      }
    };
    fetchTxt();
  }, [full]);

  return (
    <pre
      style={{
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        fontFamily: "monospace",
        fontSize: "14px",
        padding: "2rem",
        margin: 0,
        background: "var(--background)",
        color: "var(--foreground)",
        minHeight: "100vh",
      }}
    >
      {text}
    </pre>
  );
}
