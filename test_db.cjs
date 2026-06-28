const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envContent = fs.readFileSync('.env', 'utf8');
const getEnvVar = (name) => {
  const match = envContent.match(new RegExp(`^${name}=(.*)$`, 'm'));
  return match ? match[1].trim() : null;
};

const supabaseUrl = getEnvVar('VITE_SUPABASE_URL');
const supabaseAnonKey = getEnvVar('VITE_SUPABASE_ANON_KEY');

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
  const { data: settings, error: sErr } = await supabase
    .from('system_settings')
    .select('*');
  
  if (sErr) {
    console.error('Error settings:', sErr);
  } else {
    console.log('System settings:', settings);
  }

  const { data: teachers, error: tErr } = await supabase
    .from('profiles')
    .select('id, email, full_name, role')
    .eq('role', 'teacher');
  
  if (tErr) {
    console.error('Error teachers:', tErr);
  } else {
    console.log('Teachers:', teachers);
  }
}
run();
