import type { DocumentOwner, DocumentType, FieldDataType } from '@/lib/tax/document-types'

export type { DocumentOwner, DocumentType, FieldDataType }

export type CpaUserRole = 'owner' | 'staff'

export type TaxYearStatus = 'collecting' | 'processing' | 'review' | 'complete'

/** @deprecated file_type is now free text validated by DOCUMENT_TYPES. Use DocumentType. */
export type DocumentFileType = DocumentType

export type DocumentSource = 'portal' | 'email'

export type ExtractionStatus = 'pending' | 'processing' | 'complete' | 'failed'

export interface CpaFirmBranding {
  logoUrl?: string
  primaryColor?: string
  [key: string]: unknown
}

export interface CpaFirm {
  id: string
  name: string
  email: string
  subdomain: string | null
  branding: CpaFirmBranding
  gmail_refresh_token: string | null
  outlook_refresh_token: string | null
  created_at: string
}

export interface CpaUser {
  id: string
  firm_id: string
  email: string
  role: CpaUserRole
  first_name: string | null
  last_name: string | null
  created_at: string
}

export interface FirmInvite {
  id: string
  firm_id: string
  email: string
  role: CpaUserRole
  token: string
  invited_by: string
  expires_at: string
  accepted_at: string | null
  created_at: string
}

export interface Client {
  id: string
  firm_id: string
  email: string
  name: string
  phone: string | null
  filing_status: string | null
  taxpayer_name: string | null
  spouse_name: string | null
  is_email_monitored: boolean
  otp_token: string | null
  otp_expires_at: string | null
  portal_token: string | null
  last_accessed_at: string | null
  created_at: string
}

export interface TaxYearChecklistItem {
  type: DocumentType
  status: 'received' | 'missing' | 'pending'
}

export interface TaxYear {
  id: string
  client_id: string
  firm_id: string
  year: number
  status: TaxYearStatus
  /** DocumentType extraction grouping — not the CPA intake "what to bring" list. */
  checklist: TaxYearChecklistItem[]
  /** CPA tax-prep intake list for this year (see lib/tax/intake-checklist). */
  intake_checklist?: IntakeChecklistItemJson[]
  created_at: string
}

/** Loose JSON shape stored on tax_years.intake_checklist */
export interface IntakeChecklistItemJson {
  id: string
  categoryId: string
  label: string
  status: string
}

/**
 * Immutable AI snapshot stored in documents.extracted_data. This is the exact
 * validated shape returned by the extraction pipeline — see
 * lib/tax/extraction-result.ts for the zod schema and runtime validation.
 */
import type { ExtractedField, ExtractionResult } from '@/lib/tax/extraction-result'
export type { ExtractedField, ExtractionResult }
export type ExtractedData = ExtractionResult

export interface Document {
  id: string
  tax_year_id: string
  firm_id: string
  client_id: string
  owner: DocumentOwner
  file_name: string
  file_path: string
  file_hash: string | null
  file_size: number
  mime_type: string
  file_type: DocumentType
  source: DocumentSource
  email_message_id: string | null
  email_subject: string | null
  extraction_status: ExtractionStatus
  extracted_data: ExtractedData | null
  raw_claude_response: Record<string, unknown> | null
  confidence_score: number | null
  created_at: string
}

export interface DocumentField {
  id: string
  firm_id: string
  tax_year_id: string
  document_id: string
  owner: DocumentOwner
  form_type: DocumentType
  box: string | null
  line_index: number
  code: string | null
  field_key: string
  data_type: FieldDataType
  value_number: number | null
  value_text: string | null
  value_date: string | null
  source_json_path: string | null
  confidence: number | null
  is_verified: boolean
  verified_by: string | null
  verified_at: string | null
  created_at: string
}

export interface ConflictValue {
  document_id: string
  value: unknown
  file_name: string
}

export interface Conflict {
  id: string
  tax_year_id: string
  firm_id: string
  field_key: string
  owner: DocumentOwner
  values: ConflictValue[]
  resolved: boolean
  resolved_by: string | null
  resolved_at: string | null
  created_at: string
}

export interface EmailEvent {
  id: string
  firm_id: string
  client_id: string | null
  message_id: string
  subject: string | null
  sender_email: string
  received_at: string
  attachments_found: number
  processed: boolean
  created_at: string
}

