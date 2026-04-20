/**
 * JSON types mirroring the Go API models. Source of truth:
 *   api/internal/domain/flag/model.go:8
 *   api/internal/domain/environment/model.go
 *   api/internal/domain/segment/model.go
 *   api/internal/domain/targeting/model.go
 *   api/internal/audit/audit.go
 *
 * Only fields the MCP tools consume are declared; unknown fields pass through
 * untyped on the wire.
 */

export type FlagType = "boolean" | "string" | "number" | "json";

export interface FlagEnvironment {
  id: string;
  flagId: string;
  flagKey?: string;
  environmentId: string;
  environmentKey?: string;
  environmentColor?: string;
  enabled: boolean;
  valueOverride?: unknown;
  rolloutPercentage?: number | null;
  targetingRuleCount: number;
  variants?: FlagVariant[];
  createdAt: string;
  updatedAt: string;
}

export interface FlagVariant {
  id: string;
  flagEnvironmentId: string;
  key: string;
  value: unknown;
  weight: number;
  createdAt: string;
}

export interface Flag {
  id: string;
  projectId: string;
  key: string;
  name: string;
  description?: string | null;
  type: FlagType;
  defaultValue: unknown;
  offValue: unknown;
  archivedAt?: string | null;
  environments?: FlagEnvironment[];
  createdAt: string;
  updatedAt: string;
}

export interface Environment {
  id: string;
  projectId: string;
  key: string;
  name: string;
  color?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Segment {
  id: string;
  projectId: string;
  key: string;
  name: string;
  description?: string | null;
  matchType: "all" | "any";
  rules: SegmentRule[];
  createdAt: string;
  updatedAt: string;
}

export interface SegmentRule {
  attribute: string;
  operator: string;
  values: string[];
}

export interface TargetingRule {
  id: string;
  flagEnvironmentId: string;
  priority: number;
  description?: string | null;
  matchType: "all" | "any";
  valueOverride?: unknown;
  rolloutPercentage?: number | null;
  variantKey?: string | null;
  conditions: TargetingCondition[];
  createdAt: string;
  updatedAt: string;
}

export interface TargetingCondition {
  type: "segment" | "attribute";
  segmentId?: string;
  attribute?: string;
  operator?: string;
  values?: string[];
}

export interface AuditEvent {
  id: string;
  workspaceId: string;
  actorId?: string | null;
  actorEmail?: string | null;
  actorType: string;
  source?: string;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface AuditLogResponse {
  events: AuditEvent[];
  nextCursor?: string | null;
}
