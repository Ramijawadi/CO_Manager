export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      customers: {
        Row: {
          id: string;
          full_name: string;
          email: string | null;
          phone: string | null;
          notes: string | null;
          status: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          full_name: string;
          email?: string | null;
          phone?: string | null;
          notes?: string | null;
          status?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string;
          email?: string | null;
          phone?: string | null;
          notes?: string | null;
          status?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      products: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          price: number;
          stock: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
          price?: number;
          stock?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string | null;
          price?: number;
          stock?: number;
          created_at?: string;
          updated_at?: string;
        };
      };
      plans: {
        Row: {
          id: string;
          name: string;
          duration_days: number;
          price: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          duration_days: number;
          price?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          duration_days?: number;
          price?: number;
          created_at?: string;
        };
      };
      sessions: {
        Row: {
          id: string;
          customer_id: string;
          entry_time: string;
          exit_time: string | null;
          status: string;
          time_cost: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          customer_id: string;
          entry_time: string;
          exit_time?: string | null;
          status?: string;
          time_cost?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          customer_id?: string;
          entry_time?: string;
          exit_time?: string | null;
          status?: string;
          time_cost?: number | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      session_products: {
        Row: {
          id: string;
          session_id: string;
          product_id: string;
          quantity: number;
          total_price: number;
          created_at: string;
        };

        Insert: {
          id?: string;
          session_id: string;
          product_id: string;
          quantity?: number;
          total_price?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          session_id?: string;
          product_id?: string;
          quantity?: number;
          total_price?: number;
          created_at?: string;
        };
      };
      subscriptions: {
        Row: {
          id: string;
          customer_id: string;
          plan_id: string;
          start_date: string;
          end_date: string;
          status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          customer_id: string;
          plan_id: string;
          start_date: string;
          end_date: string;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          customer_id?: string;
          plan_id?: string;
          start_date?: string;
          end_date?: string;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      daily_closures: {
        Row: {
          id: string;
          closure_date: string;
          total_visitors: number;
          total_revenue: number;
          product_sales: number;
          time_revenue: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          closure_date: string;
          total_visitors?: number;
          total_revenue?: number;
          product_sales?: number;
          time_revenue?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          closure_date?: string;
          total_visitors?: number;
          total_revenue?: number;
          product_sales?: number;
          time_revenue?: number;
          created_at?: string;
        };
      };
      users: {
        Row: {
          id: string;
          role: string;
          created_at: string;
        };
        Insert: {
          id: string;
          role?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          role?: string;
          created_at?: string;
        };
      };
      settings: {
        Row: {
          id: string;
          hourly_rate: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          hourly_rate?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          hourly_rate?: number;
          created_at?: string;
          updated_at?: string;
        };
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}