export interface Database {
  public: {
    Tables: {
      cpa_firms: {
        Row: CpaFirm
        Insert: {
          name: string
          email: string
          id?: string
          subdomain?: string | null
          branding?: CpaFirmBranding
          gmail_refresh_token?: string | null
          outlook_refresh_token?: string | null
          created_at?: string
        }
        Update: Partial<CpaFirm>
        Relationships: []
      }
      cpa_users: {
        Row: CpaUser
        Insert: {
          id: string
          firm_id: string
          email: string
          role?: CpaUserRole
          first_name?: string | null
          last_name?: string | null
          created_at?: string
        }
        Update: Partial<CpaUser>
        Relationships: []
      }
      firm_invites: {
        Row: FirmInvite
        Insert: {
          firm_id: string
          email: string
          token: string
          invited_by: string
          expires_at: string
          id?: string
          role?: CpaUserRole
          accepted_at?: string | null
          created_at?: string
        }
        Update: Partial<FirmInvite>
        Relationships: []
      }
      clients: {
        Row: Client
        Insert: Omit<
          Client,
          | 'id'
          | 'created_at'
          | 'is_email_monitored'
          | 'otp_token'
          | 'otp_expires_at'
          | 'last_accessed_at'
          | 'filing_status'
          | 'taxpayer_name'
          | 'spouse_name'
        > & {
          id?: string
          created_at?: string
          is_email_monitored?: boolean
          otp_token?: string | null
          otp_expires_at?: string | null
          portal_token?: string | null
          last_accessed_at?: string | null
          filing_status?: string | null
          taxpayer_name?: string | null
          spouse_name?: string | null
        }
        Update: Partial<Client>
        Relationships: []
      }
      tax_years: {
        Row: TaxYear
        Insert: Omit<TaxYear, 'id' | 'created_at' | 'status' | 'checklist'> & {
          id?: string
          created_at?: string
          status?: TaxYearStatus
          checklist?: TaxYearChecklistItem[]
        }
        Update: Partial<TaxYear>
        Relationships: []
      }
      documents: {
        Row: Document
        Insert: Omit<
          Document,
          | 'id'
          | 'created_at'
          | 'owner'
          | 'file_hash'
          | 'file_type'
          | 'source'
          | 'extraction_status'
          | 'extracted_data'
          | 'raw_claude_response'
          | 'confidence_score'
          | 'email_message_id'
          | 'email_subject'
        > & {
          id?: string
          created_at?: string
          owner?: DocumentOwner
          file_hash?: string | null
          file_type?: DocumentType
          source?: DocumentSource
          extraction_status?: ExtractionStatus
          extracted_data?: ExtractedData | null
          raw_claude_response?: Record<string, unknown> | null
          confidence_score?: number | null
          email_message_id?: string | null
          email_subject?: string | null
        }
        Update: Partial<Document>
        Relationships: []
      }
      document_fields: {
        Row: DocumentField
        Insert: Omit<
          DocumentField,
          | 'id'
          | 'created_at'
          | 'owner'
          | 'line_index'
          | 'data_type'
          | 'box'
          | 'code'
          | 'value_number'
          | 'value_text'
          | 'value_date'
          | 'source_json_path'
          | 'confidence'
          | 'is_verified'
          | 'verified_by'
          | 'verified_at'
        > & {
          id?: string
          created_at?: string
          owner?: DocumentOwner
          line_index?: number
          data_type?: FieldDataType
          box?: string | null
          code?: string | null
          value_number?: number | null
          value_text?: string | null
          value_date?: string | null
          source_json_path?: string | null
          confidence?: number | null
          is_verified?: boolean
          verified_by?: string | null
          verified_at?: string | null
        }
        Update: Partial<DocumentField>
        Relationships: []
      }
      conflicts: {
        Row: Conflict
        Insert: Omit<
          Conflict,
          'id' | 'created_at' | 'owner' | 'values' | 'resolved' | 'resolved_by' | 'resolved_at'
        > & {
          id?: string
          created_at?: string
          owner?: DocumentOwner
          values?: ConflictValue[]
          resolved?: boolean
          resolved_by?: string | null
          resolved_at?: string | null
        }
        Update: Partial<Conflict>
        Relationships: []
      }
      email_events: {
        Row: EmailEvent
        Insert: Omit<
          EmailEvent,
          'id' | 'created_at' | 'client_id' | 'attachments_found' | 'processed'
        > & {
          id?: string
          created_at?: string
          client_id?: string | null
          attachments_found?: number
          processed?: boolean
        }
        Update: Partial<EmailEvent>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: {
      cpa_user_role: CpaUserRole
      tax_year_status: TaxYearStatus
      document_owner: DocumentOwner
      document_source: DocumentSource
      extraction_status: ExtractionStatus
    }
    CompositeTypes: Record<string, never>
  }
}
