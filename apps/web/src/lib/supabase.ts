import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** Null until the env vars are configured, so the placeholder page works without credentials. */
export const supabase = url && anonKey ? createClient(url, anonKey) : null
