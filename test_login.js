import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://smwgufkhqbjtssxwrcwz.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNtd2d1ZmtocWJqdHNzeHdyY3d6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2Njg3MzEsImV4cCI6MjA5NjI0NDczMX0.nrRDlWmOdfyefR6iQJzWBlZVDFoVOEMHk0NvsrcmGO0';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testLogin() {
  console.log('Attempting to log in as ramijawadi104@gmail.com...');
  const { data, error } = await supabase.auth.signInWithPassword({
    email: 'ramijawadi104@gmail.com',
    password: 'adminpassword123',
  });

  if (error) {
    console.error('\n❌ LOGIN FAILED!');
    console.error('Error Status:', error.status);
    console.error('Error Message:', error.message);
    
    if (error.message.includes('Email not confirmed')) {
      console.log('\n💡 FIX: You have "Confirm email" enabled in Supabase! Go to Supabase Dashboard -> Authentication -> Providers -> Email, and turn OFF "Confirm email", OR check your inbox and click the verification link.');
    }
  } else {
    console.log('\n✅ LOGIN SUCCESSFUL!');
    console.log('User ID:', data.user.id);
  }
}

testLogin();
