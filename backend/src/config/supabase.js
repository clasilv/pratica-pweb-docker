// Teste de conteúdo
import { createClient } from '@supabase/supabase-js';

let supabaseInstance = null;

try {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;
  
  if (supabaseUrl && supabaseKey) {
    supabaseInstance = createClient(supabaseUrl, supabaseKey);
    console.log('✅ Supabase configurado');
  } else {
    console.warn('⚠️  Variáveis do Supabase não encontradas');
  }
} catch (error) {
  console.warn('⚠️  Supabase não disponível:', error.message);
}

export default supabaseInstance;
