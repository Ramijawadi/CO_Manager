/**
 * Database Schema Verification Script
 * Run this script to verify that all required columns exist in your Supabase database
 * 
 * Usage: node verify_schema.js
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Error: Supabase credentials not found in environment variables');
  console.error('Please ensure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const requiredTables = {
  sessions: [
    'id',
    'customer_id',
    'entry_time',
    'exit_time',
    'status',
    'time_cost', // The column we're verifying
    'created_at',
    'updated_at'
  ],
  customers: ['id', 'full_name', 'email', 'phone', 'notes', 'status', 'created_at', 'updated_at'],
  products: ['id', 'name', 'description', 'price', 'stock', 'created_at', 'updated_at'],
  subscriptions: ['id', 'customer_id', 'plan_id', 'start_date', 'end_date', 'status', 'created_at', 'updated_at'],
  settings: ['id', 'hourly_rate', 'created_at', 'updated_at']
};

async function verifySchema() {
  console.log('🔍 Verifying database schema...\n');
  
  let allValid = true;

  for (const [tableName, columns] of Object.entries(requiredTables)) {
    console.log(`📋 Checking table: ${tableName}`);
    
    try {
      // Try to select from the table
      const { data, error } = await supabase
        .from(tableName)
        .select(columns.join(', '))
        .limit(1);

      if (error) {
        console.error(`  ❌ Error accessing ${tableName}:`, error.message);
        
        // Check if it's a column-specific error
        if (error.message.includes('column') && error.message.includes('does not exist')) {
          const missingColumn = columns.find(col => error.message.includes(col));
          if (missingColumn) {
            console.error(`  ⚠️  Missing column: ${missingColumn}`);
            if (missingColumn === 'time_cost') {
              console.error(`  💡 Solution: Run the migration script in migrations/add_time_cost_column.sql`);
            }
          }
        }
        
        allValid = false;
      } else {
        console.log(`  ✅ ${tableName} - All columns present`);
        
        // Extra verification for time_cost column
        if (tableName === 'sessions') {
          console.log(`  ✨ time_cost column verified!`);
        }
      }
    } catch (err) {
      console.error(`  ❌ Unexpected error checking ${tableName}:`, err.message);
      allValid = false;
    }
    
    console.log('');
  }

  // Test actual session creation and checkout workflow
  console.log('🧪 Testing session workflow...');
  try {
    // Get a customer for testing (or create a test one)
    const { data: customers } = await supabase
      .from('customers')
      .select('id')
      .limit(1);

    if (customers && customers.length > 0) {
      const testCustomerId = customers[0].id;
      
      // Try to create a test session
      const { data: testSession, error: createError } = await supabase
        .from('sessions')
        .insert([{
          customer_id: testCustomerId,
          entry_time: new Date().toISOString(),
          status: 'active',
          time_cost: null
        }])
        .select('id, time_cost')
        .single();

      if (createError) {
        console.error('  ❌ Failed to create test session:', createError.message);
        allValid = false;
      } else if (testSession) {
        console.log('  ✅ Test session created successfully');
        
        // Try to update with time_cost
        const { error: updateError } = await supabase
          .from('sessions')
          .update({
            time_cost: 10.5,
            status: 'completed',
            exit_time: new Date().toISOString()
          })
          .eq('id', testSession.id);

        if (updateError) {
          console.error('  ❌ Failed to update time_cost:', updateError.message);
          allValid = false;
        } else {
          console.log('  ✅ time_cost update successful');
          
          // Clean up test session
          await supabase
            .from('sessions')
            .delete()
            .eq('id', testSession.id);
          
          console.log('  🧹 Test session cleaned up');
        }
      }
    } else {
      console.log('  ⚠️  No customers found for testing. Skipping workflow test.');
    }
  } catch (err) {
    console.error('  ❌ Workflow test error:', err.message);
    allValid = false;
  }

  console.log('\n' + '='.repeat(50));
  if (allValid) {
    console.log('✅ All schema checks passed!');
    console.log('Your database is properly configured.');
  } else {
    console.log('❌ Schema verification failed!');
    console.log('\n📖 Next steps:');
    console.log('1. Review the errors above');
    console.log('2. Run the migration script: migrations/add_time_cost_column.sql');
    console.log('3. Check the MIGRATION_GUIDE.md for detailed instructions');
    process.exit(1);
  }
}

verifySchema().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
