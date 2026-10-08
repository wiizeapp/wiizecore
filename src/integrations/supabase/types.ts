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
      activation_documents: {
        Row: {
          created_at: string
          id: string
          kind: string
          mime_type: string
          size_bytes: number
          storage_path: string
          tenant_id: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          mime_type: string
          size_bytes: number
          storage_path: string
          tenant_id: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          mime_type?: string
          size_bytes?: number
          storage_path?: string
          tenant_id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activation_documents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      activation_events: {
        Row: {
          actor_id: string | null
          created_at: string
          from_status: Database["public"]["Enums"]["activation_status"] | null
          id: string
          message: string | null
          tenant_id: string
          to_status: Database["public"]["Enums"]["activation_status"]
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["activation_status"] | null
          id?: string
          message?: string | null
          tenant_id: string
          to_status: Database["public"]["Enums"]["activation_status"]
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["activation_status"] | null
          id?: string
          message?: string | null
          tenant_id?: string
          to_status?: Database["public"]["Enums"]["activation_status"]
        }
        Relationships: [
          {
            foreignKeyName: "activation_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      activation_mobile_handoffs: {
        Row: {
          attempts: number
          code_hash: string
          created_at: string
          created_by: string
          created_ip: string | null
          expires_at: string
          id: string
          revoked_at: string | null
          session_expires_at: string | null
          session_token_hash: string | null
          tenant_id: string
          token_hash: string
          used_at: string | null
          verified_at: string | null
          verified_ip: string | null
        }
        Insert: {
          attempts?: number
          code_hash: string
          created_at?: string
          created_by: string
          created_ip?: string | null
          expires_at: string
          id?: string
          revoked_at?: string | null
          session_expires_at?: string | null
          session_token_hash?: string | null
          tenant_id: string
          token_hash: string
          used_at?: string | null
          verified_at?: string | null
          verified_ip?: string | null
        }
        Update: {
          attempts?: number
          code_hash?: string
          created_at?: string
          created_by?: string
          created_ip?: string | null
          expires_at?: string
          id?: string
          revoked_at?: string | null
          session_expires_at?: string | null
          session_token_hash?: string | null
          tenant_id?: string
          token_hash?: string
          used_at?: string | null
          verified_at?: string | null
          verified_ip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activation_mobile_handoffs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      anticipation_fee_settings: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          effective_from: string
          effective_until: string | null
          id: string
          monthly_percentage_fee: number
          payment_method: string
          public_visible: boolean
          updated_at: string
          version: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_until?: string | null
          id?: string
          monthly_percentage_fee: number
          payment_method: string
          public_visible?: boolean
          updated_at?: string
          version?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_until?: string | null
          id?: string
          monthly_percentage_fee?: number
          payment_method?: string
          public_visible?: boolean
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      anticipation_items: {
        Row: {
          anticipated_amount: number
          anticipation_date: string
          anticipation_fee_amount: number
          anticipation_request_id: string
          created_at: string
          days_anticipated: number
          effective_rate: number
          fee_configuration_id: string
          gross_amount: number
          id: string
          monthly_rate: number
          net_amount: number
          original_due_date: string
          payment_id: string
          provider_reference: string | null
          tenant_id: string
        }
        Insert: {
          anticipated_amount: number
          anticipation_date: string
          anticipation_fee_amount: number
          anticipation_request_id: string
          created_at?: string
          days_anticipated: number
          effective_rate: number
          fee_configuration_id: string
          gross_amount: number
          id?: string
          monthly_rate: number
          net_amount: number
          original_due_date: string
          payment_id: string
          provider_reference?: string | null
          tenant_id: string
        }
        Update: {
          anticipated_amount?: number
          anticipation_date?: string
          anticipation_fee_amount?: number
          anticipation_request_id?: string
          created_at?: string
          days_anticipated?: number
          effective_rate?: number
          fee_configuration_id?: string
          gross_amount?: number
          id?: string
          monthly_rate?: number
          net_amount?: number
          original_due_date?: string
          payment_id?: string
          provider_reference?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "anticipation_items_anticipation_request_id_fkey"
            columns: ["anticipation_request_id"]
            isOneToOne: false
            referencedRelation: "anticipation_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anticipation_items_fee_configuration_id_fkey"
            columns: ["fee_configuration_id"]
            isOneToOne: false
            referencedRelation: "anticipation_fee_settings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anticipation_items_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anticipation_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      anticipation_requests: {
        Row: {
          anticipation_days: number | null
          anticipation_fee_amount: number
          commercial_monthly_rate: number | null
          created_at: string
          failure_reason: string | null
          gross_amount: number
          id: string
          idempotency_key: string
          last_provider_event_id: string | null
          margin_collected_at: string | null
          margin_transfer_id: string | null
          net_amount: number
          payment_id: string | null
          processed_at: string | null
          provider: string
          provider_anticipation_id: string | null
          provider_fee_amount: number
          provider_fee_is_estimated: boolean
          provider_net_amount: number | null
          provider_status: string | null
          receivable_count: number
          requested_by: string
          settled_at: string | null
          status: Database["public"]["Enums"]["anticipation_status"]
          tenant_id: string
          updated_at: string
          weighted_average_days: number
          wiize_fee_amount: number
          wiize_margin_amount: number
        }
        Insert: {
          anticipation_days?: number | null
          anticipation_fee_amount: number
          commercial_monthly_rate?: number | null
          created_at?: string
          failure_reason?: string | null
          gross_amount: number
          id?: string
          idempotency_key: string
          last_provider_event_id?: string | null
          margin_collected_at?: string | null
          margin_transfer_id?: string | null
          net_amount: number
          payment_id?: string | null
          processed_at?: string | null
          provider?: string
          provider_anticipation_id?: string | null
          provider_fee_amount?: number
          provider_fee_is_estimated?: boolean
          provider_net_amount?: number | null
          provider_status?: string | null
          receivable_count: number
          requested_by: string
          settled_at?: string | null
          status?: Database["public"]["Enums"]["anticipation_status"]
          tenant_id: string
          updated_at?: string
          weighted_average_days?: number
          wiize_fee_amount?: number
          wiize_margin_amount?: number
        }
        Update: {
          anticipation_days?: number | null
          anticipation_fee_amount?: number
          commercial_monthly_rate?: number | null
          created_at?: string
          failure_reason?: string | null
          gross_amount?: number
          id?: string
          idempotency_key?: string
          last_provider_event_id?: string | null
          margin_collected_at?: string | null
          margin_transfer_id?: string | null
          net_amount?: number
          payment_id?: string | null
          processed_at?: string | null
          provider?: string
          provider_anticipation_id?: string | null
          provider_fee_amount?: number
          provider_fee_is_estimated?: boolean
          provider_net_amount?: number | null
          provider_status?: string | null
          receivable_count?: number
          requested_by?: string
          settled_at?: string | null
          status?: Database["public"]["Enums"]["anticipation_status"]
          tenant_id?: string
          updated_at?: string
          weighted_average_days?: number
          wiize_fee_amount?: number
          wiize_margin_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "anticipation_requests_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anticipation_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          id: string
          ip_address: string | null
          metadata: Json
          resource: string | null
          resource_id: string | null
          result: string
          tenant_id: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          ip_address?: string | null
          metadata?: Json
          resource?: string | null
          resource_id?: string | null
          result?: string
          tenant_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          ip_address?: string | null
          metadata?: Json
          resource?: string | null
          resource_id?: string | null
          result?: string
          tenant_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_accounts: {
        Row: {
          account_number: string
          account_type: string
          agency: string
          bank_code: string
          created_at: string
          holder_document: string
          holder_name: string
          id: string
          is_default: boolean
          pix_key: string | null
          sensitive_enc: string | null
          tenant_id: string
          updated_at: string
          verification_notes: string | null
          verification_status: string
          verified_at: string | null
        }
        Insert: {
          account_number: string
          account_type?: string
          agency: string
          bank_code: string
          created_at?: string
          holder_document: string
          holder_name: string
          id?: string
          is_default?: boolean
          pix_key?: string | null
          sensitive_enc?: string | null
          tenant_id: string
          updated_at?: string
          verification_notes?: string | null
          verification_status?: string
          verified_at?: string | null
        }
        Update: {
          account_number?: string
          account_type?: string
          agency?: string
          bank_code?: string
          created_at?: string
          holder_document?: string
          holder_name?: string
          id?: string
          is_default?: boolean
          pix_key?: string | null
          sensitive_enc?: string | null
          tenant_id?: string
          updated_at?: string
          verification_notes?: string | null
          verification_status?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_accounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      charge_events: {
        Row: {
          actor: string
          actor_user_id: string | null
          created_at: string
          event_type: string
          id: string
          metadata: Json
          payment_id: string
          tenant_id: string
        }
        Insert: {
          actor?: string
          actor_user_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json
          payment_id: string
          tenant_id: string
        }
        Update: {
          actor?: string
          actor_user_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json
          payment_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "charge_events_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charge_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      checkout_appearance_versions: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          settings: Json
          tenant_id: string
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          settings: Json
          tenant_id: string
          version: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          settings?: Json
          tenant_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "checkout_appearance_versions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      checkout_events: {
        Row: {
          charge_group_id: string
          created_at: string
          customer_id: string | null
          event: string
          id: string
          metadata: Json
          payment_link_id: string | null
          tenant_id: string
        }
        Insert: {
          charge_group_id: string
          created_at?: string
          customer_id?: string | null
          event: string
          id?: string
          metadata?: Json
          payment_link_id?: string | null
          tenant_id: string
        }
        Update: {
          charge_group_id?: string
          created_at?: string
          customer_id?: string | null
          event?: string
          id?: string
          metadata?: Json
          payment_link_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checkout_events_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkout_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_events: {
        Row: {
          actor: string | null
          contract_id: string
          created_at: string
          event: string
          id: string
          ip_address: string | null
          metadata: Json
          tenant_id: string
        }
        Insert: {
          actor?: string | null
          contract_id: string
          created_at?: string
          event: string
          id?: string
          ip_address?: string | null
          metadata?: Json
          tenant_id: string
        }
        Update: {
          actor?: string | null
          contract_id?: string
          created_at?: string
          event?: string
          id?: string
          ip_address?: string | null
          metadata?: Json
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_events_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_files: {
        Row: {
          contract_id: string
          created_at: string
          drive_file_id: string | null
          file_name: string
          id: string
          kind: string
          sha256: string
          source_format: string
          storage_backend: string
          storage_path: string
          tenant_id: string
          version: number
        }
        Insert: {
          contract_id: string
          created_at?: string
          drive_file_id?: string | null
          file_name: string
          id?: string
          kind: string
          sha256: string
          source_format: string
          storage_backend?: string
          storage_path: string
          tenant_id: string
          version: number
        }
        Update: {
          contract_id?: string
          created_at?: string
          drive_file_id?: string | null
          file_name?: string
          id?: string
          kind?: string
          sha256?: string
          source_format?: string
          storage_backend?: string
          storage_path?: string
          tenant_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "contract_files_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_files_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_links: {
        Row: {
          contract_id: string
          created_at: string
          created_by: string | null
          expires_at: string
          id: string
          revoked_at: string | null
          tenant_id: string
          token_hash: string
        }
        Insert: {
          contract_id: string
          created_at?: string
          created_by?: string | null
          expires_at: string
          id?: string
          revoked_at?: string | null
          tenant_id: string
          token_hash: string
        }
        Update: {
          contract_id?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          revoked_at?: string | null
          tenant_id?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_links_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_links_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_services: {
        Row: {
          contract_id: string
          created_at: string
          service_id: string
          tenant_id: string
        }
        Insert: {
          contract_id: string
          created_at?: string
          service_id: string
          tenant_id: string
        }
        Update: {
          contract_id?: string
          created_at?: string
          service_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_services_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_services_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_services_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_signature_fields: {
        Row: {
          contract_id: string
          created_at: string
          created_by: string | null
          h: number
          id: string
          kind: string
          page: number
          signer_key: string
          tenant_id: string
          version: number
          w: number
          x: number
          y: number
        }
        Insert: {
          contract_id: string
          created_at?: string
          created_by?: string | null
          h: number
          id?: string
          kind?: string
          page: number
          signer_key: string
          tenant_id: string
          version: number
          w: number
          x: number
          y: number
        }
        Update: {
          contract_id?: string
          created_at?: string
          created_by?: string | null
          h?: number
          id?: string
          kind?: string
          page?: number
          signer_key?: string
          tenant_id?: string
          version?: number
          w?: number
          x?: number
          y?: number
        }
        Relationships: [
          {
            foreignKeyName: "contract_signature_fields_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_signature_fields_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_signatures: {
        Row: {
          content_hash: string
          contract_id: string
          contract_version_id: string
          id: string
          initials_image: string | null
          ip_address: string | null
          signature_image: string | null
          signature_mode: string | null
          signed_at: string
          signer_document: string | null
          signer_email: string | null
          signer_name: string
          signer_role: string
          tenant_id: string
          user_agent: string | null
        }
        Insert: {
          content_hash: string
          contract_id: string
          contract_version_id: string
          id?: string
          initials_image?: string | null
          ip_address?: string | null
          signature_image?: string | null
          signature_mode?: string | null
          signed_at?: string
          signer_document?: string | null
          signer_email?: string | null
          signer_name: string
          signer_role: string
          tenant_id: string
          user_agent?: string | null
        }
        Update: {
          content_hash?: string
          contract_id?: string
          contract_version_id?: string
          id?: string
          initials_image?: string | null
          ip_address?: string | null
          signature_image?: string | null
          signature_mode?: string | null
          signed_at?: string
          signer_document?: string | null
          signer_email?: string | null
          signer_name?: string
          signer_role?: string
          tenant_id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contract_signatures_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_signatures_contract_version_id_fkey"
            columns: ["contract_version_id"]
            isOneToOne: false
            referencedRelation: "contract_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_signatures_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_signers: {
        Row: {
          contract_id: string
          created_at: string
          created_by: string | null
          document: string | null
          email: string | null
          id: string
          name: string
          removed_at: string | null
          role: string
          tenant_id: string
          token_expires_at: string | null
          token_hash: string | null
          updated_at: string
        }
        Insert: {
          contract_id: string
          created_at?: string
          created_by?: string | null
          document?: string | null
          email?: string | null
          id?: string
          name: string
          removed_at?: string | null
          role?: string
          tenant_id: string
          token_expires_at?: string | null
          token_hash?: string | null
          updated_at?: string
        }
        Update: {
          contract_id?: string
          created_at?: string
          created_by?: string | null
          document?: string | null
          email?: string | null
          id?: string
          name?: string
          removed_at?: string | null
          role?: string
          tenant_id?: string
          token_expires_at?: string | null
          token_hash?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_signers_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_signers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_versions: {
        Row: {
          body: string
          content_hash: string
          contract_id: string
          created_at: string
          created_by: string | null
          id: string
          tenant_id: string
          version: number
        }
        Insert: {
          body: string
          content_hash: string
          contract_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          tenant_id: string
          version: number
        }
        Update: {
          body?: string
          content_hash?: string
          contract_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          tenant_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "contract_versions_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_versions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      contracts: {
        Row: {
          amount: number
          archived_at: string | null
          cancelled_at: string | null
          created_at: string
          created_by: string | null
          current_version: number
          customer_id: string | null
          duration_months: number | null
          ends_on: string | null
          id: string
          sent_at: string | null
          service_id: string | null
          signed_at: string | null
          starts_on: string | null
          status: Database["public"]["Enums"]["contract_status"]
          tenant_id: string
          title: string
          updated_at: string
          verification_code: string | null
        }
        Insert: {
          amount?: number
          archived_at?: string | null
          cancelled_at?: string | null
          created_at?: string
          created_by?: string | null
          current_version?: number
          customer_id?: string | null
          duration_months?: number | null
          ends_on?: string | null
          id?: string
          sent_at?: string | null
          service_id?: string | null
          signed_at?: string | null
          starts_on?: string | null
          status?: Database["public"]["Enums"]["contract_status"]
          tenant_id: string
          title: string
          updated_at?: string
          verification_code?: string | null
        }
        Update: {
          amount?: number
          archived_at?: string | null
          cancelled_at?: string | null
          created_at?: string
          created_by?: string | null
          current_version?: number
          customer_id?: string | null
          duration_months?: number | null
          ends_on?: string | null
          id?: string
          sent_at?: string | null
          service_id?: string | null
          signed_at?: string | null
          starts_on?: string | null
          status?: Database["public"]["Enums"]["contract_status"]
          tenant_id?: string
          title?: string
          updated_at?: string
          verification_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contracts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      cookie_consents: {
        Row: {
          analytics: boolean
          anon_id: string
          created_at: string
          functional: boolean
          id: string
          language: string | null
          marketing: boolean
          necessary: boolean
          page_url: string | null
          policy_version: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          analytics?: boolean
          anon_id: string
          created_at?: string
          functional?: boolean
          id?: string
          language?: string | null
          marketing?: boolean
          necessary?: boolean
          page_url?: string | null
          policy_version: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          analytics?: boolean
          anon_id?: string
          created_at?: string
          functional?: boolean
          id?: string
          language?: string | null
          marketing?: boolean
          necessary?: boolean
          page_url?: string | null
          policy_version?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      coproduction_events: {
        Row: {
          actor_user_id: string | null
          coproduction_id: string
          created_at: string
          event: string
          id: string
          metadata: Json
          participant_id: string | null
          tenant_id: string
        }
        Insert: {
          actor_user_id?: string | null
          coproduction_id: string
          created_at?: string
          event: string
          id?: string
          metadata?: Json
          participant_id?: string | null
          tenant_id: string
        }
        Update: {
          actor_user_id?: string | null
          coproduction_id?: string
          created_at?: string
          event?: string
          id?: string
          metadata?: Json
          participant_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coproduction_events_coproduction_id_fkey"
            columns: ["coproduction_id"]
            isOneToOne: false
            referencedRelation: "payment_coproductions"
            referencedColumns: ["id"]
          },
        ]
      }
      coproduction_splits: {
        Row: {
          amount: number
          coproduction_id: string
          created_at: string
          fee_amount: number
          gross_amount: number
          id: string
          net_amount: number
          participant_id: string
          participant_tenant_id: string
          payment_id: string
          percentage: number
          provider_event_id: string | null
          provider_payment_id: string | null
          refunded_amount: number
          refunded_at: string | null
          released_at: string | null
          status: string
          tenant_id: string
        }
        Insert: {
          amount: number
          coproduction_id: string
          created_at?: string
          fee_amount: number
          gross_amount: number
          id?: string
          net_amount: number
          participant_id: string
          participant_tenant_id: string
          payment_id: string
          percentage: number
          provider_event_id?: string | null
          provider_payment_id?: string | null
          refunded_amount?: number
          refunded_at?: string | null
          released_at?: string | null
          status?: string
          tenant_id: string
        }
        Update: {
          amount?: number
          coproduction_id?: string
          created_at?: string
          fee_amount?: number
          gross_amount?: number
          id?: string
          net_amount?: number
          participant_id?: string
          participant_tenant_id?: string
          payment_id?: string
          percentage?: number
          provider_event_id?: string | null
          provider_payment_id?: string | null
          refunded_amount?: number
          refunded_at?: string | null
          released_at?: string | null
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coproduction_splits_coproduction_id_fkey"
            columns: ["coproduction_id"]
            isOneToOne: false
            referencedRelation: "payment_coproductions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coproduction_splits_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "payment_coproduction_participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coproduction_splits_participant_tenant_id_fkey"
            columns: ["participant_tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coproduction_splits_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coproduction_splits_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      coupon_events: {
        Row: {
          coupon_id: string | null
          created_at: string
          event: string
          id: string
          metadata: Json
          payment_id: string | null
          tenant_id: string
        }
        Insert: {
          coupon_id?: string | null
          created_at?: string
          event: string
          id?: string
          metadata?: Json
          payment_id?: string | null
          tenant_id: string
        }
        Update: {
          coupon_id?: string | null
          created_at?: string
          event?: string
          id?: string
          metadata?: Json
          payment_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coupon_events_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      coupon_redemptions: {
        Row: {
          base_amount: number
          coupon_id: string
          created_at: string
          customer_id: string | null
          discount_amount: number
          id: string
          idempotency_key: string
          payment_id: string
          redeemed_at: string | null
          released_at: string | null
          status: string
          tenant_id: string
        }
        Insert: {
          base_amount: number
          coupon_id: string
          created_at?: string
          customer_id?: string | null
          discount_amount: number
          id?: string
          idempotency_key: string
          payment_id: string
          redeemed_at?: string | null
          released_at?: string | null
          status?: string
          tenant_id: string
        }
        Update: {
          base_amount?: number
          coupon_id?: string
          created_at?: string
          customer_id?: string | null
          discount_amount?: number
          id?: string
          idempotency_key?: string
          payment_id?: string
          redeemed_at?: string | null
          released_at?: string | null
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coupon_redemptions_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_redemptions_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_redemptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      coupons: {
        Row: {
          code: string
          code_normalized: string
          created_at: string
          created_by: string | null
          description: string | null
          discount_type: string
          discount_value: number
          expires_at: string | null
          id: string
          max_discount: number | null
          min_amount: number | null
          per_customer_limit: number | null
          restore_on_refund: boolean
          service_ids: string[] | null
          starts_at: string | null
          status: string
          tenant_id: string
          updated_at: string
          usage_limit: number | null
        }
        Insert: {
          code: string
          code_normalized: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          discount_type: string
          discount_value: number
          expires_at?: string | null
          id?: string
          max_discount?: number | null
          min_amount?: number | null
          per_customer_limit?: number | null
          restore_on_refund?: boolean
          service_ids?: string[] | null
          starts_at?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
          usage_limit?: number | null
        }
        Update: {
          code?: string
          code_normalized?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          discount_type?: string
          discount_value?: number
          expires_at?: string | null
          id?: string
          max_discount?: number | null
          min_amount?: number | null
          per_customer_limit?: number | null
          restore_on_refund?: boolean
          service_ids?: string[] | null
          starts_at?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
          usage_limit?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "coupons_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_documents: {
        Row: {
          button_label: string
          created_at: string
          created_by: string | null
          customer_id: string
          drive_file_id: string
          file_name: string
          id: string
          mime: string
          sha256: string
          size_bytes: number
          tenant_id: string
          title: string
          updated_at: string
          visible_in_portal: boolean
        }
        Insert: {
          button_label: string
          created_at?: string
          created_by?: string | null
          customer_id: string
          drive_file_id: string
          file_name: string
          id?: string
          mime: string
          sha256: string
          size_bytes?: number
          tenant_id: string
          title: string
          updated_at?: string
          visible_in_portal?: boolean
        }
        Update: {
          button_label?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string
          drive_file_id?: string
          file_name?: string
          id?: string
          mime?: string
          sha256?: string
          size_bytes?: number
          tenant_id?: string
          title?: string
          updated_at?: string
          visible_in_portal?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "customer_documents_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_documents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_portal_sessions: {
        Row: {
          created_at: string
          customer_id: string
          expires_at: string
          id: string
          ip_address: string | null
          tenant_id: string
          token_hash: string
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          customer_id: string
          expires_at: string
          id?: string
          ip_address?: string | null
          tenant_id: string
          token_hash: string
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          customer_id?: string
          expires_at?: string
          id?: string
          ip_address?: string | null
          tenant_id?: string
          token_hash?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_portal_sessions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_portal_sessions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          address_number: string | null
          city: string | null
          complement: string | null
          created_at: string
          created_by: string | null
          data_status: string
          data_submitted_at: string | null
          district: string | null
          document: string | null
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          provider_customer_id: string | null
          state: string | null
          status: Database["public"]["Enums"]["customer_status"]
          tenant_id: string
          trade_name: string | null
          type: Database["public"]["Enums"]["customer_type"]
          updated_at: string
          whatsapp: string | null
          zip_code: string | null
        }
        Insert: {
          address?: string | null
          address_number?: string | null
          city?: string | null
          complement?: string | null
          created_at?: string
          created_by?: string | null
          data_status?: string
          data_submitted_at?: string | null
          district?: string | null
          document?: string | null
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          provider_customer_id?: string | null
          state?: string | null
          status?: Database["public"]["Enums"]["customer_status"]
          tenant_id: string
          trade_name?: string | null
          type?: Database["public"]["Enums"]["customer_type"]
          updated_at?: string
          whatsapp?: string | null
          zip_code?: string | null
        }
        Update: {
          address?: string | null
          address_number?: string | null
          city?: string | null
          complement?: string | null
          created_at?: string
          created_by?: string | null
          data_status?: string
          data_submitted_at?: string | null
          district?: string | null
          document?: string | null
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          provider_customer_id?: string | null
          state?: string | null
          status?: Database["public"]["Enums"]["customer_status"]
          tenant_id?: string
          trade_name?: string | null
          type?: Database["public"]["Enums"]["customer_type"]
          updated_at?: string
          whatsapp?: string | null
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          content_hash: string | null
          contract_id: string | null
          created_at: string
          customer_id: string | null
          drive_file_id: string | null
          drive_url: string | null
          id: string
          kind: string
          name: string
          tenant_id: string
        }
        Insert: {
          content_hash?: string | null
          contract_id?: string | null
          created_at?: string
          customer_id?: string | null
          drive_file_id?: string | null
          drive_url?: string | null
          id?: string
          kind?: string
          name: string
          tenant_id: string
        }
        Update: {
          content_hash?: string | null
          contract_id?: string | null
          created_at?: string
          customer_id?: string | null
          drive_file_id?: string | null
          drive_url?: string | null
          id?: string
          kind?: string
          name?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      dunning_charge_plans: {
        Row: {
          charge_group_id: string
          plan_code: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          charge_group_id: string
          plan_code: string
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          charge_group_id?: string
          plan_code?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dunning_charge_plans_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      dunning_charges: {
        Row: {
          channels: string[]
          created_at: string
          estimated_cost: number | null
          id: string
          payment_id: string
          plan_code: string
          plan_id: string | null
          price: number
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          channels: string[]
          created_at?: string
          estimated_cost?: number | null
          id?: string
          payment_id: string
          plan_code: string
          plan_id?: string | null
          price: number
          status: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          channels?: string[]
          created_at?: string
          estimated_cost?: number | null
          id?: string
          payment_id?: string
          plan_code?: string
          plan_id?: string | null
          price?: number
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dunning_charges_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: true
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dunning_charges_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "dunning_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dunning_charges_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      dunning_events: {
        Row: {
          channel: string | null
          created_at: string
          detail: string | null
          event: string
          id: string
          payment_id: string | null
          tenant_id: string
        }
        Insert: {
          channel?: string | null
          created_at?: string
          detail?: string | null
          event: string
          id?: string
          payment_id?: string | null
          tenant_id: string
        }
        Update: {
          channel?: string | null
          created_at?: string
          detail?: string | null
          event?: string
          id?: string
          payment_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dunning_events_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dunning_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      dunning_overrides: {
        Row: {
          contract_id: string | null
          created_at: string
          customer_id: string | null
          disabled: boolean
          id: string
          tenant_id: string
        }
        Insert: {
          contract_id?: string | null
          created_at?: string
          customer_id?: string | null
          disabled?: boolean
          id?: string
          tenant_id: string
        }
        Update: {
          contract_id?: string | null
          created_at?: string
          customer_id?: string | null
          disabled?: boolean
          id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dunning_overrides_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dunning_overrides_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dunning_overrides_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      dunning_plans: {
        Row: {
          active: boolean
          channels: string[]
          code: string
          created_at: string
          id: string
          price: number
          version: number
        }
        Insert: {
          active?: boolean
          channels: string[]
          code: string
          created_at?: string
          id?: string
          price: number
          version?: number
        }
        Update: {
          active?: boolean
          channels?: string[]
          code?: string
          created_at?: string
          id?: string
          price?: number
          version?: number
        }
        Relationships: []
      }
      dunning_settings: {
        Row: {
          alert_balance: number
          cost_email: number | null
          cost_sms: number | null
          cost_voice: number | null
          cost_whatsapp: number | null
          critical_balance: number
          id: boolean
          min_margin_pct: number
          recommended_balance: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          alert_balance?: number
          cost_email?: number | null
          cost_sms?: number | null
          cost_voice?: number | null
          cost_whatsapp?: number | null
          critical_balance?: number
          id?: boolean
          min_margin_pct?: number
          recommended_balance?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          alert_balance?: number
          cost_email?: number | null
          cost_sms?: number | null
          cost_voice?: number | null
          cost_whatsapp?: number | null
          critical_balance?: number
          id?: boolean
          min_margin_pct?: number
          recommended_balance?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      dunning_tenant_config: {
        Row: {
          created_at: string
          enabled: boolean
          paused: boolean
          plan_code: string
          steps: Json
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          paused?: boolean
          plan_code?: string
          steps?: Json
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          paused?: boolean
          plan_code?: string
          steps?: Json
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dunning_tenant_config_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      email_outbox: {
        Row: {
          created_at: string
          dedupe_key: string
          error_message: string | null
          id: string
          kind: string
          provider_id: string | null
          recipient_masked: string | null
          sent_at: string | null
          status: string
          tenant_id: string | null
        }
        Insert: {
          created_at?: string
          dedupe_key: string
          error_message?: string | null
          id?: string
          kind: string
          provider_id?: string | null
          recipient_masked?: string | null
          sent_at?: string | null
          status?: string
          tenant_id?: string | null
        }
        Update: {
          created_at?: string
          dedupe_key?: string
          error_message?: string | null
          id?: string
          kind?: string
          provider_id?: string | null
          recipient_masked?: string | null
          sent_at?: string | null
          status?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_outbox_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      embed_sessions: {
        Row: {
          created_at: string
          customer_id: string | null
          expires_at: string
          id: string
          kind: string
          revoked_at: string | null
          session_hash: string
          tenant_id: string
          ticket_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          customer_id?: string | null
          expires_at: string
          id?: string
          kind: string
          revoked_at?: string | null
          session_hash: string
          tenant_id: string
          ticket_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          customer_id?: string | null
          expires_at?: string
          id?: string
          kind?: string
          revoked_at?: string | null
          session_hash?: string
          tenant_id?: string
          ticket_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "embed_sessions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "embed_sessions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "embed_sessions_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "embed_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      embed_tickets: {
        Row: {
          client_id: string
          created_at: string
          customer_id: string | null
          expires_at: string
          id: string
          kind: string
          tenant_id: string
          theme: string
          ticket_hash: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          customer_id?: string | null
          expires_at: string
          id?: string
          kind: string
          tenant_id: string
          theme?: string
          ticket_hash: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          customer_id?: string | null
          expires_at?: string
          id?: string
          kind?: string
          tenant_id?: string
          theme?: string
          ticket_hash?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "embed_tickets_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "embed_tickets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_change_log: {
        Row: {
          changed_by: string | null
          created_at: string
          id: string
          installment_max: number | null
          installment_min: number | null
          kind: string
          next: Json
          payment_method: string | null
          previous: Json | null
          reason: string | null
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          id?: string
          installment_max?: number | null
          installment_min?: number | null
          kind: string
          next: Json
          payment_method?: string | null
          previous?: Json | null
          reason?: string | null
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          id?: string
          installment_max?: number | null
          installment_min?: number | null
          kind?: string
          next?: Json
          payment_method?: string | null
          previous?: Json | null
          reason?: string | null
        }
        Relationships: []
      }
      finance_accounts: {
        Row: {
          archived: boolean
          created_at: string
          created_by: string | null
          id: string
          institution_code: string
          kind: string
          name: string
          opening_balance: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          archived?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          institution_code?: string
          kind?: string
          name: string
          opening_balance?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          archived?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          institution_code?: string
          kind?: string
          name?: string
          opening_balance?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_accounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_card_installments: {
        Row: {
          amount: number
          id: string
          invoice_id: string
          number: number
          purchase_id: string
          tenant_id: string
        }
        Insert: {
          amount: number
          id?: string
          invoice_id: string
          number: number
          purchase_id: string
          tenant_id: string
        }
        Update: {
          amount?: number
          id?: string
          invoice_id?: string
          number?: number
          purchase_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_card_installments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "finance_card_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_card_installments_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "finance_card_purchases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_card_installments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_card_invoices: {
        Row: {
          card_id: string
          closing_on: string
          created_at: string
          due_on: string
          id: string
          paid_amount: number | null
          paid_at: string | null
          payment_entry_id: string | null
          reference_month: string
          tenant_id: string
        }
        Insert: {
          card_id: string
          closing_on: string
          created_at?: string
          due_on: string
          id?: string
          paid_amount?: number | null
          paid_at?: string | null
          payment_entry_id?: string | null
          reference_month: string
          tenant_id: string
        }
        Update: {
          card_id?: string
          closing_on?: string
          created_at?: string
          due_on?: string
          id?: string
          paid_amount?: number | null
          paid_at?: string | null
          payment_entry_id?: string | null
          reference_month?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_card_invoices_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "finance_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_card_invoices_payment_entry_id_fkey"
            columns: ["payment_entry_id"]
            isOneToOne: false
            referencedRelation: "finance_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_card_invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_card_purchases: {
        Row: {
          amount: number
          card_id: string
          category_id: string | null
          created_at: string
          created_by: string | null
          description: string
          id: string
          idempotency_key: string
          installments: number
          purchased_on: string
          status: string
          tenant_id: string
        }
        Insert: {
          amount: number
          card_id: string
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          description: string
          id?: string
          idempotency_key: string
          installments?: number
          purchased_on: string
          status?: string
          tenant_id: string
        }
        Update: {
          amount?: number
          card_id?: string
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          idempotency_key?: string
          installments?: number
          purchased_on?: string
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_card_purchases_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "finance_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_card_purchases_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "finance_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_card_purchases_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_cards: {
        Row: {
          brand: string
          closing_day: number
          color: string
          created_at: string
          created_by: string | null
          credit_limit: number
          due_day: number
          id: string
          last4: string
          name: string
          pay_account_id: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          brand: string
          closing_day: number
          color?: string
          created_at?: string
          created_by?: string | null
          credit_limit: number
          due_day: number
          id?: string
          last4: string
          name: string
          pay_account_id?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          brand?: string
          closing_day?: number
          color?: string
          created_at?: string
          created_by?: string | null
          credit_limit?: number
          due_day?: number
          id?: string
          last4?: string
          name?: string
          pay_account_id?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_cards_pay_account_id_fkey"
            columns: ["pay_account_id"]
            isOneToOne: false
            referencedRelation: "finance_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_cards_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_categories: {
        Row: {
          archived: boolean
          created_at: string
          direction: string
          id: string
          is_default: boolean
          level: number
          name: string
          parent_id: string | null
          tenant_id: string | null
        }
        Insert: {
          archived?: boolean
          created_at?: string
          direction: string
          id?: string
          is_default?: boolean
          level?: number
          name: string
          parent_id?: string | null
          tenant_id?: string | null
        }
        Update: {
          archived?: boolean
          created_at?: string
          direction?: string
          id?: string
          is_default?: boolean
          level?: number
          name?: string
          parent_id?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "finance_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "finance_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_categories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_entries: {
        Row: {
          account_id: string | null
          amount: number
          cancelled_at: string | null
          card_invoice_id: string | null
          category_id: string | null
          competence_on: string | null
          cost_center: string | null
          created_at: string
          created_by: string | null
          description: string
          direction: string
          due_on: string
          group_id: string | null
          group_index: number | null
          group_kind: string | null
          group_total: number | null
          id: string
          notes: string | null
          paid_on: string | null
          reversed_at: string | null
          status: string
          tenant_id: string
          transfer_id: string | null
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          amount: number
          cancelled_at?: string | null
          card_invoice_id?: string | null
          category_id?: string | null
          competence_on?: string | null
          cost_center?: string | null
          created_at?: string
          created_by?: string | null
          description: string
          direction: string
          due_on?: string
          group_id?: string | null
          group_index?: number | null
          group_kind?: string | null
          group_total?: number | null
          id?: string
          notes?: string | null
          paid_on?: string | null
          reversed_at?: string | null
          status?: string
          tenant_id: string
          transfer_id?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          amount?: number
          cancelled_at?: string | null
          card_invoice_id?: string | null
          category_id?: string | null
          competence_on?: string | null
          cost_center?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          direction?: string
          due_on?: string
          group_id?: string | null
          group_index?: number | null
          group_kind?: string | null
          group_total?: number | null
          id?: string
          notes?: string | null
          paid_on?: string | null
          reversed_at?: string | null
          status?: string
          tenant_id?: string
          transfer_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_entries_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "finance_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_entries_card_invoice_fk"
            columns: ["card_invoice_id"]
            isOneToOne: false
            referencedRelation: "finance_card_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_entries_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "finance_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_entries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_credentials: {
        Row: {
          created_at: string
          failed_attempts: number
          last_used_at: string | null
          locked_until: string | null
          password_hash: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          failed_attempts?: number
          last_used_at?: string | null
          locked_until?: string | null
          password_hash: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          failed_attempts?: number
          last_used_at?: string | null
          locked_until?: string | null
          password_hash?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      fiscal_services: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          iss: number | null
          municipal_service_code: string | null
          municipal_service_id: string | null
          municipal_service_name: string | null
          name: string
          retain_iss: boolean
          service_id: string | null
          taxes: Json
          tenant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          iss?: number | null
          municipal_service_code?: string | null
          municipal_service_id?: string | null
          municipal_service_name?: string | null
          name: string
          retain_iss?: boolean
          service_id?: string | null
          taxes?: Json
          tenant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          iss?: number | null
          municipal_service_code?: string | null
          municipal_service_id?: string | null
          municipal_service_name?: string | null
          name?: string
          retain_iss?: boolean
          service_id?: string | null
          taxes?: Json
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fiscal_services_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_services_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      fiscal_settings: {
        Row: {
          auto_issue: boolean
          auto_issue_days: number | null
          auto_issue_rule: string
          cnae: string | null
          config_status: string
          created_at: string
          credentials_configured: boolean
          cultural_projects_promoter: boolean
          default_fiscal_service_id: string | null
          default_observations: string | null
          email: string | null
          invoice_webhook_id: string | null
          last_synced_at: string | null
          lote_number: number | null
          missing: Json
          municipal_inscription: string | null
          municipal_options: Json
          national_portal_tax_calculation_regime: string | null
          nbs_code: string | null
          portal: string
          production_confirmed_at: string | null
          rps_number: number | null
          rps_serie: string | null
          service_list_item: string | null
          simples_nacional: boolean | null
          special_tax_regime: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          auto_issue?: boolean
          auto_issue_days?: number | null
          auto_issue_rule?: string
          cnae?: string | null
          config_status?: string
          created_at?: string
          credentials_configured?: boolean
          cultural_projects_promoter?: boolean
          default_fiscal_service_id?: string | null
          default_observations?: string | null
          email?: string | null
          invoice_webhook_id?: string | null
          last_synced_at?: string | null
          lote_number?: number | null
          missing?: Json
          municipal_inscription?: string | null
          municipal_options?: Json
          national_portal_tax_calculation_regime?: string | null
          nbs_code?: string | null
          portal?: string
          production_confirmed_at?: string | null
          rps_number?: number | null
          rps_serie?: string | null
          service_list_item?: string | null
          simples_nacional?: boolean | null
          special_tax_regime?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          auto_issue?: boolean
          auto_issue_days?: number | null
          auto_issue_rule?: string
          cnae?: string | null
          config_status?: string
          created_at?: string
          credentials_configured?: boolean
          cultural_projects_promoter?: boolean
          default_fiscal_service_id?: string | null
          default_observations?: string | null
          email?: string | null
          invoice_webhook_id?: string | null
          last_synced_at?: string | null
          lote_number?: number | null
          missing?: Json
          municipal_inscription?: string | null
          municipal_options?: Json
          national_portal_tax_calculation_regime?: string | null
          nbs_code?: string | null
          portal?: string
          production_confirmed_at?: string | null
          rps_number?: number | null
          rps_serie?: string | null
          service_list_item?: string | null
          simples_nacional?: boolean | null
          special_tax_regime?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fiscal_settings_default_service_fk"
            columns: ["default_fiscal_service_id"]
            isOneToOne: false
            referencedRelation: "fiscal_services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      google_drive_connections: {
        Row: {
          connected_by: string | null
          created_at: string
          google_email: string | null
          id: string
          refresh_token_ciphertext: string | null
          root_folder_id: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          connected_by?: string | null
          created_at?: string
          google_email?: string | null
          id?: string
          refresh_token_ciphertext?: string | null
          root_folder_id?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          connected_by?: string | null
          created_at?: string
          google_email?: string | null
          id?: string
          refresh_token_ciphertext?: string | null
          root_folder_id?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "google_drive_connections_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_audit_log: {
        Row: {
          action: string
          created_at: string
          details: Json
          id: string
          ip: string | null
          outcome: string
          tenant_id: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json
          id?: string
          ip?: string | null
          outcome?: string
          tenant_id?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json
          id?: string
          ip?: string | null
          outcome?: string
          tenant_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "integration_audit_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_idempotency: {
        Row: {
          created_at: string
          key: string
          operation: string
          result: Json | null
          tenant_id: string
        }
        Insert: {
          created_at?: string
          key: string
          operation: string
          result?: Json | null
          tenant_id: string
        }
        Update: {
          created_at?: string
          key?: string
          operation?: string
          result?: Json | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_idempotency_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_events: {
        Row: {
          actor_id: string | null
          created_at: string
          event_type: string
          id: string
          invoice_id: string
          message: string | null
          provider_event_id: string | null
          status: string | null
          tenant_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          invoice_id: string
          message?: string | null
          provider_event_id?: string | null
          status?: string | null
          tenant_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          invoice_id?: string
          message?: string | null
          provider_event_id?: string | null
          status?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_events_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          authorized_at: string | null
          canceled_at: string | null
          charge_group_id: string | null
          created_at: string
          customer_id: string | null
          deductions: number
          effective_date: string
          environment: string
          error_message: string | null
          fee_amount: number | null
          fee_charged_at: string | null
          fee_transfer_id: string | null
          fiscal_service_id: string | null
          id: string
          last_provider_event_id: string | null
          municipal_service_code: string | null
          municipal_service_name: string | null
          number: string | null
          observations: string | null
          origin: string
          payment_id: string | null
          pdf_url: string | null
          provider: string
          provider_fee_amount: number | null
          provider_invoice_id: string | null
          requested_by: string | null
          service_description: string
          service_id: string | null
          status: string
          tenant_id: string
          updated_at: string
          validation_code: string | null
          value: number
          wiize_fee_amount: number | null
          xml_url: string | null
        }
        Insert: {
          authorized_at?: string | null
          canceled_at?: string | null
          charge_group_id?: string | null
          created_at?: string
          customer_id?: string | null
          deductions?: number
          effective_date: string
          environment?: string
          error_message?: string | null
          fee_amount?: number | null
          fee_charged_at?: string | null
          fee_transfer_id?: string | null
          fiscal_service_id?: string | null
          id?: string
          last_provider_event_id?: string | null
          municipal_service_code?: string | null
          municipal_service_name?: string | null
          number?: string | null
          observations?: string | null
          origin: string
          payment_id?: string | null
          pdf_url?: string | null
          provider?: string
          provider_fee_amount?: number | null
          provider_invoice_id?: string | null
          requested_by?: string | null
          service_description: string
          service_id?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
          validation_code?: string | null
          value: number
          wiize_fee_amount?: number | null
          xml_url?: string | null
        }
        Update: {
          authorized_at?: string | null
          canceled_at?: string | null
          charge_group_id?: string | null
          created_at?: string
          customer_id?: string | null
          deductions?: number
          effective_date?: string
          environment?: string
          error_message?: string | null
          fee_amount?: number | null
          fee_charged_at?: string | null
          fee_transfer_id?: string | null
          fiscal_service_id?: string | null
          id?: string
          last_provider_event_id?: string | null
          municipal_service_code?: string | null
          municipal_service_name?: string | null
          number?: string | null
          observations?: string | null
          origin?: string
          payment_id?: string | null
          pdf_url?: string | null
          provider?: string
          provider_fee_amount?: number | null
          provider_invoice_id?: string | null
          requested_by?: string | null
          service_description?: string
          service_id?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
          validation_code?: string | null
          value?: number
          wiize_fee_amount?: number | null
          xml_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_fiscal_service_id_fkey"
            columns: ["fiscal_service_id"]
            isOneToOne: false
            referencedRelation: "fiscal_services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      limit_increase_requests: {
        Row: {
          created_at: string
          current_daily_limit: number
          expected_response_on: string | null
          id: string
          reason: string
          requested_by: string
          requested_daily_limit: number
          requested_monthly_count: number | null
          review_message: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_daily_limit: number
          expected_response_on?: string | null
          id?: string
          reason: string
          requested_by: string
          requested_daily_limit: number
          requested_monthly_count?: number | null
          review_message?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_daily_limit?: number
          expected_response_on?: string | null
          id?: string
          reason?: string
          requested_by?: string
          requested_daily_limit?: number
          requested_monthly_count?: number | null
          review_message?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "limit_increase_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      mfa_recovery_codes: {
        Row: {
          code_hash: string
          created_at: string
          id: string
          single_issued_at: string | null
          used_at: string | null
          user_id: string
        }
        Insert: {
          code_hash: string
          created_at?: string
          id?: string
          single_issued_at?: string | null
          used_at?: string | null
          user_id: string
        }
        Update: {
          code_hash?: string
          created_at?: string
          id?: string
          single_issued_at?: string | null
          used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      mfa_recovery_requests: {
        Row: {
          created_at: string
          id: string
          reason: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          reason?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          reason?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          kind: string
          link: string | null
          read_at: string | null
          tenant_id: string
          title: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          kind: string
          link?: string | null
          read_at?: string | null
          tenant_id: string
          title: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          kind?: string
          link?: string | null
          read_at?: string | null
          tenant_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      oauth_authorization_codes: {
        Row: {
          client_id: string
          code_challenge: string
          code_hash: string
          created_at: string
          expires_at: string
          id: string
          redirect_uri: string
          scopes: string[]
          tenant_id: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          client_id: string
          code_challenge: string
          code_hash: string
          created_at?: string
          expires_at: string
          id?: string
          redirect_uri: string
          scopes?: string[]
          tenant_id: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          client_id?: string
          code_challenge?: string
          code_hash?: string
          created_at?: string
          expires_at?: string
          id?: string
          redirect_uri?: string
          scopes?: string[]
          tenant_id?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "oauth_authorization_codes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "oauth_clients"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "oauth_authorization_codes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      oauth_clients: {
        Row: {
          active: boolean
          allowed_scopes: string[]
          client_id: string
          client_secret_hash: string
          created_at: string
          id: string
          name: string
          previous_secret_expires_at: string | null
          previous_secret_hash: string | null
          redirect_uris: string[]
          updated_at: string
          webhook_secret_enc: string | null
        }
        Insert: {
          active?: boolean
          allowed_scopes?: string[]
          client_id: string
          client_secret_hash: string
          created_at?: string
          id?: string
          name: string
          previous_secret_expires_at?: string | null
          previous_secret_hash?: string | null
          redirect_uris?: string[]
          updated_at?: string
          webhook_secret_enc?: string | null
        }
        Update: {
          active?: boolean
          allowed_scopes?: string[]
          client_id?: string
          client_secret_hash?: string
          created_at?: string
          id?: string
          name?: string
          previous_secret_expires_at?: string | null
          previous_secret_hash?: string | null
          redirect_uris?: string[]
          updated_at?: string
          webhook_secret_enc?: string | null
        }
        Relationships: []
      }
      oauth_tokens: {
        Row: {
          access_expires_at: string
          access_token_hash: string
          client_id: string
          code_id: string | null
          created_at: string
          family_id: string
          id: string
          refresh_expires_at: string | null
          refresh_token_hash: string | null
          revoked_at: string | null
          rotated_from: string | null
          scopes: string[]
          tenant_id: string
          user_id: string
        }
        Insert: {
          access_expires_at: string
          access_token_hash: string
          client_id: string
          code_id?: string | null
          created_at?: string
          family_id: string
          id?: string
          refresh_expires_at?: string | null
          refresh_token_hash?: string | null
          revoked_at?: string | null
          rotated_from?: string | null
          scopes?: string[]
          tenant_id: string
          user_id: string
        }
        Update: {
          access_expires_at?: string
          access_token_hash?: string
          client_id?: string
          code_id?: string | null
          created_at?: string
          family_id?: string
          id?: string
          refresh_expires_at?: string | null
          refresh_token_hash?: string | null
          revoked_at?: string | null
          rotated_from?: string | null
          scopes?: string[]
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "oauth_tokens_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "oauth_clients"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "oauth_tokens_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_activations: {
        Row: {
          consents: Json
          created_at: string
          form_data: Json
          form_enc: string | null
          person_type: string | null
          provider_onboarding: Json
          provider_synced_at: string | null
          review_message: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["activation_status"]
          submitted_at: string | null
          submitted_by: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          consents?: Json
          created_at?: string
          form_data?: Json
          form_enc?: string | null
          person_type?: string | null
          provider_onboarding?: Json
          provider_synced_at?: string | null
          review_message?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["activation_status"]
          submitted_at?: string | null
          submitted_by?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          consents?: Json
          created_at?: string
          form_data?: Json
          form_enc?: string | null
          person_type?: string | null
          provider_onboarding?: Json
          provider_synced_at?: string | null
          review_message?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["activation_status"]
          submitted_at?: string | null
          submitted_by?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_activations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_attempts: {
        Row: {
          actor: string
          actor_user_id: string | null
          amount: number
          attempt_number: number
          bank_slip_url: string | null
          created_at: string
          due_on: string | null
          error_message: string | null
          fine_amount: number
          id: string
          idempotency_key: string
          interest_amount: number
          invoice_url: string | null
          method: Database["public"]["Enums"]["payment_method"] | null
          payment_id: string
          provider_payment_id: string | null
          reason: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          actor?: string
          actor_user_id?: string | null
          amount: number
          attempt_number: number
          bank_slip_url?: string | null
          created_at?: string
          due_on?: string | null
          error_message?: string | null
          fine_amount?: number
          id?: string
          idempotency_key: string
          interest_amount?: number
          invoice_url?: string | null
          method?: Database["public"]["Enums"]["payment_method"] | null
          payment_id: string
          provider_payment_id?: string | null
          reason?: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          actor?: string
          actor_user_id?: string | null
          amount?: number
          attempt_number?: number
          bank_slip_url?: string | null
          created_at?: string
          due_on?: string | null
          error_message?: string | null
          fine_amount?: number
          id?: string
          idempotency_key?: string
          interest_amount?: number
          invoice_url?: string | null
          method?: Database["public"]["Enums"]["payment_method"] | null
          payment_id?: string
          provider_payment_id?: string | null
          reason?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_attempts_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_attempts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_coproduction_participants: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          accepted_snapshot: Json | null
          coproduction_id: string
          created_at: string
          email: string
          fixed_amount: number | null
          id: string
          name: string
          participant_tenant_id: string
          participant_user_id: string
          participation_type: string
          percentage: number
          rejected_at: string | null
          responsibility: string | null
          status: string
          tenant_id: string
          updated_at: string
          wallet_id: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          accepted_snapshot?: Json | null
          coproduction_id: string
          created_at?: string
          email: string
          fixed_amount?: number | null
          id?: string
          name: string
          participant_tenant_id: string
          participant_user_id: string
          participation_type: string
          percentage: number
          rejected_at?: string | null
          responsibility?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
          wallet_id: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          accepted_snapshot?: Json | null
          coproduction_id?: string
          created_at?: string
          email?: string
          fixed_amount?: number | null
          id?: string
          name?: string
          participant_tenant_id?: string
          participant_user_id?: string
          participation_type?: string
          percentage?: number
          rejected_at?: string | null
          responsibility?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_coproduction_participants_coproduction_id_fkey"
            columns: ["coproduction_id"]
            isOneToOne: false
            referencedRelation: "payment_coproductions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_coproduction_participants_participant_tenant_id_fkey"
            columns: ["participant_tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_coproduction_participants_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_coproductions: {
        Row: {
          activated_at: string | null
          cancelled_at: string | null
          charge_group_id: string
          created_at: string
          created_by: string
          id: string
          split_applied_at: string | null
          split_error: string | null
          status: string
          tenant_id: string
          updated_at: string
          version: number
        }
        Insert: {
          activated_at?: string | null
          cancelled_at?: string | null
          charge_group_id: string
          created_at?: string
          created_by: string
          id?: string
          split_applied_at?: string | null
          split_error?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          activated_at?: string | null
          cancelled_at?: string | null
          charge_group_id?: string
          created_at?: string
          created_by?: string
          id?: string
          split_applied_at?: string | null
          split_error?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "payment_coproductions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_fee_settings: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          effective_from: string
          effective_until: string | null
          fixed_fee: number
          id: string
          installment_max: number
          installment_min: number
          payment_method: string
          percentage_fee: number
          public_visible: boolean
          updated_at: string
          version: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_until?: string | null
          fixed_fee?: number
          id?: string
          installment_max?: number
          installment_min?: number
          payment_method: string
          percentage_fee?: number
          public_visible?: boolean
          updated_at?: string
          version?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_until?: string | null
          fixed_fee?: number
          id?: string
          installment_max?: number
          installment_min?: number
          payment_method?: string
          percentage_fee?: number
          public_visible?: boolean
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      payment_links: {
        Row: {
          charge_group_id: string | null
          collect_customer_data: boolean
          contract_id: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          expires_at: string | null
          id: string
          max_uses: number | null
          revoked_at: string | null
          service_id: string | null
          slug: string
          tenant_id: string
          token_ciphertext: string | null
          token_hash: string
          uses: number
        }
        Insert: {
          charge_group_id?: string | null
          collect_customer_data?: boolean
          contract_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          expires_at?: string | null
          id?: string
          max_uses?: number | null
          revoked_at?: string | null
          service_id?: string | null
          slug: string
          tenant_id: string
          token_ciphertext?: string | null
          token_hash: string
          uses?: number
        }
        Update: {
          charge_group_id?: string | null
          collect_customer_data?: boolean
          contract_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          expires_at?: string | null
          id?: string
          max_uses?: number | null
          revoked_at?: string | null
          service_id?: string | null
          slug?: string
          tenant_id?: string
          token_ciphertext?: string | null
          token_hash?: string
          uses?: number
        }
        Relationships: [
          {
            foreignKeyName: "payment_links_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_links_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_links_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_links_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          actual_available_at: string | null
          anticipated_at: string | null
          anticipation_status: string | null
          available_on: string | null
          bank_slip_url: string | null
          charge_group_id: string
          checkout_appearance_version_id: string | null
          confirmed_at: string | null
          contract_id: string | null
          created_at: string
          created_by: string | null
          current_attempt_id: string | null
          customer_id: string | null
          description: string | null
          due_on: string
          estimated_available_at: string | null
          estimated_provider_cost: number | null
          estimated_rule: string | null
          fee_calculated_at: string | null
          fee_configuration_id: string | null
          fee_fixed_amount: number
          fee_payer_share: number
          fee_percentage: number
          fee_percentage_amount: number
          fine_percent: number | null
          gross_amount: number
          gross_margin_amount: number
          id: string
          idempotency_key: string | null
          installment_count: number | null
          installment_number: number | null
          interest_percent: number | null
          invoice_url: string | null
          last_provider_event_at: string | null
          last_provider_event_id: string | null
          method: Database["public"]["Enums"]["payment_method"] | null
          net_amount: number
          original_amount: number | null
          original_due_on: string | null
          paid_at: string | null
          platform_fee_amount: number
          provider: string
          provider_cost_config_id: string | null
          provider_fee_amount: number
          provider_fee_covered_amount: number
          provider_fee_reimbursed_at: string | null
          provider_fee_reimbursement_id: string | null
          provider_installment_id: string | null
          provider_payment_id: string | null
          refund_reserved_pending: number
          refunded_amount: number
          released_at: string | null
          service_amount: number | null
          service_id: string | null
          settlement_status: string
          status: Database["public"]["Enums"]["payment_status"]
          subscription_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          actual_available_at?: string | null
          anticipated_at?: string | null
          anticipation_status?: string | null
          available_on?: string | null
          bank_slip_url?: string | null
          charge_group_id?: string
          checkout_appearance_version_id?: string | null
          confirmed_at?: string | null
          contract_id?: string | null
          created_at?: string
          created_by?: string | null
          current_attempt_id?: string | null
          customer_id?: string | null
          description?: string | null
          due_on: string
          estimated_available_at?: string | null
          estimated_provider_cost?: number | null
          estimated_rule?: string | null
          fee_calculated_at?: string | null
          fee_configuration_id?: string | null
          fee_fixed_amount?: number
          fee_payer_share?: number
          fee_percentage?: number
          fee_percentage_amount?: number
          fine_percent?: number | null
          gross_amount: number
          gross_margin_amount?: number
          id?: string
          idempotency_key?: string | null
          installment_count?: number | null
          installment_number?: number | null
          interest_percent?: number | null
          invoice_url?: string | null
          last_provider_event_at?: string | null
          last_provider_event_id?: string | null
          method?: Database["public"]["Enums"]["payment_method"] | null
          net_amount?: number
          original_amount?: number | null
          original_due_on?: string | null
          paid_at?: string | null
          platform_fee_amount?: number
          provider?: string
          provider_cost_config_id?: string | null
          provider_fee_amount?: number
          provider_fee_covered_amount?: number
          provider_fee_reimbursed_at?: string | null
          provider_fee_reimbursement_id?: string | null
          provider_installment_id?: string | null
          provider_payment_id?: string | null
          refund_reserved_pending?: number
          refunded_amount?: number
          released_at?: string | null
          service_amount?: number | null
          service_id?: string | null
          settlement_status?: string
          status?: Database["public"]["Enums"]["payment_status"]
          subscription_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          actual_available_at?: string | null
          anticipated_at?: string | null
          anticipation_status?: string | null
          available_on?: string | null
          bank_slip_url?: string | null
          charge_group_id?: string
          checkout_appearance_version_id?: string | null
          confirmed_at?: string | null
          contract_id?: string | null
          created_at?: string
          created_by?: string | null
          current_attempt_id?: string | null
          customer_id?: string | null
          description?: string | null
          due_on?: string
          estimated_available_at?: string | null
          estimated_provider_cost?: number | null
          estimated_rule?: string | null
          fee_calculated_at?: string | null
          fee_configuration_id?: string | null
          fee_fixed_amount?: number
          fee_payer_share?: number
          fee_percentage?: number
          fee_percentage_amount?: number
          fine_percent?: number | null
          gross_amount?: number
          gross_margin_amount?: number
          id?: string
          idempotency_key?: string | null
          installment_count?: number | null
          installment_number?: number | null
          interest_percent?: number | null
          invoice_url?: string | null
          last_provider_event_at?: string | null
          last_provider_event_id?: string | null
          method?: Database["public"]["Enums"]["payment_method"] | null
          net_amount?: number
          original_amount?: number | null
          original_due_on?: string | null
          paid_at?: string | null
          platform_fee_amount?: number
          provider?: string
          provider_cost_config_id?: string | null
          provider_fee_amount?: number
          provider_fee_covered_amount?: number
          provider_fee_reimbursed_at?: string | null
          provider_fee_reimbursement_id?: string | null
          provider_installment_id?: string | null
          provider_payment_id?: string | null
          refund_reserved_pending?: number
          refunded_amount?: number
          released_at?: string | null
          service_amount?: number | null
          service_id?: string | null
          settlement_status?: string
          status?: Database["public"]["Enums"]["payment_status"]
          subscription_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_checkout_appearance_version_id_fkey"
            columns: ["checkout_appearance_version_id"]
            isOneToOne: false
            referencedRelation: "checkout_appearance_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_current_attempt_id_fkey"
            columns: ["current_attempt_id"]
            isOneToOne: false
            referencedRelation: "payment_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_fee_configuration_id_fkey"
            columns: ["fee_configuration_id"]
            isOneToOne: false
            referencedRelation: "payment_fee_settings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_provider_cost_config_id_fkey"
            columns: ["provider_cost_config_id"]
            isOneToOne: false
            referencedRelation: "provider_cost_settings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      pix_automatic_authorizations: {
        Row: {
          created_at: string
          created_by: string | null
          customer_id: string | null
          frequency: Database["public"]["Enums"]["billing_frequency"]
          id: string
          last_checked_at: string | null
          link_expires_at: string | null
          link_token_hash: string | null
          provider_authorization_id: string | null
          qr_image: string | null
          qr_payload: string | null
          start_on: string
          status: string
          subscription_id: string | null
          tenant_id: string
          updated_at: string
          value: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          frequency?: Database["public"]["Enums"]["billing_frequency"]
          id?: string
          last_checked_at?: string | null
          link_expires_at?: string | null
          link_token_hash?: string | null
          provider_authorization_id?: string | null
          qr_image?: string | null
          qr_payload?: string | null
          start_on: string
          status?: string
          subscription_id?: string | null
          tenant_id: string
          updated_at?: string
          value: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          frequency?: Database["public"]["Enums"]["billing_frequency"]
          id?: string
          last_checked_at?: string | null
          link_expires_at?: string | null
          link_token_hash?: string | null
          provider_authorization_id?: string | null
          qr_image?: string | null
          qr_payload?: string | null
          start_on?: string
          status?: string
          subscription_id?: string | null
          tenant_id?: string
          updated_at?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "pix_automatic_authorizations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pix_automatic_authorizations_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pix_automatic_authorizations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          kind: string
          link: string | null
          read_at: string | null
          tenant_id: string | null
          title: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          kind: string
          link?: string | null
          read_at?: string | null
          tenant_id?: string | null
          title: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          kind?: string
          link?: string | null
          read_at?: string | null
          tenant_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_notifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_settings: {
        Row: {
          description: string | null
          key: string
          updated_at: string
          value: number
        }
        Insert: {
          description?: string | null
          key: string
          updated_at?: string
          value: number
        }
        Update: {
          description?: string | null
          key?: string
          updated_at?: string
          value?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          hide_values: boolean
          id: string
          phone: string | null
          theme: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          hide_values?: boolean
          id: string
          phone?: string | null
          theme?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          hide_values?: boolean
          id?: string
          phone?: string | null
          theme?: string
          updated_at?: string
        }
        Relationships: []
      }
      provider_connections: {
        Row: {
          account_status: string | null
          api_key_ciphertext: string | null
          bank_account_info_status: string | null
          capabilities: Json
          commercial_info_status: string | null
          created_at: string
          documentation_status: string | null
          environment: Database["public"]["Enums"]["provider_environment"]
          general_status: string | null
          id: string
          last_checked_at: string | null
          last_reconciled_at: string | null
          onboarding_status: string
          provider: string
          provider_account_id: string | null
          status: string
          subaccount_id: string | null
          tenant_id: string
          updated_at: string
          wallet_id: string | null
          webhook_id: string | null
          webhook_token_ciphertext: string | null
          webhook_token_hash: string | null
          webhook_url: string | null
        }
        Insert: {
          account_status?: string | null
          api_key_ciphertext?: string | null
          bank_account_info_status?: string | null
          capabilities?: Json
          commercial_info_status?: string | null
          created_at?: string
          documentation_status?: string | null
          environment?: Database["public"]["Enums"]["provider_environment"]
          general_status?: string | null
          id?: string
          last_checked_at?: string | null
          last_reconciled_at?: string | null
          onboarding_status?: string
          provider?: string
          provider_account_id?: string | null
          status?: string
          subaccount_id?: string | null
          tenant_id: string
          updated_at?: string
          wallet_id?: string | null
          webhook_id?: string | null
          webhook_token_ciphertext?: string | null
          webhook_token_hash?: string | null
          webhook_url?: string | null
        }
        Update: {
          account_status?: string | null
          api_key_ciphertext?: string | null
          bank_account_info_status?: string | null
          capabilities?: Json
          commercial_info_status?: string | null
          created_at?: string
          documentation_status?: string | null
          environment?: Database["public"]["Enums"]["provider_environment"]
          general_status?: string | null
          id?: string
          last_checked_at?: string | null
          last_reconciled_at?: string | null
          onboarding_status?: string
          provider?: string
          provider_account_id?: string | null
          status?: string
          subaccount_id?: string | null
          tenant_id?: string
          updated_at?: string
          wallet_id?: string | null
          webhook_id?: string | null
          webhook_token_ciphertext?: string | null
          webhook_token_hash?: string | null
          webhook_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "provider_connections_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_cost_settings: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          effective_from: string
          effective_until: string | null
          fixed_cost: number
          id: string
          installment_max: number
          installment_min: number
          payment_method: string
          percentage_cost: number
          provider: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_until?: string | null
          fixed_cost?: number
          id?: string
          installment_max?: number
          installment_min?: number
          payment_method: string
          percentage_cost?: number
          provider?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_until?: string | null
          fixed_cost?: number
          id?: string
          installment_max?: number
          installment_min?: number
          payment_method?: string
          percentage_cost?: number
          provider?: string
          updated_at?: string
        }
        Relationships: []
      }
      rate_limits: {
        Row: {
          attempts: number
          blocked_until: string | null
          id: string
          identifier: string
          scope: string
          window_started_at: string
        }
        Insert: {
          attempts?: number
          blocked_until?: string | null
          id?: string
          identifier: string
          scope: string
          window_started_at?: string
        }
        Update: {
          attempts?: number
          blocked_until?: string | null
          id?: string
          identifier?: string
          scope?: string
          window_started_at?: string
        }
        Relationships: []
      }
      reconciliation_issues: {
        Row: {
          actual: number | null
          created_at: string
          details: Json
          expected: number | null
          id: string
          kind: string
          payment_id: string | null
          resolved_at: string | null
          tenant_id: string
        }
        Insert: {
          actual?: number | null
          created_at?: string
          details?: Json
          expected?: number | null
          id?: string
          kind: string
          payment_id?: string | null
          resolved_at?: string | null
          tenant_id: string
        }
        Update: {
          actual?: number | null
          created_at?: string
          details?: Json
          expected?: number | null
          id?: string
          kind?: string
          payment_id?: string | null
          resolved_at?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reconciliation_issues_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_issues_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      reconciliation_reports: {
        Row: {
          created_at: string
          id: string
          period_end: string
          period_start: string
          report: Json
          requested_by: string
          statement_name: string | null
          status: string
          summary: string | null
          tenant_id: string
          total_difference: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          period_end: string
          period_start: string
          report?: Json
          requested_by: string
          statement_name?: string | null
          status?: string
          summary?: string | null
          tenant_id: string
          total_difference?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          period_end?: string
          period_start?: string
          report?: Json
          requested_by?: string
          statement_name?: string | null
          status?: string
          summary?: string | null
          tenant_id?: string
          total_difference?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "reconciliation_reports_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      refund_policies: {
        Row: {
          allow_partial: boolean
          default_deduction_type: string
          default_deduction_value: number
          default_mode: string
          tenant_id: string
          updated_at: string
          window_days: number
        }
        Insert: {
          allow_partial?: boolean
          default_deduction_type?: string
          default_deduction_value?: number
          default_mode?: string
          tenant_id: string
          updated_at?: string
          window_days?: number
        }
        Update: {
          allow_partial?: boolean
          default_deduction_type?: string
          default_deduction_value?: number
          default_mode?: string
          tenant_id?: string
          updated_at?: string
          window_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "refund_policies_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      refunds: {
        Row: {
          completed_at: string | null
          created_at: string
          deduction_amount: number
          deduction_reason: string | null
          deduction_type: string
          deduction_value: number
          eligible_amount: number
          failure_reason: string | null
          from_available: number
          from_pending: number
          id: string
          idempotency_key: string
          kind: string
          last_provider_event_id: string | null
          mode: string
          original_amount: number
          payment_id: string
          processed_at: string | null
          provider_status: string | null
          reason: string
          refund_amount: number
          requested_amount: number
          requested_by: string
          status: string
          tenant_id: string
          updated_at: string
          wiize_fee_retained: number
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          deduction_amount?: number
          deduction_reason?: string | null
          deduction_type?: string
          deduction_value?: number
          eligible_amount: number
          failure_reason?: string | null
          from_available?: number
          from_pending?: number
          id?: string
          idempotency_key: string
          kind: string
          last_provider_event_id?: string | null
          mode: string
          original_amount: number
          payment_id: string
          processed_at?: string | null
          provider_status?: string | null
          reason: string
          refund_amount: number
          requested_amount: number
          requested_by: string
          status?: string
          tenant_id: string
          updated_at?: string
          wiize_fee_retained?: number
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          deduction_amount?: number
          deduction_reason?: string | null
          deduction_type?: string
          deduction_value?: number
          eligible_amount?: number
          failure_reason?: string | null
          from_available?: number
          from_pending?: number
          id?: string
          idempotency_key?: string
          kind?: string
          last_provider_event_id?: string | null
          mode?: string
          original_amount?: number
          payment_id?: string
          processed_at?: string | null
          provider_status?: string | null
          reason?: string
          refund_amount?: number
          requested_amount?: number
          requested_by?: string
          status?: string
          tenant_id?: string
          updated_at?: string
          wiize_fee_retained?: number
        }
        Relationships: [
          {
            foreignKeyName: "refunds_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      security_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          ip_address: string | null
          metadata: Json
          severity: string
          tenant_id: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          ip_address?: string | null
          metadata?: Json
          severity?: string
          tenant_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          ip_address?: string | null
          metadata?: Json
          severity?: string
          tenant_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      services: {
        Row: {
          accepted_methods: Database["public"]["Enums"]["payment_method"][]
          active: boolean
          amount: number
          archived_at: string | null
          auto_renew: boolean
          created_at: string
          created_by: string | null
          custom_amount: boolean
          cycles: number | null
          description: string | null
          discount_amount: number
          due_days: number
          ends_on: string | null
          fine_percentage: number
          flexible_type: boolean
          frequency: Database["public"]["Enums"]["billing_frequency"] | null
          id: string
          installment_amount: number | null
          installments: number | null
          interest_percentage: number
          name: string
          starts_on: string | null
          tenant_id: string
          type: Database["public"]["Enums"]["service_type"]
          updated_at: string
        }
        Insert: {
          accepted_methods?: Database["public"]["Enums"]["payment_method"][]
          active?: boolean
          amount: number
          archived_at?: string | null
          auto_renew?: boolean
          created_at?: string
          created_by?: string | null
          custom_amount?: boolean
          cycles?: number | null
          description?: string | null
          discount_amount?: number
          due_days?: number
          ends_on?: string | null
          fine_percentage?: number
          flexible_type?: boolean
          frequency?: Database["public"]["Enums"]["billing_frequency"] | null
          id?: string
          installment_amount?: number | null
          installments?: number | null
          interest_percentage?: number
          name: string
          starts_on?: string | null
          tenant_id: string
          type?: Database["public"]["Enums"]["service_type"]
          updated_at?: string
        }
        Update: {
          accepted_methods?: Database["public"]["Enums"]["payment_method"][]
          active?: boolean
          amount?: number
          archived_at?: string | null
          auto_renew?: boolean
          created_at?: string
          created_by?: string | null
          custom_amount?: boolean
          cycles?: number | null
          description?: string | null
          discount_amount?: number
          due_days?: number
          ends_on?: string | null
          fine_percentage?: number
          flexible_type?: boolean
          frequency?: Database["public"]["Enums"]["billing_frequency"] | null
          id?: string
          installment_amount?: number | null
          installments?: number | null
          interest_percentage?: number
          name?: string
          starts_on?: string | null
          tenant_id?: string
          type?: Database["public"]["Enums"]["service_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "services_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          active: boolean
          amount: number
          contract_id: string | null
          created_at: string
          customer_id: string
          cycles: number | null
          cycles_done: number
          ends_on: string | null
          frequency: Database["public"]["Enums"]["billing_frequency"]
          id: string
          method: Database["public"]["Enums"]["payment_method"]
          next_charge_on: string | null
          provider_subscription_id: string | null
          service_id: string | null
          starts_on: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          amount: number
          contract_id?: string | null
          created_at?: string
          customer_id: string
          cycles?: number | null
          cycles_done?: number
          ends_on?: string | null
          frequency?: Database["public"]["Enums"]["billing_frequency"]
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          next_charge_on?: string | null
          provider_subscription_id?: string | null
          service_id?: string | null
          starts_on?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          amount?: number
          contract_id?: string | null
          created_at?: string
          customer_id?: string
          cycles?: number | null
          cycles_done?: number
          ends_on?: string | null
          frequency?: Database["public"]["Enums"]["billing_frequency"]
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          next_charge_on?: string | null
          provider_subscription_id?: string | null
          service_id?: string | null
          starts_on?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_custom_roles: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          permissions: string[]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          permissions?: string[]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          permissions?: string[]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_custom_roles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_invitations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          custom_role_id: string | null
          email: string
          expires_at: string
          full_name: string | null
          id: string
          invited_by: string | null
          permissions: string[]
          role: Database["public"]["Enums"]["tenant_role"]
          status: string
          tenant_id: string
          token_hash: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          custom_role_id?: string | null
          email: string
          expires_at: string
          full_name?: string | null
          id?: string
          invited_by?: string | null
          permissions?: string[]
          role?: Database["public"]["Enums"]["tenant_role"]
          status?: string
          tenant_id: string
          token_hash: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          custom_role_id?: string | null
          email?: string
          expires_at?: string
          full_name?: string | null
          id?: string
          invited_by?: string | null
          permissions?: string[]
          role?: Database["public"]["Enums"]["tenant_role"]
          status?: string
          tenant_id?: string
          token_hash?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_invitations_custom_role_id_fkey"
            columns: ["custom_role_id"]
            isOneToOne: false
            referencedRelation: "tenant_custom_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_invitations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_members: {
        Row: {
          created_at: string
          custom_role_id: string | null
          deactivated_at: string | null
          id: string
          invited_by: string | null
          last_seen_at: string | null
          permissions: string[]
          role: Database["public"]["Enums"]["tenant_role"]
          status: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          custom_role_id?: string | null
          deactivated_at?: string | null
          id?: string
          invited_by?: string | null
          last_seen_at?: string | null
          permissions?: string[]
          role?: Database["public"]["Enums"]["tenant_role"]
          status?: string
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          custom_role_id?: string | null
          deactivated_at?: string | null
          id?: string
          invited_by?: string | null
          last_seen_at?: string | null
          permissions?: string[]
          role?: Database["public"]["Enums"]["tenant_role"]
          status?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_members_custom_role_fk"
            columns: ["custom_role_id"]
            isOneToOne: false
            referencedRelation: "tenant_custom_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_members_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_settings: {
        Row: {
          default_due_days: number
          late_fees_configured_at: string | null
          late_fine_enabled: boolean
          late_fine_percent: number
          late_interest_enabled: boolean
          late_interest_percent: number
          minimum_withdrawal_amount: number | null
          monthly_withdrawal_count: number | null
          pix_daily_limit: number | null
          platform_fee_percentage: number | null
          tenant_id: string
          updated_at: string
          withdrawal_hold_days: number | null
        }
        Insert: {
          default_due_days?: number
          late_fees_configured_at?: string | null
          late_fine_enabled?: boolean
          late_fine_percent?: number
          late_interest_enabled?: boolean
          late_interest_percent?: number
          minimum_withdrawal_amount?: number | null
          monthly_withdrawal_count?: number | null
          pix_daily_limit?: number | null
          platform_fee_percentage?: number | null
          tenant_id: string
          updated_at?: string
          withdrawal_hold_days?: number | null
        }
        Update: {
          default_due_days?: number
          late_fees_configured_at?: string | null
          late_fine_enabled?: boolean
          late_fine_percent?: number
          late_interest_enabled?: boolean
          late_interest_percent?: number
          minimum_withdrawal_amount?: number | null
          monthly_withdrawal_count?: number | null
          pix_daily_limit?: number | null
          platform_fee_percentage?: number | null
          tenant_id?: string
          updated_at?: string
          withdrawal_hold_days?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          address: string | null
          address_number: string | null
          city: string | null
          company_type: string | null
          complement: string | null
          created_at: string
          created_by: string
          district: string | null
          document: string | null
          email: string | null
          financial_failed_attempts: number
          financial_locked_until: string | null
          id: string
          income_value: number | null
          legal_name: string | null
          name: string
          phone: string | null
          state: string | null
          updated_at: string
          zip_code: string | null
        }
        Insert: {
          address?: string | null
          address_number?: string | null
          city?: string | null
          company_type?: string | null
          complement?: string | null
          created_at?: string
          created_by: string
          district?: string | null
          document?: string | null
          email?: string | null
          financial_failed_attempts?: number
          financial_locked_until?: string | null
          id?: string
          income_value?: number | null
          legal_name?: string | null
          name: string
          phone?: string | null
          state?: string | null
          updated_at?: string
          zip_code?: string | null
        }
        Update: {
          address?: string | null
          address_number?: string | null
          city?: string | null
          company_type?: string | null
          complement?: string | null
          created_at?: string
          created_by?: string
          district?: string | null
          document?: string | null
          email?: string | null
          financial_failed_attempts?: number
          financial_locked_until?: string | null
          id?: string
          income_value?: number | null
          legal_name?: string | null
          name?: string
          phone?: string | null
          state?: string | null
          updated_at?: string
          zip_code?: string | null
        }
        Relationships: []
      }
      tracking_settings: {
        Row: {
          created_at: string
          enabled: boolean
          ga4_id: string | null
          gtm_id: string | null
          id: boolean
          meta_pixel_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          ga4_id?: string | null
          gtm_id?: string | null
          id?: boolean
          meta_pixel_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          enabled?: boolean
          ga4_id?: string | null
          gtm_id?: string | null
          id?: boolean
          meta_pixel_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      transactions: {
        Row: {
          amount: number
          created_at: string
          description: string | null
          id: string
          kind: Database["public"]["Enums"]["transaction_kind"]
          occurred_at: string
          payment_id: string | null
          tenant_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          description?: string | null
          id?: string
          kind: Database["public"]["Enums"]["transaction_kind"]
          occurred_at?: string
          payment_id?: string | null
          tenant_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["transaction_kind"]
          occurred_at?: string
          payment_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      user_activity: {
        Row: {
          active_seconds: number
          created_at: string
          id: string
          path: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          active_seconds?: number
          created_at?: string
          id?: string
          path: string
          tenant_id: string
          user_id: string
        }
        Update: {
          active_seconds?: number
          created_at?: string
          id?: string
          path?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_activity_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      user_onboarding: {
        Row: {
          acquisition_source: string | null
          biggest_challenge: string | null
          business_type: string | null
          completed_at: string | null
          created_at: string
          goal_90d: string | null
          id: string
          monthly_revenue: string | null
          payment_methods: string[]
          role: string | null
          skipped: boolean
          team_size: string | null
          tenant_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          acquisition_source?: string | null
          biggest_challenge?: string | null
          business_type?: string | null
          completed_at?: string | null
          created_at?: string
          goal_90d?: string | null
          id?: string
          monthly_revenue?: string | null
          payment_methods?: string[]
          role?: string | null
          skipped?: boolean
          team_size?: string | null
          tenant_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          acquisition_source?: string | null
          biggest_challenge?: string | null
          business_type?: string | null
          completed_at?: string | null
          created_at?: string
          goal_90d?: string | null
          id?: string
          monthly_revenue?: string | null
          payment_methods?: string[]
          role?: string | null
          skipped?: boolean
          team_size?: string | null
          tenant_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_onboarding_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_security_settings: {
        Row: {
          created_at: string
          updated_at: string
          user_id: string
          withdrawal_2fa_required: boolean
        }
        Insert: {
          created_at?: string
          updated_at?: string
          user_id: string
          withdrawal_2fa_required?: boolean
        }
        Update: {
          created_at?: string
          updated_at?: string
          user_id?: string
          withdrawal_2fa_required?: boolean
        }
        Relationships: []
      }
      user_sessions: {
        Row: {
          created_at: string
          id: string
          ip_address: string | null
          last_seen_at: string
          tenant_id: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          ip_address?: string | null
          last_seen_at?: string
          tenant_id?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          ip_address?: string | null
          last_seen_at?: string
          tenant_id?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_sessions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      wallets: {
        Row: {
          available_balance: number
          blocked_balance: number
          pending_balance: number
          tenant_id: string
          total_fees: number
          total_received: number
          total_withdrawn: number
          updated_at: string
        }
        Insert: {
          available_balance?: number
          blocked_balance?: number
          pending_balance?: number
          tenant_id: string
          total_fees?: number
          total_received?: number
          total_withdrawn?: number
          updated_at?: string
        }
        Update: {
          available_balance?: number
          blocked_balance?: number
          pending_balance?: number
          tenant_id?: string
          total_fees?: number
          total_received?: number
          total_withdrawn?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_events: {
        Row: {
          error_message: string | null
          event_type: string
          external_event_id: string
          id: string
          payload: Json
          payload_hash: string | null
          processed_at: string | null
          processing_status: Database["public"]["Enums"]["webhook_status"]
          provider: string
          received_at: string
          retry_count: number
          tenant_id: string | null
        }
        Insert: {
          error_message?: string | null
          event_type: string
          external_event_id: string
          id?: string
          payload: Json
          payload_hash?: string | null
          processed_at?: string | null
          processing_status?: Database["public"]["Enums"]["webhook_status"]
          provider: string
          received_at?: string
          retry_count?: number
          tenant_id?: string | null
        }
        Update: {
          error_message?: string | null
          event_type?: string
          external_event_id?: string
          id?: string
          payload?: Json
          payload_hash?: string | null
          processed_at?: string | null
          processing_status?: Database["public"]["Enums"]["webhook_status"]
          provider?: string
          received_at?: string
          retry_count?: number
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "webhook_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      wiize_charges: {
        Row: {
          amount_cents: number
          cancelled_at: string | null
          charge_group_id: string | null
          checksum: string | null
          client_id: string
          created_at: string
          customer_id: string | null
          external_reference: string
          id: string
          idempotency_key: string
          public_id: string
          service_id: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount_cents: number
          cancelled_at?: string | null
          charge_group_id?: string | null
          checksum?: string | null
          client_id: string
          created_at?: string
          customer_id?: string | null
          external_reference: string
          id?: string
          idempotency_key: string
          public_id: string
          service_id?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          cancelled_at?: string | null
          charge_group_id?: string | null
          checksum?: string | null
          client_id?: string
          created_at?: string
          customer_id?: string | null
          external_reference?: string
          id?: string
          idempotency_key?: string
          public_id?: string
          service_id?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wiize_charges_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      wiize_connections: {
        Row: {
          connected_at: string | null
          connected_by: string | null
          created_at: string
          id: string
          last_sync_at: string | null
          revoked_at: string | null
          scopes: string[]
          status: string
          tenant_id: string
          updated_at: string
          wiize_account_name: string | null
          wiize_email_masked: string | null
          wiize_organization_id: string | null
          wiize_organization_name: string | null
        }
        Insert: {
          connected_at?: string | null
          connected_by?: string | null
          created_at?: string
          id?: string
          last_sync_at?: string | null
          revoked_at?: string | null
          scopes?: string[]
          status?: string
          tenant_id: string
          updated_at?: string
          wiize_account_name?: string | null
          wiize_email_masked?: string | null
          wiize_organization_id?: string | null
          wiize_organization_name?: string | null
        }
        Update: {
          connected_at?: string | null
          connected_by?: string | null
          created_at?: string
          id?: string
          last_sync_at?: string | null
          revoked_at?: string | null
          scopes?: string[]
          status?: string
          tenant_id?: string
          updated_at?: string
          wiize_account_name?: string | null
          wiize_email_masked?: string | null
          wiize_organization_id?: string | null
          wiize_organization_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wiize_connections_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      wiize_customer_links: {
        Row: {
          created_at: string
          customer_id: string
          id: string
          match_method: string
          tenant_id: string
          wiize_customer_id: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          id?: string
          match_method: string
          tenant_id: string
          wiize_customer_id: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          id?: string
          match_method?: string
          tenant_id?: string
          wiize_customer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wiize_customer_links_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wiize_customer_links_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      wiize_inbound_events: {
        Row: {
          event_id: string
          event_type: string
          received_at: string
        }
        Insert: {
          event_id: string
          event_type: string
          received_at?: string
        }
        Update: {
          event_id?: string
          event_type?: string
          received_at?: string
        }
        Relationships: []
      }
      wiize_oauth_states: {
        Row: {
          code_verifier_enc: string
          created_at: string
          expires_at: string
          id: string
          purpose: string
          state_hash: string
          tenant_id: string | null
          used_at: string | null
          user_id: string | null
        }
        Insert: {
          code_verifier_enc: string
          created_at?: string
          expires_at: string
          id?: string
          purpose?: string
          state_hash: string
          tenant_id?: string | null
          used_at?: string | null
          user_id?: string | null
        }
        Update: {
          code_verifier_enc?: string
          created_at?: string
          expires_at?: string
          id?: string
          purpose?: string
          state_hash?: string
          tenant_id?: string | null
          used_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wiize_oauth_states_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      wiize_outbound_events: {
        Row: {
          attempts: number
          created_at: string
          delivered_at: string | null
          event_type: string
          id: string
          last_error: string | null
          next_attempt_at: string
          payload: Json
          resource_id: string
          resource_type: string
          status: string
          tenant_id: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          delivered_at?: string | null
          event_type: string
          id?: string
          last_error?: string | null
          next_attempt_at?: string
          payload?: Json
          resource_id: string
          resource_type: string
          status?: string
          tenant_id: string
        }
        Update: {
          attempts?: number
          created_at?: string
          delivered_at?: string | null
          event_type?: string
          id?: string
          last_error?: string | null
          next_attempt_at?: string
          payload?: Json
          resource_id?: string
          resource_type?: string
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wiize_outbound_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      wiize_pay_webhooks: {
        Row: {
          attempts: number
          body: Json
          charge_id: string
          created_at: string
          delivered_at: string | null
          event_id: string
          id: string
          last_error: string | null
          last_status: number | null
          next_attempt_at: string
          status: string
          tenant_id: string
          type: string
        }
        Insert: {
          attempts?: number
          body: Json
          charge_id: string
          created_at?: string
          delivered_at?: string | null
          event_id: string
          id?: string
          last_error?: string | null
          last_status?: number | null
          next_attempt_at?: string
          status?: string
          tenant_id: string
          type: string
        }
        Update: {
          attempts?: number
          body?: Json
          charge_id?: string
          created_at?: string
          delivered_at?: string | null
          event_id?: string
          id?: string
          last_error?: string | null
          last_status?: number | null
          next_attempt_at?: string
          status?: string
          tenant_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "wiize_pay_webhooks_charge_id_fkey"
            columns: ["charge_id"]
            isOneToOne: false
            referencedRelation: "wiize_charges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wiize_pay_webhooks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      wiize_tokens: {
        Row: {
          access_token_enc: string
          connection_id: string
          expires_at: string | null
          refresh_token_enc: string | null
          updated_at: string
        }
        Insert: {
          access_token_enc: string
          connection_id: string
          expires_at?: string | null
          refresh_token_enc?: string | null
          updated_at?: string
        }
        Update: {
          access_token_enc?: string
          connection_id?: string
          expires_at?: string | null
          refresh_token_enc?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wiize_tokens_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: true
            referencedRelation: "wiize_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      withdrawals: {
        Row: {
          amount: number
          bank_account_id: string | null
          completed_at: string | null
          failure_reason: string | null
          fee_amount: number
          id: string
          idempotency_key: string | null
          net_amount: number
          provider_confirmed_at: string | null
          provider_requested_at: string | null
          provider_status: string | null
          provider_transfer_id: string | null
          requested_at: string
          requested_by: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["withdrawal_status"]
          tenant_id: string
          transfer_reference: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          bank_account_id?: string | null
          completed_at?: string | null
          failure_reason?: string | null
          fee_amount?: number
          id?: string
          idempotency_key?: string | null
          net_amount?: number
          provider_confirmed_at?: string | null
          provider_requested_at?: string | null
          provider_status?: string | null
          provider_transfer_id?: string | null
          requested_at?: string
          requested_by?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["withdrawal_status"]
          tenant_id: string
          transfer_reference?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          bank_account_id?: string | null
          completed_at?: string | null
          failure_reason?: string | null
          fee_amount?: number
          id?: string
          idempotency_key?: string | null
          net_amount?: number
          provider_confirmed_at?: string | null
          provider_requested_at?: string | null
          provider_status?: string | null
          provider_transfer_id?: string | null
          requested_at?: string
          requested_by?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["withdrawal_status"]
          tenant_id?: string
          transfer_reference?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "withdrawals_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "withdrawals_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _fin_writer: { Args: { _tenant: string }; Returns: undefined }
      admin_review_activation: {
        Args: {
          _admin_id: string
          _message: string
          _tenant_id: string
          _to: Database["public"]["Enums"]["activation_status"]
        }
        Returns: undefined
      }
      apply_anticipation_event: {
        Args: {
          _event_id: string
          _provider_status: string
          _request_id: string
          _status: Database["public"]["Enums"]["anticipation_status"]
        }
        Returns: undefined
      }
      apply_coproduction_split: {
        Args: { _event_id: string; _items: Json; _payment_id: string }
        Returns: number
      }
      apply_payment_event: {
        Args: {
          _estimated_available_at?: string
          _estimated_rule?: string
          _paid_at?: string
          _payment_id: string
          _provider_fee?: number
          _status: Database["public"]["Enums"]["payment_status"]
        }
        Returns: undefined
      }
      apply_refund_event: {
        Args: {
          _event_id: string
          _message: string
          _provider_status: string
          _refund_id: string
          _status: string
        }
        Returns: undefined
      }
      can_receive_payments: { Args: { _tenant_id: string }; Returns: boolean }
      cancel_withdrawal: {
        Args: { _reason: string; _tenant_id: string; _withdrawal_id: string }
        Returns: undefined
      }
      charge_invoice_fee: { Args: { _invoice_id: string }; Returns: number }
      complete_withdrawal: {
        Args: { _reference: string; _reviewer: string; _withdrawal_id: string }
        Returns: undefined
      }
      document_in_use: {
        Args: { _document: string; _tenant_id: string }
        Returns: boolean
      }
      dunning_change_group_plan: {
        Args: {
          _charge_group_id: string
          _plan_code: string
          _tenant_id: string
          _user_id: string
        }
        Returns: number
      }
      dunning_charge_fee: { Args: { _payment_id: string }; Returns: string }
      fin_cancel_card_purchase: {
        Args: { _purchase: string; _tenant: string }
        Returns: undefined
      }
      fin_cancel_entry: {
        Args: { _entry: string; _tenant: string }
        Returns: undefined
      }
      fin_card_purchase: {
        Args: {
          _amount: number
          _card: string
          _category: string
          _date: string
          _description: string
          _installments: number
          _key: string
          _tenant: string
        }
        Returns: string
      }
      fin_invoice_for: {
        Args: { _card: string; _date: string }
        Returns: string
      }
      fin_move_category: {
        Args: { _from: string; _tenant: string; _to: string }
        Returns: number
      }
      fin_pay_invoice: {
        Args: {
          _account: string
          _invoice: string
          _paid_on: string
          _tenant: string
        }
        Returns: string
      }
      fin_transfer: {
        Args: {
          _amount: number
          _date: string
          _description: string
          _from: string
          _tenant: string
          _to: string
        }
        Returns: string
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_tenant_role: {
        Args: {
          _roles: Database["public"]["Enums"]["tenant_role"][]
          _tenant_id: string
        }
        Returns: boolean
      }
      is_tenant_member: { Args: { _tenant_id: string }; Returns: boolean }
      mark_notifications_read: {
        Args: { _ids?: string[]; _tenant_id: string }
        Returns: number
      }
      mfa_satisfied: { Args: never; Returns: boolean }
      refund_coproduction_splits: {
        Args: { _payment_id: string }
        Returns: number
      }
      release_available_balances: {
        Args: { _tenant_id: string }
        Returns: number
      }
      release_coproduction_splits: {
        Args: { _payment_id: string }
        Returns: number
      }
      release_coupon: { Args: { _payment_id: string }; Returns: undefined }
      request_refund: {
        Args: {
          _deduction_reason: string
          _deduction_type: string
          _deduction_value: number
          _idempotency_key: string
          _kind: string
          _mode: string
          _payment_id: string
          _reason: string
          _requested_amount: number
          _tenant_id: string
          _user_id: string
        }
        Returns: string
      }
      request_withdrawal: {
        Args: {
          _amount: number
          _bank_account_id: string
          _idempotency_key: string
          _tenant_id: string
          _user_id: string
        }
        Returns: string
      }
      reserve_coupon: {
        Args: {
          _base: number
          _code: string
          _customer_id: string
          _key: string
          _payment_id: string
          _tenant_id: string
        }
        Returns: {
          coupon_id: string
          discount: number
          error: string
          redemption_id: string
        }[]
      }
      settle_payment: { Args: { _payment_id: string }; Returns: boolean }
      submit_activation: {
        Args: { _tenant_id: string; _user_id: string }
        Returns: undefined
      }
      sync_coproduction_refunds: {
        Args: { _credit_owner: boolean; _items: Json; _payment_id: string }
        Returns: number
      }
      wallet_consistency_report: {
        Args: never
        Returns: {
          difference: number
          ledger_total: number
          tenant_id: string
          tenant_name: string
          wallet_total: number
        }[]
      }
    }
    Enums: {
      activation_status:
        | "not_started"
        | "draft"
        | "in_progress"
        | "submitted"
        | "under_review"
        | "action_required"
        | "approved"
        | "rejected"
        | "suspended"
      anticipation_status:
        | "pending"
        | "processing"
        | "completed"
        | "failed"
        | "cancelled"
      app_role: "platform_admin" | "support" | "user"
      billing_frequency:
        | "weekly"
        | "biweekly"
        | "monthly"
        | "quarterly"
        | "semiannual"
        | "yearly"
      contract_status:
        | "draft"
        | "awaiting_customer"
        | "awaiting_provider"
        | "signed"
        | "cancelled"
        | "expired"
      customer_status:
        | "active"
        | "inactive"
        | "overdue"
        | "suspended"
        | "closed"
      customer_type: "individual" | "company"
      payment_method: "pix" | "credit_card" | "boleto" | "debit_card"
      payment_status:
        | "created"
        | "awaiting_payment"
        | "processing"
        | "paid"
        | "overdue"
        | "cancelled"
        | "refunded"
        | "in_analysis"
        | "failed"
      provider_environment: "sandbox" | "production"
      service_type: "one_time" | "installment" | "recurring"
      tenant_role: "owner" | "admin" | "finance" | "viewer"
      transaction_kind:
        | "payment"
        | "platform_fee"
        | "provider_fee"
        | "refund"
        | "withdrawal"
        | "adjustment"
        | "anticipation"
        | "anticipation_fee"
        | "dunning_fee"
      webhook_status:
        | "received"
        | "processing"
        | "processed"
        | "failed"
        | "discarded"
      withdrawal_status:
        | "requested"
        | "in_analysis"
        | "processing"
        | "completed"
        | "failed"
        | "cancelled"
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
      activation_status: [
        "not_started",
        "draft",
        "in_progress",
        "submitted",
        "under_review",
        "action_required",
        "approved",
        "rejected",
        "suspended",
      ],
      anticipation_status: [
        "pending",
        "processing",
        "completed",
        "failed",
        "cancelled",
      ],
      app_role: ["platform_admin", "support", "user"],
      billing_frequency: [
        "weekly",
        "biweekly",
        "monthly",
        "quarterly",
        "semiannual",
        "yearly",
      ],
      contract_status: [
        "draft",
        "awaiting_customer",
        "awaiting_provider",
        "signed",
        "cancelled",
        "expired",
      ],
      customer_status: ["active", "inactive", "overdue", "suspended", "closed"],
      customer_type: ["individual", "company"],
      payment_method: ["pix", "credit_card", "boleto", "debit_card"],
      payment_status: [
        "created",
        "awaiting_payment",
        "processing",
        "paid",
        "overdue",
        "cancelled",
        "refunded",
        "in_analysis",
        "failed",
      ],
      provider_environment: ["sandbox", "production"],
      service_type: ["one_time", "installment", "recurring"],
      tenant_role: ["owner", "admin", "finance", "viewer"],
      transaction_kind: [
        "payment",
        "platform_fee",
        "provider_fee",
        "refund",
        "withdrawal",
        "adjustment",
        "anticipation",
        "anticipation_fee",
        "dunning_fee",
      ],
      webhook_status: [
        "received",
        "processing",
        "processed",
        "failed",
        "discarded",
      ],
      withdrawal_status: [
        "requested",
        "in_analysis",
        "processing",
        "completed",
        "failed",
        "cancelled",
      ],
    },
  },
} as const
