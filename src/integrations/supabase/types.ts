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
    PostgrestVersion: "14.4"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      activity_log: {
        Row: {
          created_at: string
          description: string | null
          id: string
          metadata: Json | null
          title: string
          type: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          metadata?: Json | null
          title: string
          type: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          metadata?: Json | null
          title?: string
          type?: string
        }
        Relationships: []
      }
      agent_configs: {
        Row: {
          agent_name: Database["public"]["Enums"]["agent_name"]
          display_name: string
          id: string
          is_active: boolean | null
          max_tokens: number | null
          system_prompt: string
          temperature: number | null
          updated_at: string
        }
        Insert: {
          agent_name: Database["public"]["Enums"]["agent_name"]
          display_name: string
          id?: string
          is_active?: boolean | null
          max_tokens?: number | null
          system_prompt: string
          temperature?: number | null
          updated_at?: string
        }
        Update: {
          agent_name?: Database["public"]["Enums"]["agent_name"]
          display_name?: string
          id?: string
          is_active?: boolean | null
          max_tokens?: number | null
          system_prompt?: string
          temperature?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      appointments: {
        Row: {
          created_at: string
          datetime: string
          google_event_id: string | null
          id: string
          lead_id: string | null
          location: string | null
          notes: string | null
          reminder_sent: boolean | null
          status: Database["public"]["Enums"]["appointment_status"] | null
          type: Database["public"]["Enums"]["appointment_type"]
        }
        Insert: {
          created_at?: string
          datetime: string
          google_event_id?: string | null
          id?: string
          lead_id?: string | null
          location?: string | null
          notes?: string | null
          reminder_sent?: boolean | null
          status?: Database["public"]["Enums"]["appointment_status"] | null
          type: Database["public"]["Enums"]["appointment_type"]
        }
        Update: {
          created_at?: string
          datetime?: string
          google_event_id?: string | null
          id?: string
          lead_id?: string | null
          location?: string | null
          notes?: string | null
          reminder_sent?: boolean | null
          status?: Database["public"]["Enums"]["appointment_status"] | null
          type?: Database["public"]["Enums"]["appointment_type"]
        }
        Relationships: [
          {
            foreignKeyName: "appointments_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      client_sites: {
        Row: {
          address: string
          city: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          frequency: string | null
          id: string
          is_active: boolean | null
          lead_id: string | null
          name: string
          notes: string | null
          service_type: string | null
          updated_at: string
        }
        Insert: {
          address: string
          city?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          frequency?: string | null
          id?: string
          is_active?: boolean | null
          lead_id?: string | null
          name: string
          notes?: string | null
          service_type?: string | null
          updated_at?: string
        }
        Update: {
          address?: string
          city?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          frequency?: string | null
          id?: string
          is_active?: boolean | null
          lead_id?: string | null
          name?: string
          notes?: string | null
          service_type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_sites_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          agent: Database["public"]["Enums"]["agent_name"] | null
          content: string
          created_at: string
          id: string
          lead_id: string
          metadata: Json | null
          role: Database["public"]["Enums"]["conversation_role"]
        }
        Insert: {
          agent?: Database["public"]["Enums"]["agent_name"] | null
          content: string
          created_at?: string
          id?: string
          lead_id: string
          metadata?: Json | null
          role: Database["public"]["Enums"]["conversation_role"]
        }
        Update: {
          agent?: Database["public"]["Enums"]["agent_name"] | null
          content?: string
          created_at?: string
          id?: string
          lead_id?: string
          metadata?: Json | null
          role?: Database["public"]["Enums"]["conversation_role"]
        }
        Relationships: [
          {
            foreignKeyName: "conversations_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          color: string | null
          created_at: string
          email: string | null
          id: string
          is_active: boolean | null
          name: string
          notes: string | null
          phone: string | null
          role: string | null
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          notes?: string | null
          phone?: string | null
          role?: string | null
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          notes?: string | null
          phone?: string | null
          role?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      followups: {
        Row: {
          created_at: string
          id: string
          lead_id: string
          message: string
          scheduled_at: string
          sent_at: string | null
          status: Database["public"]["Enums"]["followup_status"] | null
          step: number
        }
        Insert: {
          created_at?: string
          id?: string
          lead_id: string
          message: string
          scheduled_at: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["followup_status"] | null
          step: number
        }
        Update: {
          created_at?: string
          id?: string
          lead_id?: string
          message?: string
          scheduled_at?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["followup_status"] | null
          step?: number
        }
        Relationships: [
          {
            foreignKeyName: "followups_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount: number
          client_site_id: string | null
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          invoice_number: string
          lead_id: string | null
          paid_date: string | null
          period_end: string | null
          period_start: string | null
          status: string
          tax_amount: number | null
          tax_rate: number
          total: number | null
          updated_at: string
        }
        Insert: {
          amount?: number
          client_site_id?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          invoice_number: string
          lead_id?: string | null
          paid_date?: string | null
          period_end?: string | null
          period_start?: string | null
          status?: string
          tax_amount?: number | null
          tax_rate?: number
          total?: number | null
          updated_at?: string
        }
        Update: {
          amount?: number
          client_site_id?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          invoice_number?: string
          lead_id?: string | null
          paid_date?: string | null
          period_end?: string | null
          period_start?: string | null
          status?: string
          tax_amount?: number | null
          tax_rate?: number
          total?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_client_site_id_fkey"
            columns: ["client_site_id"]
            isOneToOne: false
            referencedRelation: "client_sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          active_agent: Database["public"]["Enums"]["agent_name"] | null
          address: string | null
          appointment_datetime: string | null
          appointment_type:
            | Database["public"]["Enums"]["appointment_type"]
            | null
          company_name: string | null
          contact_name: string | null
          created_at: string
          email: string | null
          frequency: string | null
          id: string
          language: string | null
          location: string | null
          message: string | null
          notes: string | null
          nps_data: Json | null
          phone: string | null
          score: Database["public"]["Enums"]["lead_score"] | null
          service_requested: string | null
          source: string | null
          space_type: string | null
          status: Database["public"]["Enums"]["lead_status"] | null
          surface_area: string | null
          timeline: string | null
          updated_at: string
          whatsapp_number: string | null
        }
        Insert: {
          active_agent?: Database["public"]["Enums"]["agent_name"] | null
          address?: string | null
          appointment_datetime?: string | null
          appointment_type?:
            | Database["public"]["Enums"]["appointment_type"]
            | null
          company_name?: string | null
          contact_name?: string | null
          created_at?: string
          email?: string | null
          frequency?: string | null
          id?: string
          language?: string | null
          location?: string | null
          message?: string | null
          notes?: string | null
          nps_data?: Json | null
          phone?: string | null
          score?: Database["public"]["Enums"]["lead_score"] | null
          service_requested?: string | null
          source?: string | null
          space_type?: string | null
          status?: Database["public"]["Enums"]["lead_status"] | null
          surface_area?: string | null
          timeline?: string | null
          updated_at?: string
          whatsapp_number?: string | null
        }
        Update: {
          active_agent?: Database["public"]["Enums"]["agent_name"] | null
          address?: string | null
          appointment_datetime?: string | null
          appointment_type?:
            | Database["public"]["Enums"]["appointment_type"]
            | null
          company_name?: string | null
          contact_name?: string | null
          created_at?: string
          email?: string | null
          frequency?: string | null
          id?: string
          language?: string | null
          location?: string | null
          message?: string | null
          notes?: string | null
          nps_data?: Json | null
          phone?: string | null
          score?: Database["public"]["Enums"]["lead_score"] | null
          service_requested?: string | null
          source?: string | null
          space_type?: string | null
          status?: Database["public"]["Enums"]["lead_status"] | null
          surface_area?: string | null
          timeline?: string | null
          updated_at?: string
          whatsapp_number?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      prospecting_configs: {
        Row: {
          created_at: string
          id: string
          is_active: boolean | null
          max_leads_per_run: number | null
          niche: string
          region: string
          search_query: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          max_leads_per_run?: number | null
          niche: string
          region?: string
          search_query?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          max_leads_per_run?: number | null
          niche?: string
          region?: string
          search_query?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      prospecting_runs: {
        Row: {
          completed_at: string | null
          config_id: string | null
          error_message: string | null
          id: string
          leads_found: number | null
          leads_qualified: number | null
          started_at: string
          status: string
        }
        Insert: {
          completed_at?: string | null
          config_id?: string | null
          error_message?: string | null
          id?: string
          leads_found?: number | null
          leads_qualified?: number | null
          started_at?: string
          status?: string
        }
        Update: {
          completed_at?: string | null
          config_id?: string | null
          error_message?: string | null
          id?: string
          leads_found?: number | null
          leads_qualified?: number | null
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "prospecting_runs_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "prospecting_configs"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          appointment_id: string | null
          created_at: string
          description: string | null
          id: string
          items: Json | null
          lead_id: string | null
          pdf_url: string | null
          raw_audio_text: string | null
          status: string
          telegram_state: string | null
          total_amount: number | null
          updated_at: string
        }
        Insert: {
          appointment_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          items?: Json | null
          lead_id?: string | null
          pdf_url?: string | null
          raw_audio_text?: string | null
          status?: string
          telegram_state?: string | null
          total_amount?: number | null
          updated_at?: string
        }
        Update: {
          appointment_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          items?: Json | null
          lead_id?: string | null
          pdf_url?: string | null
          raw_audio_text?: string | null
          status?: string
          telegram_state?: string | null
          total_amount?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quotes_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_entries: {
        Row: {
          client_site_id: string
          created_at: string
          day_of_week: number
          employee_id: string
          end_time: string
          id: string
          is_recurring: boolean | null
          notes: string | null
          specific_date: string | null
          start_time: string
          status: string | null
          updated_at: string
        }
        Insert: {
          client_site_id: string
          created_at?: string
          day_of_week: number
          employee_id: string
          end_time: string
          id?: string
          is_recurring?: boolean | null
          notes?: string | null
          specific_date?: string | null
          start_time: string
          status?: string | null
          updated_at?: string
        }
        Update: {
          client_site_id?: string
          created_at?: string
          day_of_week?: number
          employee_id?: string
          end_time?: string
          id?: string
          is_recurring?: boolean | null
          notes?: string | null
          specific_date?: string | null
          start_time?: string
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_entries_client_site_id_fkey"
            columns: ["client_site_id"]
            isOneToOne: false
            referencedRelation: "client_sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_entries_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_bot_state: {
        Row: {
          id: number
          update_offset: number
          updated_at: string
        }
        Insert: {
          id?: number
          update_offset?: number
          updated_at?: string
        }
        Update: {
          id?: number
          update_offset?: number
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      agent_name: "claire" | "sophie" | "lucas" | "emma"
      app_role: "admin" | "user"
      appointment_status:
        | "scheduled"
        | "confirmed"
        | "completed"
        | "cancelled"
        | "no_show"
      appointment_type: "visit" | "call"
      conversation_role: "user" | "assistant" | "system"
      followup_status: "pending" | "sent" | "cancelled"
      lead_score: "HOT" | "WARM" | "COLD"
      lead_status:
        | "new"
        | "qualifying"
        | "scheduled"
        | "followup_1"
        | "followup_2"
        | "followup_3"
        | "converted"
        | "lost"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      agent_name: ["claire", "sophie", "lucas", "emma"],
      app_role: ["admin", "user"],
      appointment_status: [
        "scheduled",
        "confirmed",
        "completed",
        "cancelled",
        "no_show",
      ],
      appointment_type: ["visit", "call"],
      conversation_role: ["user", "assistant", "system"],
      followup_status: ["pending", "sent", "cancelled"],
      lead_score: ["HOT", "WARM", "COLD"],
      lead_status: [
        "new",
        "qualifying",
        "scheduled",
        "followup_1",
        "followup_2",
        "followup_3",
        "converted",
        "lost",
      ],
    },
  },
} as const
