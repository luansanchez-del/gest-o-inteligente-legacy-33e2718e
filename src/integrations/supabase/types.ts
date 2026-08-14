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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      analysis_result: {
        Row: {
          closing_period_id: string
          computed_at: string
          confidence: number
          created_at: string
          id: string
          organization_id: string
          requires_human_review: boolean
          rule_code: string | null
          rule_description: string | null
          situation: Database["public"]["Enums"]["closing_situation"]
        }
        Insert: {
          closing_period_id: string
          computed_at?: string
          confidence?: number
          created_at?: string
          id?: string
          organization_id: string
          requires_human_review?: boolean
          rule_code?: string | null
          rule_description?: string | null
          situation: Database["public"]["Enums"]["closing_situation"]
        }
        Update: {
          closing_period_id?: string
          computed_at?: string
          confidence?: number
          created_at?: string
          id?: string
          organization_id?: string
          requires_human_review?: boolean
          rule_code?: string | null
          rule_description?: string | null
          situation?: Database["public"]["Enums"]["closing_situation"]
        }
        Relationships: [
          {
            foreignKeyName: "analysis_result_closing_period_id_fkey"
            columns: ["closing_period_id"]
            isOneToOne: false
            referencedRelation: "closing_period"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analysis_result_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
        ]
      }
      app_setting: {
        Row: {
          created_at: string
          id: string
          key: string
          organization_id: string
          updated_at: string
          value: Json
        }
        Insert: {
          created_at?: string
          id?: string
          key: string
          organization_id: string
          updated_at?: string
          value?: Json
        }
        Update: {
          created_at?: string
          id?: string
          key?: string
          organization_id?: string
          updated_at?: string
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "app_setting_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_kind: string
          after_data: Json | null
          before_data: Json | null
          correlation_id: string | null
          created_at: string
          entity: string
          entity_id: string | null
          id: string
          organization_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_kind?: string
          after_data?: Json | null
          before_data?: Json | null
          correlation_id?: string | null
          created_at?: string
          entity: string
          entity_id?: string | null
          id?: string
          organization_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_kind?: string
          after_data?: Json | null
          before_data?: Json | null
          correlation_id?: string | null
          created_at?: string
          entity?: string
          entity_id?: string | null
          id?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
        ]
      }
      batch_execution: {
        Row: {
          completed_items: number
          created_at: string
          error_items: number
          finished_at: string | null
          id: string
          idempotency_key: string | null
          organization_id: string
          reference_month: string
          scope: Json
          skipped_items: number
          started_at: string | null
          started_by: string | null
          status: Database["public"]["Enums"]["run_status"]
          total_items: number
          updated_at: string
          warning_items: number
        }
        Insert: {
          completed_items?: number
          created_at?: string
          error_items?: number
          finished_at?: string | null
          id?: string
          idempotency_key?: string | null
          organization_id: string
          reference_month: string
          scope?: Json
          skipped_items?: number
          started_at?: string | null
          started_by?: string | null
          status?: Database["public"]["Enums"]["run_status"]
          total_items?: number
          updated_at?: string
          warning_items?: number
        }
        Update: {
          completed_items?: number
          created_at?: string
          error_items?: number
          finished_at?: string | null
          id?: string
          idempotency_key?: string | null
          organization_id?: string
          reference_month?: string
          scope?: Json
          skipped_items?: number
          started_at?: string | null
          started_by?: string | null
          status?: Database["public"]["Enums"]["run_status"]
          total_items?: number
          updated_at?: string
          warning_items?: number
        }
        Relationships: [
          {
            foreignKeyName: "batch_execution_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
        ]
      }
      batch_item: {
        Row: {
          attempts: number
          batch_execution_id: string
          closing_period_id: string | null
          company_id: string | null
          created_at: string
          id: string
          message: string | null
          organization_id: string
          status: Database["public"]["Enums"]["item_status"]
          updated_at: string
        }
        Insert: {
          attempts?: number
          batch_execution_id: string
          closing_period_id?: string | null
          company_id?: string | null
          created_at?: string
          id?: string
          message?: string | null
          organization_id: string
          status?: Database["public"]["Enums"]["item_status"]
          updated_at?: string
        }
        Update: {
          attempts?: number
          batch_execution_id?: string
          closing_period_id?: string | null
          company_id?: string | null
          created_at?: string
          id?: string
          message?: string | null
          organization_id?: string
          status?: Database["public"]["Enums"]["item_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "batch_item_batch_execution_id_fkey"
            columns: ["batch_execution_id"]
            isOneToOne: false
            referencedRelation: "batch_execution"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_item_closing_period_id_fkey"
            columns: ["closing_period_id"]
            isOneToOne: false
            referencedRelation: "closing_period"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_item_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_item_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
        ]
      }
      closing_period: {
        Row: {
          company_id: string
          created_at: string
          deadline_at: string | null
          delivered_at: string | null
          department_external_id: string | null
          id: string
          last_analysis_at: string | null
          organization_id: string
          reference_month: string
          responsible_external_id: string | null
          responsible_name: string | null
          situation: Database["public"]["Enums"]["closing_situation"]
          type: Database["public"]["Enums"]["closing_type"]
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          deadline_at?: string | null
          delivered_at?: string | null
          department_external_id?: string | null
          id?: string
          last_analysis_at?: string | null
          organization_id: string
          reference_month: string
          responsible_external_id?: string | null
          responsible_name?: string | null
          situation?: Database["public"]["Enums"]["closing_situation"]
          type?: Database["public"]["Enums"]["closing_type"]
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          deadline_at?: string | null
          delivered_at?: string | null
          department_external_id?: string | null
          id?: string
          last_analysis_at?: string | null
          organization_id?: string
          reference_month?: string
          responsible_external_id?: string | null
          responsible_name?: string | null
          situation?: Database["public"]["Enums"]["closing_situation"]
          type?: Database["public"]["Enums"]["closing_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "closing_period_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "closing_period_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
        ]
      }
      company: {
        Row: {
          active: boolean
          created_at: string
          document: string | null
          document_digits: string | null
          id: string
          name: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          document?: string | null
          document_digits?: string | null
          id?: string
          name: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          document?: string | null
          document_digits?: string | null
          id?: string
          name?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
        ]
      }
      company_pier_link: {
        Row: {
          company_id: string
          created_at: string
          id: string
          linked_by: string | null
          organization_id: string
          pier_client_id: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          linked_by?: string | null
          organization_id: string
          pier_client_id: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          linked_by?: string | null
          organization_id?: string
          pier_client_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_pier_link_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_pier_link_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_pier_link_pier_client_id_fkey"
            columns: ["pier_client_id"]
            isOneToOne: false
            referencedRelation: "pier_client"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_metric: {
        Row: {
          computed_at: string
          denominator: number
          id: string
          metric_code: string
          numerator: number
          organization_id: string
          reference_month: string
          rule_description: string
          scope_key: string
          scope_type: string
        }
        Insert: {
          computed_at?: string
          denominator?: number
          id?: string
          metric_code: string
          numerator?: number
          organization_id: string
          reference_month: string
          rule_description: string
          scope_key?: string
          scope_type: string
        }
        Update: {
          computed_at?: string
          denominator?: number
          id?: string
          metric_code?: string
          numerator?: number
          organization_id?: string
          reference_month?: string
          rule_description?: string
          scope_key?: string
          scope_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_metric_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
        ]
      }
      evidence: {
        Row: {
          analysis_result_id: string
          created_at: string
          excerpt: string | null
          id: string
          occurred_at: string | null
          organization_id: string
          source_ref: string | null
          source_type: string
        }
        Insert: {
          analysis_result_id: string
          created_at?: string
          excerpt?: string | null
          id?: string
          occurred_at?: string | null
          organization_id: string
          source_ref?: string | null
          source_type: string
        }
        Update: {
          analysis_result_id?: string
          created_at?: string
          excerpt?: string | null
          id?: string
          occurred_at?: string | null
          organization_id?: string
          source_ref?: string | null
          source_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "evidence_analysis_result_id_fkey"
            columns: ["analysis_result_id"]
            isOneToOne: false
            referencedRelation: "analysis_result"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
        ]
      }
      file_ref: {
        Row: {
          created_at: string
          external_id: string
          filename: string | null
          id: string
          mime_type: string | null
          organization_id: string
          post_id: string | null
          request_id: string | null
          size_bytes: number | null
          storage_path: string | null
        }
        Insert: {
          created_at?: string
          external_id: string
          filename?: string | null
          id?: string
          mime_type?: string | null
          organization_id: string
          post_id?: string | null
          request_id?: string | null
          size_bytes?: number | null
          storage_path?: string | null
        }
        Update: {
          created_at?: string
          external_id?: string
          filename?: string | null
          id?: string
          mime_type?: string | null
          organization_id?: string
          post_id?: string | null
          request_id?: string | null
          size_bytes?: number | null
          storage_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "file_ref_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_ref_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "post"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_ref_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "request"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_credential_ref: {
        Row: {
          configured: boolean
          created_at: string
          id: string
          integration: string
          last_checked_at: string | null
          organization_id: string
          secret_name: string
          updated_at: string
        }
        Insert: {
          configured?: boolean
          created_at?: string
          id?: string
          integration: string
          last_checked_at?: string | null
          organization_id: string
          secret_name: string
          updated_at?: string
        }
        Update: {
          configured?: boolean
          created_at?: string
          id?: string
          integration?: string
          last_checked_at?: string | null
          organization_id?: string
          secret_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_credential_ref_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
        ]
      }
      membership: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          organization_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          organization_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          organization_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "membership_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
        ]
      }
      organization: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      pendency: {
        Row: {
          category: string
          closing_period_id: string
          created_at: string
          difference: string | null
          expected_value: string | null
          found_value: string | null
          guidance: string | null
          id: string
          organization_id: string
          rule_code: string | null
          severity: Database["public"]["Enums"]["severity"]
          status: Database["public"]["Enums"]["pendency_status"]
          updated_at: string
        }
        Insert: {
          category: string
          closing_period_id: string
          created_at?: string
          difference?: string | null
          expected_value?: string | null
          found_value?: string | null
          guidance?: string | null
          id?: string
          organization_id: string
          rule_code?: string | null
          severity?: Database["public"]["Enums"]["severity"]
          status?: Database["public"]["Enums"]["pendency_status"]
          updated_at?: string
        }
        Update: {
          category?: string
          closing_period_id?: string
          created_at?: string
          difference?: string | null
          expected_value?: string | null
          found_value?: string | null
          guidance?: string | null
          id?: string
          organization_id?: string
          rule_code?: string | null
          severity?: Database["public"]["Enums"]["severity"]
          status?: Database["public"]["Enums"]["pendency_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pendency_closing_period_id_fkey"
            columns: ["closing_period_id"]
            isOneToOne: false
            referencedRelation: "closing_period"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pendency_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
        ]
      }
      pier_client: {
        Row: {
          created_at: string
          document: string | null
          external_id: string
          id: string
          name: string
          organization_id: string
          raw: Json
          responsible_name: string | null
          status: string | null
          synced_at: string
          tax_regime: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          document?: string | null
          external_id: string
          id?: string
          name: string
          organization_id: string
          raw?: Json
          responsible_name?: string | null
          status?: string | null
          synced_at?: string
          tax_regime?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          document?: string | null
          external_id?: string
          id?: string
          name?: string
          organization_id?: string
          raw?: Json
          responsible_name?: string | null
          status?: string | null
          synced_at?: string
          tax_regime?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pier_client_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
        ]
      }
      pier_department: {
        Row: {
          created_at: string
          external_id: string
          id: string
          name: string
          organization_id: string
          synced_at: string
          updated_at: string
          user_count: number
        }
        Insert: {
          created_at?: string
          external_id: string
          id?: string
          name: string
          organization_id: string
          synced_at?: string
          updated_at?: string
          user_count?: number
        }
        Update: {
          created_at?: string
          external_id?: string
          id?: string
          name?: string
          organization_id?: string
          synced_at?: string
          updated_at?: string
          user_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "pier_department_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
        ]
      }
      pier_user: {
        Row: {
          created_at: string
          department_external_id: string | null
          email: string | null
          external_id: string
          id: string
          kind: string | null
          login: string | null
          name: string
          organization_id: string
          raw: Json
          status: string | null
          synced_at: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          department_external_id?: string | null
          email?: string | null
          external_id: string
          id?: string
          kind?: string | null
          login?: string | null
          name: string
          organization_id: string
          raw?: Json
          status?: string | null
          synced_at?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          department_external_id?: string | null
          email?: string | null
          external_id?: string
          id?: string
          kind?: string | null
          login?: string | null
          name?: string
          organization_id?: string
          raw?: Json
          status?: string | null
          synced_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pier_user_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
        ]
      }
      post: {
        Row: {
          author_name: string | null
          content: string | null
          created_at: string
          external_id: string
          id: string
          organization_id: string
          posted_at: string | null
          request_id: string
        }
        Insert: {
          author_name?: string | null
          content?: string | null
          created_at?: string
          external_id: string
          id?: string
          organization_id: string
          posted_at?: string | null
          request_id: string
        }
        Update: {
          author_name?: string | null
          content?: string | null
          created_at?: string
          external_id?: string
          id?: string
          organization_id?: string
          posted_at?: string | null
          request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "request"
            referencedColumns: ["id"]
          },
        ]
      }
      request: {
        Row: {
          client_document: string | null
          client_external_id: string | null
          client_name: string | null
          closing_period_id: string | null
          company_id: string | null
          created_at: string
          deadline_at: string | null
          department_external_id: string | null
          description: string | null
          external_id: string
          finished_at: string | null
          has_attachment: boolean
          id: string
          number: string | null
          organization_id: string
          purpose: string
          raw: Json
          reference_month: string | null
          requested_at: string | null
          responsible_external_id: string | null
          responsible_name: string | null
          status: string | null
          synced_at: string
          type_external_id: string | null
          type_name: string | null
          updated_at: string
        }
        Insert: {
          client_document?: string | null
          client_external_id?: string | null
          client_name?: string | null
          closing_period_id?: string | null
          company_id?: string | null
          created_at?: string
          deadline_at?: string | null
          department_external_id?: string | null
          description?: string | null
          external_id: string
          finished_at?: string | null
          has_attachment?: boolean
          id?: string
          number?: string | null
          organization_id: string
          purpose?: string
          raw?: Json
          reference_month?: string | null
          requested_at?: string | null
          responsible_external_id?: string | null
          responsible_name?: string | null
          status?: string | null
          synced_at?: string
          type_external_id?: string | null
          type_name?: string | null
          updated_at?: string
        }
        Update: {
          client_document?: string | null
          client_external_id?: string | null
          client_name?: string | null
          closing_period_id?: string | null
          company_id?: string | null
          created_at?: string
          deadline_at?: string | null
          department_external_id?: string | null
          description?: string | null
          external_id?: string
          finished_at?: string | null
          has_attachment?: boolean
          id?: string
          number?: string | null
          organization_id?: string
          purpose?: string
          raw?: Json
          reference_month?: string | null
          requested_at?: string | null
          responsible_external_id?: string | null
          responsible_name?: string | null
          status?: string | null
          synced_at?: string
          type_external_id?: string | null
          type_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "request_closing_period_id_fkey"
            columns: ["closing_period_id"]
            isOneToOne: false
            referencedRelation: "closing_period"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
        ]
      }
      request_attachment: {
        Row: {
          created_at: string
          external_id: string | null
          filename: string
          id: string
          metadata: Json
          mime_type: string | null
          organization_id: string
          request_id: string
          sha256: string
          size_bytes: number | null
          status: Database["public"]["Enums"]["attachment_status"]
          storage_path: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          external_id?: string | null
          filename: string
          id?: string
          metadata?: Json
          mime_type?: string | null
          organization_id: string
          request_id: string
          sha256: string
          size_bytes?: number | null
          status?: Database["public"]["Enums"]["attachment_status"]
          storage_path: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          external_id?: string | null
          filename?: string
          id?: string
          metadata?: Json
          mime_type?: string | null
          organization_id?: string
          request_id?: string
          sha256?: string
          size_bytes?: number | null
          status?: Database["public"]["Enums"]["attachment_status"]
          storage_path?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "request_attachment_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_attachment_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "request"
            referencedColumns: ["id"]
          },
        ]
      }
      request_decision: {
        Row: {
          created_at: string
          decided_at: string
          decided_by: string | null
          decision: Database["public"]["Enums"]["decision_kind"]
          execution_id: string | null
          id: string
          notes: string | null
          organization_id: string
          pier_action_status: Database["public"]["Enums"]["pier_action_status"]
          request_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          decided_at?: string
          decided_by?: string | null
          decision: Database["public"]["Enums"]["decision_kind"]
          execution_id?: string | null
          id?: string
          notes?: string | null
          organization_id: string
          pier_action_status?: Database["public"]["Enums"]["pier_action_status"]
          request_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          decided_at?: string
          decided_by?: string | null
          decision?: Database["public"]["Enums"]["decision_kind"]
          execution_id?: string | null
          id?: string
          notes?: string | null
          organization_id?: string
          pier_action_status?: Database["public"]["Enums"]["pier_action_status"]
          request_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "request_decision_execution_id_fkey"
            columns: ["execution_id"]
            isOneToOne: false
            referencedRelation: "validation_execution"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_decision_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_decision_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "request"
            referencedColumns: ["id"]
          },
        ]
      }
      request_instruction: {
        Row: {
          created_at: string
          id: string
          interpreted: Json
          occurred_at: string | null
          organization_id: string
          request_id: string
          source: Database["public"]["Enums"]["instruction_source"]
          source_external_id: string | null
          text: string
        }
        Insert: {
          created_at?: string
          id?: string
          interpreted?: Json
          occurred_at?: string | null
          organization_id: string
          request_id: string
          source: Database["public"]["Enums"]["instruction_source"]
          source_external_id?: string | null
          text: string
        }
        Update: {
          created_at?: string
          id?: string
          interpreted?: Json
          occurred_at?: string | null
          organization_id?: string
          request_id?: string
          source?: Database["public"]["Enums"]["instruction_source"]
          source_external_id?: string | null
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "request_instruction_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_instruction_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "request"
            referencedColumns: ["id"]
          },
        ]
      }
      review_task: {
        Row: {
          assigned_to: string | null
          closing_period_id: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          id: string
          notes: string | null
          organization_id: string
          reason: string | null
          status: Database["public"]["Enums"]["review_status"]
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          closing_period_id: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          notes?: string | null
          organization_id: string
          reason?: string | null
          status?: Database["public"]["Enums"]["review_status"]
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          closing_period_id?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          notes?: string | null
          organization_id?: string
          reason?: string | null
          status?: Database["public"]["Enums"]["review_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_task_closing_period_id_fkey"
            columns: ["closing_period_id"]
            isOneToOne: false
            referencedRelation: "closing_period"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_task_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_event: {
        Row: {
          created_at: string
          external_id: string | null
          id: string
          level: Database["public"]["Enums"]["severity"]
          message: string
          organization_id: string
          sync_run_id: string
        }
        Insert: {
          created_at?: string
          external_id?: string | null
          id?: string
          level?: Database["public"]["Enums"]["severity"]
          message: string
          organization_id: string
          sync_run_id: string
        }
        Update: {
          created_at?: string
          external_id?: string | null
          id?: string
          level?: Database["public"]["Enums"]["severity"]
          message?: string
          organization_id?: string
          sync_run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sync_event_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sync_event_sync_run_id_fkey"
            columns: ["sync_run_id"]
            isOneToOne: false
            referencedRelation: "sync_run"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_run: {
        Row: {
          created_at: string
          failed_items: number
          finished_at: string | null
          id: string
          kind: string
          message: string | null
          organization_id: string
          processed_items: number
          scope: Json
          started_at: string
          started_by: string | null
          status: Database["public"]["Enums"]["run_status"]
          total_items: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          failed_items?: number
          finished_at?: string | null
          id?: string
          kind: string
          message?: string | null
          organization_id: string
          processed_items?: number
          scope?: Json
          started_at?: string
          started_by?: string | null
          status?: Database["public"]["Enums"]["run_status"]
          total_items?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          failed_items?: number
          finished_at?: string | null
          id?: string
          kind?: string
          message?: string | null
          organization_id?: string
          processed_items?: number
          scope?: Json
          started_at?: string
          started_by?: string | null
          status?: Database["public"]["Enums"]["run_status"]
          total_items?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sync_run_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
        ]
      }
      user_role: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_role_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
        ]
      }
      validation_execution: {
        Row: {
          actor_id: string | null
          attachment_id: string
          content_hash: string
          created_at: string
          error_message: string | null
          finished_at: string | null
          id: string
          instruction_snapshot: Json
          organization_id: string
          request_id: string
          result: Database["public"]["Enums"]["validation_result"] | null
          started_at: string | null
          status: Database["public"]["Enums"]["validation_status"]
          summary: string | null
          totals: Json
          updated_at: string
          validator_version: string
        }
        Insert: {
          actor_id?: string | null
          attachment_id: string
          content_hash: string
          created_at?: string
          error_message?: string | null
          finished_at?: string | null
          id?: string
          instruction_snapshot?: Json
          organization_id: string
          request_id: string
          result?: Database["public"]["Enums"]["validation_result"] | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["validation_status"]
          summary?: string | null
          totals?: Json
          updated_at?: string
          validator_version: string
        }
        Update: {
          actor_id?: string | null
          attachment_id?: string
          content_hash?: string
          created_at?: string
          error_message?: string | null
          finished_at?: string | null
          id?: string
          instruction_snapshot?: Json
          organization_id?: string
          request_id?: string
          result?: Database["public"]["Enums"]["validation_result"] | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["validation_status"]
          summary?: string | null
          totals?: Json
          updated_at?: string
          validator_version?: string
        }
        Relationships: [
          {
            foreignKeyName: "validation_execution_attachment_id_fkey"
            columns: ["attachment_id"]
            isOneToOne: false
            referencedRelation: "request_attachment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "validation_execution_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "validation_execution_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "request"
            referencedColumns: ["id"]
          },
        ]
      }
      validation_finding: {
        Row: {
          account_code: string | null
          account_name: string | null
          code: string
          created_at: string
          detail: string | null
          evidence: Json
          execution_id: string
          id: string
          organization_id: string
          page: number | null
          requires_human: boolean
          severity: Database["public"]["Enums"]["finding_severity"]
          title: string
        }
        Insert: {
          account_code?: string | null
          account_name?: string | null
          code: string
          created_at?: string
          detail?: string | null
          evidence?: Json
          execution_id: string
          id?: string
          organization_id: string
          page?: number | null
          requires_human?: boolean
          severity: Database["public"]["Enums"]["finding_severity"]
          title: string
        }
        Update: {
          account_code?: string | null
          account_name?: string | null
          code?: string
          created_at?: string
          detail?: string | null
          evidence?: Json
          execution_id?: string
          id?: string
          organization_id?: string
          page?: number | null
          requires_human?: boolean
          severity?: Database["public"]["Enums"]["finding_severity"]
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "validation_finding_execution_id_fkey"
            columns: ["execution_id"]
            isOneToOne: false
            referencedRelation: "validation_execution"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "validation_finding_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_write: {
        Args: { _organization_id: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _organization_id: string
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_member: {
        Args: { _organization_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "gestor" | "colaborador" | "leitura"
      attachment_status: "UPLOADED" | "PARSED" | "FAILED"
      closing_situation:
        | "CONCLUIDA_NO_PRAZO"
        | "CONCLUIDA_FORA_PRAZO"
        | "EM_ANDAMENTO_NO_PRAZO"
        | "ATRASADA"
        | "AGUARDANDO_CLIENTE"
        | "SEM_EVIDENCIA"
        | "PRECISA_REVISAO"
        | "NAO_ANALISADA"
      closing_type: "CONTABIL" | "FISCAL" | "OUTRO"
      decision_kind: "APPROVED" | "RETURNED" | "NEEDS_REVIEW"
      finding_severity: "INFO" | "WARNING" | "ERROR" | "BLOCKER"
      instruction_source: "TITLE" | "POST" | "USER"
      item_status:
        | "PENDING"
        | "PROCESSING"
        | "COMPLETED"
        | "WARNING"
        | "ERROR"
        | "SKIPPED"
      pendency_status: "OPEN" | "RESOLVED" | "IGNORED"
      pier_action_status: "NOT_SENT" | "PENDING" | "SENT" | "FAILED"
      review_status: "PENDING" | "APPROVED" | "RETURNED" | "IGNORED"
      run_status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED"
      severity: "INFO" | "WARNING" | "CRITICAL"
      validation_result:
        | "APROVADO"
        | "COM_ALERTAS"
        | "REPROVADO"
        | "REVISAO_HUMANA"
      validation_status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED"
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
    Enums: {
      app_role: ["admin", "gestor", "colaborador", "leitura"],
      attachment_status: ["UPLOADED", "PARSED", "FAILED"],
      closing_situation: [
        "CONCLUIDA_NO_PRAZO",
        "CONCLUIDA_FORA_PRAZO",
        "EM_ANDAMENTO_NO_PRAZO",
        "ATRASADA",
        "AGUARDANDO_CLIENTE",
        "SEM_EVIDENCIA",
        "PRECISA_REVISAO",
        "NAO_ANALISADA",
      ],
      closing_type: ["CONTABIL", "FISCAL", "OUTRO"],
      decision_kind: ["APPROVED", "RETURNED", "NEEDS_REVIEW"],
      finding_severity: ["INFO", "WARNING", "ERROR", "BLOCKER"],
      instruction_source: ["TITLE", "POST", "USER"],
      item_status: [
        "PENDING",
        "PROCESSING",
        "COMPLETED",
        "WARNING",
        "ERROR",
        "SKIPPED",
      ],
      pendency_status: ["OPEN", "RESOLVED", "IGNORED"],
      pier_action_status: ["NOT_SENT", "PENDING", "SENT", "FAILED"],
      review_status: ["PENDING", "APPROVED", "RETURNED", "IGNORED"],
      run_status: ["PENDING", "RUNNING", "COMPLETED", "FAILED", "CANCELLED"],
      severity: ["INFO", "WARNING", "CRITICAL"],
      validation_result: [
        "APROVADO",
        "COM_ALERTAS",
        "REPROVADO",
        "REVISAO_HUMANA",
      ],
      validation_status: ["PENDING", "RUNNING", "COMPLETED", "FAILED"],
    },
  },
} as const
