export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          details: Json
          id: string
          resource_id: string
          resource_type: string
          timestamp: number
          user_id: string
        }
        Insert: {
          action: string
          details?: Json
          id: string
          resource_id: string
          resource_type: string
          timestamp: number
          user_id: string
        }
        Update: {
          action?: string
          details?: Json
          id?: string
          resource_id?: string
          resource_type?: string
          timestamp?: number
          user_id?: string
        }
        Relationships: []
      }
      lending_positions: {
        Row: {
          amount: number
          apy: number
          created_at: number
          id: string
          token: string
          type: string
          updated_at: number
          user_id: string
        }
        Insert: {
          amount: number
          apy?: number
          created_at: number
          id: string
          token: string
          type: string
          updated_at: number
          user_id: string
        }
        Update: {
          amount?: number
          apy?: number
          created_at?: number
          id?: string
          token?: string
          type?: string
          updated_at?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lending_positions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          created_at: number
          expires_at: number
          role: string
          token: string
          user_id: string
        }
        Insert: {
          created_at: number
          expires_at: number
          role: string
          token: string
          user_id: string
        }
        Update: {
          created_at?: number
          expires_at?: number
          role?: string
          token?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          amount: number
          from_address: string | null
          from_token: string | null
          hash: string
          id: string
          status: string
          timestamp: number
          to_address: string | null
          to_token: string | null
          token: string
          type: string
          user_id: string
        }
        Insert: {
          amount?: number
          from_address?: string | null
          from_token?: string | null
          hash: string
          id: string
          status?: string
          timestamp: number
          to_address?: string | null
          to_token?: string | null
          token: string
          type: string
          user_id: string
        }
        Update: {
          amount?: number
          from_address?: string | null
          from_token?: string | null
          hash?: string
          id?: string
          status?: string
          timestamp?: number
          to_address?: string | null
          to_token?: string | null
          token?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          address: string
          connected: boolean
          created_at: number
          email: string
          id: string
          name: string
          password_hash: string | null
          provider: string | null
          role: string
          updated_at: number
        }
        Insert: {
          address?: string
          connected?: boolean
          created_at: number
          email: string
          id: string
          name: string
          password_hash?: string | null
          provider?: string | null
          role?: string
          updated_at: number
        }
        Update: {
          address?: string
          connected?: boolean
          created_at?: number
          email?: string
          id?: string
          name?: string
          password_hash?: string | null
          provider?: string | null
          role?: string
          updated_at?: number
        }
        Relationships: []
      }
      vouchers: {
        Row: {
          amount: number
          code: string
          created_at: number
          id: string
          note: string | null
          owner_id: string
          redeemed_at: number | null
          status: string
          token: string
          transferred_to: string | null
        }
        Insert: {
          amount: number
          code: string
          created_at: number
          id: string
          note?: string | null
          owner_id: string
          redeemed_at?: number | null
          status?: string
          token: string
          transferred_to?: string | null
        }
        Update: {
          amount?: number
          code?: string
          created_at?: number
          id?: string
          note?: string | null
          owner_id?: string
          redeemed_at?: number | null
          status?: string
          token?: string
          transferred_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vouchers_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_sessions: {
        Row: {
          address: string
          balances: Json
          created_at: number
          id: string
          provider: string
          updated_at: number
          user_id: string
        }
        Insert: {
          address: string
          balances?: Json
          created_at: number
          id: string
          provider: string
          updated_at: number
          user_id: string
        }
        Update: {
          address?: string
          balances?: Json
          created_at?: number
          id?: string
          provider?: string
          updated_at?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
