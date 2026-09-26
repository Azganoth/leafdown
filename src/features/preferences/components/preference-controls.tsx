import type { ReactNode } from "react";
import { useId, useState } from "react";

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export interface PreferenceSwitchProps {
  checked: boolean;
  description?: ReactNode;
  label: string;
  onCheckedChange: (checked: boolean) => void;
}

export interface ChoiceOption<Value extends string> {
  label: string;
  // Set when the label is in a language other than the UI's, such as a language autonym.
  lang?: string;
  value: Value;
}

export interface PreferenceChoiceProps<Value extends string> {
  description?: ReactNode;
  label: string;
  onValueChange: (value: Value) => void;
  options: ChoiceOption<Value>[];
  value: Value;
}

export interface ListPreferenceFieldProps {
  description?: ReactNode;
  items: string[];
  label: string;
  onItemsChange: (items: string[]) => void;
}

const formatListValue = (items: string[]) => items.join("\n");

const parseListValue = (value: string) =>
  value
    .split(/[\n,]/u)
    .map((item) => item.trim())
    .filter(Boolean);

export function PreferenceSwitch({
  checked,
  description,
  label,
  onCheckedChange,
}: PreferenceSwitchProps) {
  const id = useId();

  return (
    <Field orientation="horizontal" className="has-[>[data-slot=field-content]]:items-center">
      <FieldContent>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        {description && <FieldDescription>{description}</FieldDescription>}
      </FieldContent>
      <Switch id={id} size="lg" checked={checked} onCheckedChange={onCheckedChange} />
    </Field>
  );
}

export function PreferenceChoice<Value extends string>({
  description,
  label,
  onValueChange,
  options,
  value,
}: PreferenceChoiceProps<Value>) {
  const labelId = useId();

  return (
    <Field orientation="horizontal" className="has-[>[data-slot=field-content]]:items-center">
      <FieldContent>
        <FieldTitle id={labelId}>{label}</FieldTitle>
        {description && <FieldDescription>{description}</FieldDescription>}
      </FieldContent>
      <ToggleGroup
        aria-labelledby={labelId}
        value={[value]}
        /* A setting always holds one option, so pressing the pressed one keeps it. */
        onValueChange={(nextValue) => {
          const [selected] = nextValue as Value[];

          if (selected) {
            onValueChange(selected);
          }
        }}
        spacing={0}
        variant="outline"
        size="sm"
        className="shrink-0"
      >
        {options.map((option) => (
          <ToggleGroupItem key={option.value} lang={option.lang} value={option.value}>
            {option.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </Field>
  );
}

export function ListPreferenceField({
  description,
  items,
  label,
  onItemsChange,
}: ListPreferenceFieldProps) {
  const id = useId();
  const [prevItems, setPrevItems] = useState(items);
  const [draftValue, setDraftValue] = useState(() => formatListValue(items));

  if (items !== prevItems) {
    setPrevItems(items);
    setDraftValue(formatListValue(items));
  }

  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {description && <FieldDescription>{description}</FieldDescription>}
      <Textarea
        id={id}
        value={draftValue}
        onChange={(event) => setDraftValue(event.currentTarget.value)}
        onBlur={() => onItemsChange(parseListValue(draftValue))}
        className="min-h-24 font-mono text-sm"
      />
    </Field>
  );
}
