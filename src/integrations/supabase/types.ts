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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string | null
          full_name: string | null
          phone: string | null
          restaurant_name: string | null
          referral_code: string | null
          referred_by: string | null
          partner_id: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_status: string | null
          plan_code: string
          is_platform_admin: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email?: string | null
          full_name?: string | null
          phone?: string | null
          restaurant_name?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string | null
          full_name?: string | null
          phone?: string | null
          restaurant_name?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          created_at: string
          id: string
          last_order_at: string
          name: string
          order_count: number
          total_spent: number
          truck_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_order_at?: string
          name: string
          order_count?: number
          total_spent?: number
          truck_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          last_order_at?: string
          name?: string
          order_count?: number
          total_spent?: number
          truck_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      food_trucks: {
        Row: {
          accent_color: string | null
          business_type: string | null
          cover_image_url: string | null
          created_at: string
          description: string | null
          hours: string | null
          id: string
          is_active: boolean
          is_published: boolean
          location: string | null
          logo_url: string | null
          menu_status: string
          name: string
          owner_id: string | null
          phone: string | null
          phone_accept_orders: boolean
          phone_fallback_number: string | null
          phone_greeting: string | null
          phone_hours: string | null
          phone_language: string
          phone_ordering_enabled: boolean
          phone_pay_at_pickup: boolean
          phone_payment_link_enabled: boolean
          phone_prep_minutes: number | null
          phone_speak_prices: boolean
          ordering_phone_number: string | null
          drive_thru_enabled: boolean
          organization_id: string | null
          ordering_paused: boolean
          test_mode: boolean
          require_payment_before_kitchen: boolean
          pay_at_pickup_enabled: boolean
          menu_source: string
          order_route: string
          default_language: string
          stripe_account_id: string | null
          card_payments_enabled: boolean
          published_at: string | null
          slug: string
          spoken_responses_enabled: boolean
          updated_at: string
          upsells_enabled: boolean
          voice_greeting: string | null
          voice_ordering_enabled: boolean
          website: string | null
        }
        Insert: {
          accent_color?: string | null
          business_type?: string | null
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          hours?: string | null
          id?: string
          is_active?: boolean
          is_published?: boolean
          location?: string | null
          logo_url?: string | null
          menu_status?: string
          name: string
          owner_id?: string | null
          phone?: string | null
          phone_accept_orders?: boolean
          phone_fallback_number?: string | null
          phone_greeting?: string | null
          phone_hours?: string | null
          phone_language?: string
          phone_ordering_enabled?: boolean
          phone_pay_at_pickup?: boolean
          phone_payment_link_enabled?: boolean
          phone_prep_minutes?: number | null
          phone_speak_prices?: boolean
          ordering_phone_number?: string | null
          drive_thru_enabled?: boolean
          organization_id?: string | null
          ordering_paused?: boolean
          test_mode?: boolean
          require_payment_before_kitchen?: boolean
          pay_at_pickup_enabled?: boolean
          menu_source?: string
          order_route?: string
          default_language?: string
          stripe_account_id?: string | null
          card_payments_enabled?: boolean
          published_at?: string | null
          slug: string
          spoken_responses_enabled?: boolean
          updated_at?: string
          upsells_enabled?: boolean
          voice_greeting?: string | null
          voice_ordering_enabled?: boolean
          website?: string | null
        }
        Update: {
          accent_color?: string | null
          business_type?: string | null
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          hours?: string | null
          id?: string
          is_active?: boolean
          is_published?: boolean
          location?: string | null
          logo_url?: string | null
          menu_status?: string
          name?: string
          owner_id?: string | null
          phone?: string | null
          phone_accept_orders?: boolean
          phone_fallback_number?: string | null
          phone_greeting?: string | null
          phone_hours?: string | null
          phone_language?: string
          phone_ordering_enabled?: boolean
          phone_pay_at_pickup?: boolean
          phone_payment_link_enabled?: boolean
          phone_prep_minutes?: number | null
          phone_speak_prices?: boolean
          ordering_phone_number?: string | null
          drive_thru_enabled?: boolean
          organization_id?: string | null
          ordering_paused?: boolean
          test_mode?: boolean
          require_payment_before_kitchen?: boolean
          pay_at_pickup_enabled?: boolean
          menu_source?: string
          order_route?: string
          default_language?: string
          stripe_account_id?: string | null
          card_payments_enabled?: boolean
          published_at?: string | null
          slug?: string
          spoken_responses_enabled?: boolean
          updated_at?: string
          upsells_enabled?: boolean
          voice_greeting?: string | null
          voice_ordering_enabled?: boolean
          website?: string | null
        }
        Relationships: []
      }
      menu_upsells: {
        Row: {
          id: string
          restaurant_slug: string
          source_item_id: string
          suggested_item_id: string
          enabled: boolean
          created_at: string
        }
        Insert: {
          id?: string
          restaurant_slug: string
          source_item_id: string
          suggested_item_id: string
          enabled?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          restaurant_slug?: string
          source_item_id?: string
          suggested_item_id?: string
          enabled?: boolean
          created_at?: string
        }
        Relationships: []
      }
      product_events: {
        Row: {
          id: string
          event_name: string
          restaurant_slug: string | null
          properties: Json
          created_at: string
        }
        Insert: {
          id?: string
          event_name: string
          restaurant_slug?: string | null
          properties?: Json
          created_at?: string
        }
        Update: {
          id?: string
          event_name?: string
          restaurant_slug?: string | null
          properties?: Json
          created_at?: string
        }
        Relationships: []
      }
      menu_items: {
        Row: {
          category: string
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          is_available: boolean
          modifiers: Json | null
          name: string
          price: number
          truck_id: string
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_available?: boolean
          modifiers?: Json | null
          name: string
          price: number
          truck_id: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_available?: boolean
          modifiers?: Json | null
          name?: string
          price?: number
          truck_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      orders: {
        Row: {
          created_at: string
          customer_name: string | null
          id: string
          items: Json
          order_number: string
          status: string
          subtotal: number
          tax: number
          total: number
          truck_id: string
          guest_access_token: string | null
          payment_status: string
          source: string
          is_test: boolean
          routing_status: string
          payment_provider: string | null
          idempotency_key: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_name?: string | null
          id?: string
          items: Json
          order_number: string
          status?: string
          subtotal: number
          tax: number
          total: number
          truck_id: string
          guest_access_token?: string | null
          payment_status?: string
          source?: string
          is_test?: boolean
          routing_status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_name?: string | null
          id?: string
          items?: Json
          order_number?: string
          status?: string
          subtotal?: number
          tax?: number
          total?: number
          truck_id?: string
          guest_access_token?: string | null
          payment_status?: string
          source?: string
          is_test?: boolean
          routing_status?: string
          payment_provider?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      restaurant_staff: {
        Row: {
          id: string
          user_id: string
          restaurant_slug: string
          role: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          restaurant_slug: string
          role: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          restaurant_slug?: string
          role?: string
          created_at?: string
        }
        Relationships: []
      }
      pos_connections: {
        Row: {
          id: string
          restaurant_slug: string
          provider: string
          status: string
          external_account_id: string | null
          external_location_id: string | null
          last_health_at: string | null
          last_error: string | null
          created_at: string
        }
        Insert: {
          id?: string
          restaurant_slug: string
          provider: string
          status?: string
          external_account_id?: string | null
          external_location_id?: string | null
          last_health_at?: string | null
          last_error?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          restaurant_slug?: string
          provider?: string
          status?: string
          external_account_id?: string | null
          external_location_id?: string | null
          last_health_at?: string | null
          last_error?: string | null
          created_at?: string
        }
        Relationships: []
      }
      menu_translations: {
        Row: {
          id: string
          restaurant_slug: string
          entity_type: string
          entity_id: string
          field: string
          locale: string
          text: string
        }
        Insert: {
          id?: string
          restaurant_slug: string
          entity_type: string
          entity_id: string
          field: string
          locale: string
          text: string
        }
        Update: {
          id?: string
          restaurant_slug?: string
          entity_type?: string
          entity_id?: string
          field?: string
          locale?: string
          text?: string
        }
        Relationships: []
      }
      campaign_visits: {
        Row: {
          id: string
          campaign: string
          user_id: string | null
          event_name: string
          created_at: string
        }
        Insert: {
          id?: string
          campaign: string
          user_id?: string | null
          event_name: string
          created_at?: string
        }
        Update: {
          id?: string
          campaign?: string
          user_id?: string | null
          event_name?: string
          created_at?: string
        }
        Relationships: []
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
