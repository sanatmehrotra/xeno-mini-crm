"use client";
/**
 * RuleBuilder.tsx — recursive visual segment rule editor.
 *
 * Renders a RuleGroup (AND/OR + list of conditions or nested groups).
 * Fields and operators are hardcoded to the same allowlist as the backend's
 * compile_rules() — see segments.ts for the mapping.
 */
import { SEGMENT_FIELDS, SEGMENT_OPS, FIELD_VALUE_HINTS, RuleGroup, RuleCondition, SegmentRule } from "@/lib/api/segments";

// ── Type guards ────────────────────────────────────────────────────────────

function isGroup(r: SegmentRule): r is RuleGroup {
  return "operator" in r;
}

// ── Empty constructors ─────────────────────────────────────────────────────

const emptyCondition = (): RuleCondition => ({
  field: "total_spent",
  op: "gte",
  value: "0",
});

const emptyGroup = (): RuleGroup => ({
  operator: "AND",
  conditions: [emptyCondition()],
});

// ── Single condition row ───────────────────────────────────────────────────

function ConditionRow({
  condition,
  onChange,
  onRemove,
}: {
  condition: RuleCondition;
  onChange: (c: RuleCondition) => void;
  onRemove: () => void;
}) {
  const hints = FIELD_VALUE_HINTS[condition.field];
  const isCategorical = !!hints;

  return (
    <div className="flex items-center gap-2 group flex-wrap">
      {/* Field */}
      <select
        className="input flex-1 min-w-[160px] text-xs"
        value={condition.field}
        onChange={(e) => {
          // Reset value when field changes
          const newField = e.target.value;
          const newHints = FIELD_VALUE_HINTS[newField];
          onChange({ ...condition, field: newField, value: newHints ? newHints[0] : "0" });
        }}
      >
        {SEGMENT_FIELDS.map((f) => (
          <option key={f.value} value={f.value}>{f.label}</option>
        ))}
      </select>

      {/* Operator */}
      <select
        className="input w-32 text-xs"
        value={condition.op}
        onChange={(e) => onChange({ ...condition, op: e.target.value })}
      >
        {SEGMENT_OPS
          .filter((o) => {
            // For JSONB attributes only eq/neq/in make sense
            if (condition.field.startsWith("attributes.")) {
              return ["eq", "neq", "in"].includes(o.value);
            }
            // For tags only contains/in make sense
            if (condition.field === "tags") {
              return ["contains", "in"].includes(o.value);
            }
            return true;
          })
          .map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
      </select>

      {/* Value — dropdown for categorical, input for numeric */}
      {isCategorical ? (
        condition.op === "in" ? (
          <select
            className="input w-40 text-xs"
            multiple
            value={Array.isArray(condition.value) ? condition.value as string[] : [String(condition.value)]}
            onChange={(e) => {
              const selected = Array.from(e.target.selectedOptions, (o) => o.value);
              onChange({ ...condition, value: selected });
            }}
            style={{ height: "64px" }}
          >
            {hints.map((h) => <option key={h} value={h}>{h}</option>)}
          </select>
        ) : (
          <select
            className="input w-40 text-xs"
            value={String(condition.value)}
            onChange={(e) => onChange({ ...condition, value: e.target.value })}
          >
            {hints.map((h) => <option key={h} value={h}>{h}</option>)}
          </select>
        )
      ) : (
        <input
          className="input w-28 text-xs font-mono"
          value={String(condition.value)}
          onChange={(e) => onChange({ ...condition, value: e.target.value })}
          placeholder={condition.field.includes("days") ? "e.g. 30" : "e.g. 5000"}
          type="number"
          min="0"
        />
      )}

      {/* Remove */}
      <button
        onClick={onRemove}
        className="opacity-0 group-hover:opacity-100 transition-opacity text-muted hover:text-brick text-sm w-6 shrink-0"
        title="Remove condition"
      >
        ✕
      </button>
    </div>
  );
}

// ── Rule group (recursive) ─────────────────────────────────────────────────

export function RuleGroupEditor({
  group,
  onChange,
  onRemove,
  depth = 0,
}: {
  group: RuleGroup;
  onChange: (g: RuleGroup) => void;
  onRemove?: () => void;
  depth?: number;
}) {
  const updateCondition = (i: number, updated: SegmentRule) => {
    const conditions = [...group.conditions];
    conditions[i] = updated;
    onChange({ ...group, conditions });
  };

  const removeCondition = (i: number) => {
    const conditions = group.conditions.filter((_, idx) => idx !== i);
    onChange({ ...group, conditions });
  };

  const addCondition = () =>
    onChange({ ...group, conditions: [...group.conditions, emptyCondition()] });

  const addGroup = () =>
    onChange({ ...group, conditions: [...group.conditions, emptyGroup()] });

  return (
    <div
      className={`space-y-3 ${depth > 0 ? "ml-4 pl-4 border-l-2 border-copper/30 rounded-l" : ""}`}
    >
      {/* Operator pill + remove group */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-muted text-xs">Match</span>
        {(["AND", "OR"] as const).map((op) => (
          <button
            key={op}
            onClick={() => onChange({ ...group, operator: op })}
            className={`px-2.5 py-0.5 rounded text-xs font-mono font-medium transition-colors ${
              group.operator === op
                ? op === "AND"
                  ? "bg-copper/20 text-copper border border-copper/40"
                  : "bg-sage/20 text-sage border border-sage/40"
                : "bg-surface border border-border text-muted hover:text-parchment"
            }`}
          >
            {op}
          </button>
        ))}
        <span className="text-muted text-xs">of these conditions</span>
        {onRemove && (
          <button
            onClick={onRemove}
            className="ml-auto text-muted hover:text-brick text-xs transition-colors"
          >
            Remove group
          </button>
        )}
      </div>

      {/* Conditions */}
      {group.conditions.map((c, i) =>
        isGroup(c) ? (
          <RuleGroupEditor
            key={i}
            group={c}
            onChange={(updated) => updateCondition(i, updated)}
            onRemove={() => removeCondition(i)}
            depth={depth + 1}
          />
        ) : (
          <ConditionRow
            key={i}
            condition={c}
            onChange={(updated) => updateCondition(i, updated)}
            onRemove={() => removeCondition(i)}
          />
        )
      )}

      {/* Add buttons */}
      <div className="flex gap-2">
        <button onClick={addCondition} className="btn-ghost text-xs px-3 py-1.5">
          + Condition
        </button>
        {depth < 2 && (
          <button onClick={addGroup} className="btn-ghost text-xs px-3 py-1.5">
            + Group
          </button>
        )}
      </div>
    </div>
  );
}

export { emptyGroup, emptyCondition };
