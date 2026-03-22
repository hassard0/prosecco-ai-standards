import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type Standard = Tables<"standards">;

export function useStandards() {
  return useQuery({
    queryKey: ["standards"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("standards")
        .select("*")
        .order("title");

      if (error) throw error;
      return data as Standard[];
    },
  });
}

export function useTags() {
  return useQuery({
    queryKey: ["tags"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tags")
        .select("*")
        .order("name");

      if (error) throw error;
      return data;
    },
  });
}
