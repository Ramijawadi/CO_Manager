# Co-Management System

A comprehensive management system built with React, TypeScript, Vite, and Supabase for managing customer sessions, subscriptions, products, and reports.

## Features

- 👥 **Customer Management**: Track visitors and their information
- 🎮 **Session Management**: Monitor active gaming/service sessions with time tracking
- 💳 **Subscription System**: Manage weekly and monthly plans
- 📦 **Product Sales**: Track product inventory and sales within sessions
- 📊 **Dashboard & Reports**: View analytics and generate detailed reports
- ⚙️ **Settings**: Configure hourly rates and other system parameters

## Tech Stack

- **Frontend**: React 19, TypeScript, Ant Design, TanStack Query
- **Backend**: Supabase (PostgreSQL, Auth, RLS)
- **Build Tool**: Vite
- **Charts**: Recharts
- **PDF Generation**: jsPDF
- **Excel Export**: XLSX

## Getting Started

### Prerequisites

- Node.js 18+ installed
- Supabase account and project

### Installation

1. Clone the repository
2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
Create a `.env` file in the root directory:
```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

4. Apply the database schema:
   - Go to your Supabase Dashboard → SQL Editor
   - Run the contents of `supabase_schema.sql`
   - Or run the migration: `migrations/add_time_cost_column.sql`

5. Verify your database schema:
```bash
npm run verify-schema
```

6. Start the development server:
```bash
npm run dev
```

## Database Migration

If you encounter the error: **"Could not find the 'time_cost' column"**, follow these steps:

1. Read the detailed guide: [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md)
2. Run the migration script in Supabase SQL Editor:
   - File: `migrations/add_time_cost_column.sql`
3. Verify the migration:
```bash
npm run verify-schema
```

## Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint
- `npm run verify-schema` - Verify database schema integrity

## Project Structure

```
src/
├── components/       # Shared components (Layout, ProtectedRoute)
├── features/         # Feature-based modules
│   ├── customers/    # Customer management
│   ├── dashboard/    # Dashboard & analytics
│   ├── products/     # Product management
│   ├── reports/      # Report generation
│   ├── sessions/     # Session management
│   ├── settings/     # System settings
│   └── subscriptions/# Subscription management
├── hooks/            # Custom React hooks
├── lib/              # Core libraries (Supabase client, types)
├── pages/            # Page components
├── store/            # State management (Zustand)
├── types/            # TypeScript type definitions
└── utils/            # Utility functions
```

## Key Features

### Session Management
- Check-in customers for sessions
- Track active sessions in real-time
- Calculate time costs based on duration
- Automatic subscription detection (free time for subscribers)
- Add products to sessions during active use

### Revenue Tracking
- Time-based revenue calculation
- Product sales tracking
- Daily revenue reports
- Export data to PDF or Excel

### Subscription System
- Weekly and monthly plans
- Automatic status tracking
- Subscription expiry monitoring

## Best Practices Implemented

- ✅ Explicit field selection in database queries
- ✅ Proper error handling and logging
- ✅ Type-safe database operations
- ✅ Idempotent database migrations
- ✅ Data validation at both DB and application level
- ✅ Performance-optimized indexes
- ✅ Row Level Security (RLS) policies

## Troubleshooting

### Schema Cache Issues
If you see errors about missing columns:
1. Run `npm run verify-schema` to diagnose
2. Check [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md) for solutions
3. Ensure database migrations are applied
4. Regenerate TypeScript types if needed

### Common Issues
- **Authentication errors**: Verify your Supabase credentials in `.env`
- **Build errors**: Clear `node_modules` and reinstall
- **Type errors**: Regenerate types with Supabase CLI

## Contributing

1. Follow the existing code structure
2. Add proper TypeScript types
3. Include error handling
4. Test database changes with `verify-schema` script
5. Update documentation as needed

## License

This project is private and proprietary.

---

## React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
