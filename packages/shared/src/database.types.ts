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
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          at: string
          details: Json
          entity: string
          entity_id: string | null
          id: number
        }
        Insert: {
          action: string
          actor_id?: string | null
          at?: string
          details?: Json
          entity: string
          entity_id?: string | null
          id?: never
        }
        Update: {
          action?: string
          actor_id?: string | null
          at?: string
          details?: Json
          entity?: string
          entity_id?: string | null
          id?: never
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          is_beverage: boolean
          name_de: string
          name_tr: string | null
          slug: string
          sort: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_beverage?: boolean
          name_de: string
          name_tr?: string | null
          slug: string
          sort?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_beverage?: boolean
          name_de?: string
          name_tr?: string | null
          slug?: string
          sort?: number
          updated_at?: string
        }
        Relationships: []
      }
      daily_counters: {
        Row: {
          business_date: string
          last_order_no: number
        }
        Insert: {
          business_date: string
          last_order_no?: number
        }
        Update: {
          business_date?: string
          last_order_no?: number
        }
        Relationships: []
      }
      dining_tables: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          sort: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort?: number
        }
        Relationships: []
      }
      ingredients: {
        Row: {
          id: string
          is_active: boolean
          name_de: string
          name_tr: string | null
          slug: string
        }
        Insert: {
          id?: string
          is_active?: boolean
          name_de: string
          name_tr?: string | null
          slug: string
        }
        Update: {
          id?: string
          is_active?: boolean
          name_de?: string
          name_tr?: string | null
          slug?: string
        }
        Relationships: []
      }
      option_groups: {
        Row: {
          admin_label: string
          id: string
          is_active: boolean
          max_select: number
          min_select: number
          name_de: string
          name_tr: string | null
          slug: string
          sort: number
          ticket_format: Database["public"]["Enums"]["ticket_format"]
        }
        Insert: {
          admin_label: string
          id?: string
          is_active?: boolean
          max_select?: number
          min_select?: number
          name_de: string
          name_tr?: string | null
          slug: string
          sort?: number
          ticket_format?: Database["public"]["Enums"]["ticket_format"]
        }
        Update: {
          admin_label?: string
          id?: string
          is_active?: boolean
          max_select?: number
          min_select?: number
          name_de?: string
          name_tr?: string | null
          slug?: string
          sort?: number
          ticket_format?: Database["public"]["Enums"]["ticket_format"]
        }
        Relationships: []
      }
      options: {
        Row: {
          group_id: string
          id: string
          is_active: boolean
          is_default: boolean
          is_exclusive: boolean
          name_de: string
          name_tr: string | null
          price_delta_cents: number
          sort: number
        }
        Insert: {
          group_id: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          is_exclusive?: boolean
          name_de: string
          name_tr?: string | null
          price_delta_cents?: number
          sort?: number
        }
        Update: {
          group_id?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          is_exclusive?: boolean
          name_de?: string
          name_tr?: string | null
          price_delta_cents?: number
          sort?: number
        }
        Relationships: [
          {
            foreignKeyName: "options_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "option_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          category_sort: number
          id: string
          is_beverage: boolean
          note: string | null
          order_id: string
          product_code: string | null
          product_id: string
          product_name: string
          quantity: number
          removed_ingredients: Json
          selected_options: Json
          sort: number
          status: Database["public"]["Enums"]["item_status"]
          unit_price_cents: number
          variant_id: string | null
          variant_name_de: string | null
          variant_name_tr: string | null
        }
        Insert: {
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          category_sort: number
          id?: string
          is_beverage?: boolean
          note?: string | null
          order_id: string
          product_code?: string | null
          product_id: string
          product_name: string
          quantity: number
          removed_ingredients?: Json
          selected_options?: Json
          sort?: number
          status?: Database["public"]["Enums"]["item_status"]
          unit_price_cents: number
          variant_id?: string | null
          variant_name_de?: string | null
          variant_name_tr?: string | null
        }
        Update: {
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          category_sort?: number
          id?: string
          is_beverage?: boolean
          note?: string | null
          order_id?: string
          product_code?: string | null
          product_id?: string
          product_name?: string
          quantity?: number
          removed_ingredients?: Json
          selected_options?: Json
          sort?: number
          status?: Database["public"]["Enums"]["item_status"]
          unit_price_cents?: number
          variant_id?: string | null
          variant_name_de?: string | null
          variant_name_tr?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          business_date: string
          cancelled_at: string | null
          created_at: string
          id: string
          note: string | null
          order_no: number
          ready_at: string | null
          ready_by: string | null
          round_no: number
          served_at: string | null
          served_by: string | null
          session_id: string
          status: Database["public"]["Enums"]["order_status"]
          waiter_id: string
        }
        Insert: {
          business_date: string
          cancelled_at?: string | null
          created_at?: string
          id: string
          note?: string | null
          order_no: number
          ready_at?: string | null
          ready_by?: string | null
          round_no: number
          served_at?: string | null
          served_by?: string | null
          session_id: string
          status?: Database["public"]["Enums"]["order_status"]
          waiter_id: string
        }
        Update: {
          business_date?: string
          cancelled_at?: string | null
          created_at?: string
          id?: string
          note?: string | null
          order_no?: number
          ready_at?: string | null
          ready_by?: string | null
          round_no?: number
          served_at?: string | null
          served_by?: string | null
          session_id?: string
          status?: Database["public"]["Enums"]["order_status"]
          waiter_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_ready_by_fkey"
            columns: ["ready_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_served_by_fkey"
            columns: ["served_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "table_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_waiter_id_fkey"
            columns: ["waiter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      print_jobs: {
        Row: {
          attempts: number
          claimed_at: string | null
          claimed_by: string | null
          created_at: string
          created_by: string | null
          id: string
          last_error: string | null
          next_attempt_at: string
          order_id: string | null
          payload: Json
          printed_at: string | null
          session_id: string | null
          status: Database["public"]["Enums"]["print_job_status"]
          type: Database["public"]["Enums"]["print_job_type"]
        }
        Insert: {
          attempts?: number
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          last_error?: string | null
          next_attempt_at?: string
          order_id?: string | null
          payload: Json
          printed_at?: string | null
          session_id?: string | null
          status?: Database["public"]["Enums"]["print_job_status"]
          type: Database["public"]["Enums"]["print_job_type"]
        }
        Update: {
          attempts?: number
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          last_error?: string | null
          next_attempt_at?: string
          order_id?: string | null
          payload?: Json
          printed_at?: string | null
          session_id?: string | null
          status?: Database["public"]["Enums"]["print_job_status"]
          type?: Database["public"]["Enums"]["print_job_type"]
        }
        Relationships: [
          {
            foreignKeyName: "print_jobs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "print_jobs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "print_jobs_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "table_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      printer_status: {
        Row: {
          agent_id: string | null
          agent_version: string | null
          host: string | null
          id: string
          last_error: string | null
          last_printed_at: string | null
          last_seen_at: string | null
          printer_reachable: boolean | null
          printer_state: Json
        }
        Insert: {
          agent_id?: string | null
          agent_version?: string | null
          host?: string | null
          id?: string
          last_error?: string | null
          last_printed_at?: string | null
          last_seen_at?: string | null
          printer_reachable?: boolean | null
          printer_state?: Json
        }
        Update: {
          agent_id?: string | null
          agent_version?: string | null
          host?: string | null
          id?: string
          last_error?: string | null
          last_printed_at?: string | null
          last_seen_at?: string | null
          printer_reachable?: boolean | null
          printer_state?: Json
        }
        Relationships: []
      }
      product_ingredients: {
        Row: {
          ingredient_id: string
          product_id: string
          sort: number
        }
        Insert: {
          ingredient_id: string
          product_id: string
          sort?: number
        }
        Update: {
          ingredient_id?: string
          product_id?: string
          sort?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_ingredients_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_ingredients_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_option_groups: {
        Row: {
          group_id: string
          product_id: string
          sort: number
        }
        Insert: {
          group_id: string
          product_id: string
          sort?: number
        }
        Update: {
          group_id?: string
          product_id?: string
          sort?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_option_groups_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "option_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_option_groups_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variants: {
        Row: {
          id: string
          is_active: boolean
          is_default: boolean
          name_de: string
          name_tr: string | null
          price_cents: number
          product_id: string
          sort: number
        }
        Insert: {
          id?: string
          is_active?: boolean
          is_default?: boolean
          name_de: string
          name_tr?: string | null
          price_cents: number
          product_id: string
          sort?: number
        }
        Update: {
          id?: string
          is_active?: boolean
          is_default?: boolean
          name_de?: string
          name_tr?: string | null
          price_cents?: number
          product_id?: string
          sort?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          allergens: string | null
          archived_at: string | null
          base_price_cents: number | null
          category_id: string
          code: string | null
          created_at: string
          description: string | null
          id: string
          image_path: string | null
          is_active: boolean
          is_sold_out: boolean
          name: string
          slug: string
          sort: number
          updated_at: string
        }
        Insert: {
          allergens?: string | null
          archived_at?: string | null
          base_price_cents?: number | null
          category_id: string
          code?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_path?: string | null
          is_active?: boolean
          is_sold_out?: boolean
          name: string
          slug: string
          sort?: number
          updated_at?: string
        }
        Update: {
          allergens?: string | null
          archived_at?: string | null
          base_price_cents?: number | null
          category_id?: string
          code?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_path?: string | null
          is_active?: boolean
          is_sold_out?: boolean
          name?: string
          slug?: string
          sort?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string
          id: string
          is_active: boolean
          locale: string
          on_duty_since: string | null
          role: Database["public"]["Enums"]["staff_role"]
          updated_at: string
          username: string
        }
        Insert: {
          created_at?: string
          display_name: string
          id: string
          is_active?: boolean
          locale?: string
          on_duty_since?: string | null
          role: Database["public"]["Enums"]["staff_role"]
          updated_at?: string
          username: string
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
          is_active?: boolean
          locale?: string
          on_duty_since?: string | null
          role?: Database["public"]["Enums"]["staff_role"]
          updated_at?: string
          username?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          last_success_at: string | null
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          last_success_at?: string | null
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          last_success_at?: string | null
          p256dh?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          allergen_legend: Json
          business_day_start: string
          cancel_reasons: Json
          id: number
          printer_codepage: string
          printer_codepage_number: number
          printer_host: string
          printer_port: number
          printer_transliterate: boolean
          quick_notes: Json
          restaurant_name: string
          ticket_footer: string
          ticket_header: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          allergen_legend?: Json
          business_day_start?: string
          cancel_reasons?: Json
          id?: number
          printer_codepage?: string
          printer_codepage_number?: number
          printer_host?: string
          printer_port?: number
          printer_transliterate?: boolean
          quick_notes?: Json
          restaurant_name?: string
          ticket_footer?: string
          ticket_header?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          allergen_legend?: Json
          business_day_start?: string
          cancel_reasons?: Json
          id?: number
          printer_codepage?: string
          printer_codepage_number?: number
          printer_host?: string
          printer_port?: number
          printer_transliterate?: boolean
          quick_notes?: Json
          restaurant_name?: string
          ticket_footer?: string
          ticket_header?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      table_sessions: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          id: string
          opened_at: string
          opened_by: string
          status: Database["public"]["Enums"]["session_status"]
          table_id: string
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          id?: string
          opened_at?: string
          opened_by: string
          status?: Database["public"]["Enums"]["session_status"]
          table_id: string
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          id?: string
          opened_at?: string
          opened_by?: string
          status?: Database["public"]["Enums"]["session_status"]
          table_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "table_sessions_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_sessions_opened_by_fkey"
            columns: ["opened_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_sessions_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "dining_tables"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      agent_heartbeat: {
        Args: {
          p_agent_id: string
          p_error: string
          p_host: string
          p_reachable: boolean
          p_state: Json
          p_version: string
        }
        Returns: undefined
      }
      business_date: { Args: { p_ts?: string }; Returns: string }
      cancel_order_item: {
        Args: { p_item_id: string; p_reason: string }
        Returns: Json
      }
      claim_print_job: {
        Args: { p_agent_id: string }
        Returns: {
          attempts: number
          claimed_at: string | null
          claimed_by: string | null
          created_at: string
          created_by: string | null
          id: string
          last_error: string | null
          next_attempt_at: string
          order_id: string | null
          payload: Json
          printed_at: string | null
          session_id: string | null
          status: Database["public"]["Enums"]["print_job_status"]
          type: Database["public"]["Enums"]["print_job_type"]
        }[]
        SetofOptions: {
          from: "*"
          to: "print_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      close_table_session: {
        Args: { p_session_id: string }
        Returns: undefined
      }
      complete_print_job: {
        Args: {
          p_agent_id?: string
          p_error?: string
          p_job_id: string
          p_ok: boolean
        }
        Returns: undefined
      }
      current_business_day_start: { Args: never; Returns: string }
      delete_push_subscription: {
        Args: { p_endpoint: string }
        Returns: undefined
      }
      enqueue_test_print: { Args: never; Returns: undefined }
      get_session_bill: { Args: { p_session_id: string }; Returns: Json }
      has_role: {
        Args: { p_roles: Database["public"]["Enums"]["staff_role"][] }
        Returns: boolean
      }
      is_active_staff: { Args: never; Returns: boolean }
      is_on_duty: { Args: { p_since: string }; Returns: boolean }
      mark_order_ready: { Args: { p_order_id: string }; Returns: undefined }
      mark_order_served: { Args: { p_order_id: string }; Returns: undefined }
      move_table_session: {
        Args: { p_session_id: string; p_target_table_id: string }
        Returns: undefined
      }
      report_range: { Args: { p_from: string; p_to: string }; Returns: Json }
      reprint_order: { Args: { p_order_id: string }; Returns: undefined }
      retry_print_job: { Args: { p_job_id: string }; Returns: undefined }
      save_push_subscription: {
        Args: {
          p_auth: string
          p_endpoint: string
          p_p256dh: string
          p_ua: string
        }
        Returns: undefined
      }
      set_my_locale: { Args: { p_locale: string }; Returns: undefined }
      set_on_duty: { Args: { p_on: boolean }; Returns: Json }
      set_product_sold_out: {
        Args: { p_product_id: string; p_sold_out: boolean }
        Returns: undefined
      }
      staff_names: {
        Args: never
        Returns: {
          display_name: string
          id: string
          role: Database["public"]["Enums"]["staff_role"]
        }[]
      }
      submit_order: {
        Args: {
          p_items: Json
          p_note?: string
          p_order_id: string
          p_table_id: string
        }
        Returns: Json
      }
      table_overview: {
        Args: never
        Returns: {
          failed_prints: number
          name: string
          opened_at: string
          opened_by_name: string
          orders_in_kitchen: number
          orders_ready: number
          session_id: string
          sort: number
          table_id: string
          total_cents: number
        }[]
      }
      undo_order_ready: { Args: { p_order_id: string }; Returns: undefined }
    }
    Enums: {
      item_status: "active" | "cancelled"
      order_status: "in_kitchen" | "ready" | "served" | "cancelled"
      print_job_status: "pending" | "printing" | "printed" | "failed"
      print_job_type:
        | "order"
        | "addition"
        | "storno"
        | "table_move"
        | "reprint"
        | "test"
      session_status: "open" | "closed"
      staff_role: "admin" | "waiter" | "kitchen" | "printer"
      ticket_format: "label_values" | "values_only" | "plus_each"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      item_status: ["active", "cancelled"],
      order_status: ["in_kitchen", "ready", "served", "cancelled"],
      print_job_status: ["pending", "printing", "printed", "failed"],
      print_job_type: [
        "order",
        "addition",
        "storno",
        "table_move",
        "reprint",
        "test",
      ],
      session_status: ["open", "closed"],
      staff_role: ["admin", "waiter", "kitchen", "printer"],
      ticket_format: ["label_values", "values_only", "plus_each"],
    },
  },
} as const
