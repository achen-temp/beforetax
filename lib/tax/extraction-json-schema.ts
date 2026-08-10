import type { DocumentType, FieldDataType } from '@/lib/tax/document-types'
import { getFormSchema, type FieldDefinition } from '@/lib/tax/field-schemas'
import { EXTRACTION_WARNINGS } from '@/lib/tax/extraction-prompt'

/**
 * Build a strict OpenAI json_schema for a form's extraction output. Generated
 * from FIELD_SCHEMAS so the enforced schema and the prompt/DB rows always agree.
 *
 * Strict-mode requirements are honored throughout: every object sets
 * additionalProperties:false and lists ALL properties in `required` (optionality
 * is expressed by allowing null in the type union).
 */

type JsonSchema = Record<string, unknown>

function jsonType(type: FieldDataType): 'number' | 'string' {
  return type === 'number' ? 'number' : 'string'
}

/** A single { value, confidence } wrapper for one extracted field. */
function fieldWrapper(valueSchema: JsonSchema): JsonSchema {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['value', 'confidence'],
    properties: {
      value: valueSchema,
      confidence: { type: 'number' },
    },
  }
}

/** value schema for a single field, matching how flatten-extraction reads it. */
function valueSchemaFor(field: FieldDefinition): JsonSchema {
  // Group (e.g. W-2 per-state boxes 15-17): array of objects with sub-fields.
  if (field.type === 'group' && field.fields) {
    const properties: Record<string, JsonSchema> = {}
    for (const sub of field.fields) {
      properties[sub.key] = { type: [jsonType(sub.type as FieldDataType), 'null'] }
    }
    return {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: field.fields.map((s) => s.key),
        properties,
      },
    }
  }

  // Fixed slots (e.g. W-2 box 12 lines a-d): an object keyed by slot, each a
  // { code, value } pair. Every slot is required so the model must answer each
  // physical line (null when blank) rather than silently truncating a list.
  if (field.slots) {
    const properties: Record<string, JsonSchema> = {}
    for (const slot of field.slots) {
      properties[slot] = {
        type: 'object',
        additionalProperties: false,
        required: ['code', 'value'],
        properties: {
          code: { type: ['string', 'null'] },
          value: { type: [jsonType(field.type as FieldDataType), 'null'] },
        },
      }
    }
    return {
      type: 'object',
      additionalProperties: false,
      required: [...field.slots],
      properties,
    }
  }

  // Repeating simple (e.g. legacy code/value lists): array of { code, value }.
  if (field.repeating) {
    return {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['code', 'value'],
        properties: {
          code: { type: ['string', 'null'] },
          value: { type: [jsonType(field.type as FieldDataType), 'null'] },
        },
      },
    }
  }

  // Simple scalar.
  return { type: [jsonType(field.type as FieldDataType), 'null'] }
}

export function buildExtractionJsonSchema(formType: DocumentType): {
  name: string
  schema: JsonSchema
  strict: boolean
} {
  const schema = getFormSchema(formType)
  if (!schema) {
    throw new Error(`No field schema defined for form type: ${formType}`)
  }

  // Reserved boxes (e.g. W-2 box 9) never carry data — keep them out of the
  // extraction schema entirely so the model is never asked to read them.
  const extractedFields = schema.fields.filter((f) => !f.reserved)

  const fieldProperties: Record<string, JsonSchema> = {}
  for (const field of extractedFields) {
    fieldProperties[field.key] = fieldWrapper(valueSchemaFor(field))
  }

  const jsonSchema: JsonSchema = {
    type: 'object',
    additionalProperties: false,
    required: [
      'form_type',
      'form_type_mismatch',
      'document_identity',
      'printed_tax_year',
      'fields',
      'warnings',
      'notes',
    ],
    properties: {
      form_type: { type: 'string' },
      form_type_mismatch: { type: 'boolean' },
      document_identity: {
        type: 'object',
        additionalProperties: false,
        required: ['issuer_name', 'recipient_name', 'recipient_tin_last4', 'account_number_last4'],
        properties: {
          issuer_name: { type: ['string', 'null'] },
          recipient_name: { type: ['string', 'null'] },
          recipient_tin_last4: { type: ['string', 'null'] },
          account_number_last4: { type: ['string', 'null'] },
        },
      },
      printed_tax_year: { type: ['integer', 'null'] },
      fields: {
        type: 'object',
        additionalProperties: false,
        required: extractedFields.map((f) => f.key),
        properties: fieldProperties,
      },
      warnings: {
        type: 'array',
        items: { type: 'string', enum: [...EXTRACTION_WARNINGS] },
      },
      notes: { type: ['string', 'null'] },
    },
  }

  return { name: `${formType}_extraction`, schema: jsonSchema, strict: true }
}
