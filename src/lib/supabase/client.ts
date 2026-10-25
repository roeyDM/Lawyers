import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://qefuzewtbsmnolzwcyod.supabase.co";

const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFlZnV6ZXd0YnNtbm9sendjeW9kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI5MzA4MTAsImV4cCI6MjEwODUwNjgxMH0.XCzzQcu5skfCJlUG9YtHyVAwKbyna4FnT2RVS7iUvyE";

export function createClient() {
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}

export const supabase = createClient();

export interface Profile {
  id: string;
  full_name: string | null;
  license_number: string | null;
  phone: string | null;
  city: string | null;
  radius_km: number | null;
  specialties: string[] | null;
  is_approved: boolean | null;
}

export type CaseStatus = "open" | "locked" | "assigned" | "completed" | string;

export interface LegalCase {
  id: string;
  referrer_id: string | null;
  category: string;
  city: string;
  description: string;
  client_name: string;
  client_phone: string;
  status: CaseStatus;
  locked_by: string | null;
  locked_at: string | null;
  assigned_to: string | null;
  signed_agreement_url: string | null;
  fee_contract_url: string | null;
  created_at?: string;
}
