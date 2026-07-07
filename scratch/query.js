import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://vosnzaevbynphsqbnfxp.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZvc256YWV2YnlucGhzcWJuZnhwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4MDY3NjcsImV4cCI6MjA5NzM4Mjc2N30.tbhOuG9QsXiSIbTFcdiX8maRZjHsv6LzLLL-X1OnZT8";

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data, error } = await supabase
    .from('lancamentos_pagamento')
    .select('id, parent_id, competencia, valor_solicitado, valor_atestado, concluido, parcela')
    .order('created_at', { ascending: false });

  if (error) {
    console.error(error);
  } else {
    console.log(JSON.stringify(data, null, 2));
  }
}

run();
