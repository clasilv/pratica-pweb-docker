// src/config/supabase.js
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';  // Forma ES Module do dotenv

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

export default supabase;