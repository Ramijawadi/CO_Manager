# Database Migration Guide - time_cost Column

## Issue
Error: "Could not find the 'time_cost' column of 'sessions' in the schema cache"

## Root Cause
The `time_cost` column was defined in the schema file but not properly applied to the Supabase database.

## Solution Steps

### Step 1: Apply the Migration
Run the migration script to add the `time_cost` column to your database:

```bash
# Option A: Using Supabase CLI (Recommended)
supabase db reset  # This will recreate the database with the full schema

# Option B: Run the migration script directly
# Execute the migration file in Supabase SQL Editor or via CLI
```

Navigate to your Supabase Dashboard → SQL Editor and run:
```sql
-- Execute the migration script
-- File: migrations/add_time_cost_column.sql
```

Or use the Supabase CLI:
```bash
supabase db push
```

### Step 2: Verify the Column Exists
In Supabase Dashboard → Table Editor → sessions table, verify that `time_cost` column exists with:
- Type: `numeric`
- Nullable: `true`
- Default: `null`

### Step 3: Regenerate TypeScript Types
After applying the migration, regenerate your TypeScript types:

```bash
# Using Supabase CLI
npx supabase gen types typescript --project-id YOUR_PROJECT_ID > src/lib/database.types.ts

# Or if using local development
npx supabase gen types typescript --local > src/lib/database.types.ts
```

### Step 4: Verify the Application
1. Start your development server
2. Create a new session (check-in)
3. Complete the session (checkout) - this should now save the `time_cost`
4. Check the dashboard to verify revenue is calculated correctly

## Files Modified

### 1. `/migrations/add_time_cost_column.sql`
- Idempotent migration script that safely adds the `time_cost` column
- Adds performance indexes for better query optimization
- Includes validation checks

### 2. `/supabase_schema.sql`
- Added constraint checks for `status` and `time_cost` columns
- Added automatic column creation if missing (for existing databases)
- Added performance indexes

### 3. `/src/features/sessions/api.ts`
- Explicit field selection in queries (prevents cache issues)
- Added validation for `time_cost` values
- Improved error handling and logging
- Ensures `time_cost` is initialized as `null` for new sessions

### 4. `/src/features/dashboard/api.ts`
- Improved null handling for `time_cost` calculations
- Added error logging for better debugging

## Best Practices Implemented

### 1. **Explicit Field Selection**
Instead of using `SELECT *`, we now explicitly select fields:
```typescript
.select('id, customer_id, entry_time, exit_time, status, time_cost, created_at, updated_at')
```
This prevents schema cache issues and improves performance.

### 2. **Idempotent Migrations**
The migration script checks if the column exists before adding it:
```sql
IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'sessions' AND column_name = 'time_cost')
```

### 3. **Data Validation**
- Added constraint checks at the database level
- Added validation in the application layer before updates
- Proper null handling throughout the codebase

### 4. **Error Handling**
- Detailed error messages for debugging
- Console logging for tracking issues
- Graceful fallbacks for null values

### 5. **Performance Optimization**
Added indexes for frequently queried columns:
- `idx_sessions_customer_id`
- `idx_sessions_status`
- `idx_sessions_entry_time`

## Testing Checklist

- [ ] Migration script runs without errors
- [ ] `time_cost` column exists in sessions table
- [ ] Can create new sessions (check-in)
- [ ] Can complete sessions with time cost calculation (checkout)
- [ ] Dashboard shows correct revenue
- [ ] Reports include time cost data
- [ ] No console errors related to `time_cost`

## Troubleshooting

### Issue: Migration script fails
**Solution**: Ensure you have proper permissions and the table exists. Check Supabase logs for detailed error messages.

### Issue: Column exists but still getting cache error
**Solution**: 
1. Clear browser cache
2. Restart your development server
3. Regenerate TypeScript types
4. Verify the column in Supabase Dashboard

### Issue: TypeScript errors after regenerating types
**Solution**: 
1. Delete `node_modules` and reinstall: `npm install`
2. Restart TypeScript server in VS Code
3. Check that `database.types.ts` has the updated Session type

## Additional Resources

- [Supabase CLI Documentation](https://supabase.com/docs/guides/cli)
- [Supabase Migrations](https://supabase.com/docs/guides/cli/local-development#database-migrations)
- [TypeScript Type Generation](https://supabase.com/docs/guides/api/generating-types)

## Notes

- The `time_cost` column is nullable because it's only calculated when a session is completed
- Active sessions will have `null` for `time_cost`
- Subscribed users will have `0` for `time_cost` (free time)
- Regular users will have calculated cost based on hourly rate and duration
