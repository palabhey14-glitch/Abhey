// Your Supabase project's address and its PUBLIC key.
// Find both in Supabase: Project Settings -> API (or "Data API" / "API Keys").
//
// The "anon" / "publishable" key is designed to sit in a web page: the
// security rules in supabase/schema.sql decide what each signed-in person
// can see. NEVER paste the "service_role" / "secret" key here or anywhere
// in this repo; that one bypasses every rule.
window.REWIRED_CONFIG = {
  supabaseUrl: 'https://njdqwhawdiloghoxajag.supabase.co',
  supabaseAnonKey: 'YOUR-ANON-OR-PUBLISHABLE-KEY',
  coachName: 'Abhey',
};
