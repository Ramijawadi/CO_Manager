// import { createClient } from '@supabase/supabase-js';

// const supabaseUrl = 'https://smwgufkhqbjtssxwrcwz.supabase.co';
// const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNtd2d1ZmtocWJqdHNzeHdyY3d6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2Njg3MzEsImV4cCI6MjA5NjI0NDczMX0.nrRDlWmOdfyefR6iQJzWBlZVDFoVOEMHk0NvsrcmGO0';

// const supabase = createClient(supabaseUrl, supabaseKey);

// async function createAdmin() {
//   console.log('Creating admin user...');
//   const { data, error } = await supabase.auth.signUp({
//     email: 'admin@coworking.com',
//     password: 'adminpassword123',
//   });

//   if (error) {
//     console.error('Error creating user:', error.message);
//   } else {
//     console.log('User created successfully:', data?.user?.email);
//     console.log('You can now log in with email: admin@coworking.com and password: adminpassword123');
//     console.log('NOTE: If you have "Confirm email" enabled in Supabase Dashboard (Authentication > Providers > Email), you will need to disable it to log in immediately without verifying the email.');
//   }
// }

// createAdmin();
