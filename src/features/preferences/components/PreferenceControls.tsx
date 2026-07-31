import type { ReactNode } from "react";
import { useId, useState } from "react";

import { Label } from "@/components/ui/Label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/RadioGroup";
import { Switch } from "@/components/ui/Switch";
import { Textarea } from "@/components/ui/Textarea";

export interface PreferenceSwitchProps {
  checked: boolean;
  label: string;
  onCheckedChange: (checked: boolean) => void;
}

export interface RadioOption<Value extends string> {
  label: string;
  value: Value;
}

export interface PreferenceRadioGroupProps<Value extends string> {
  label: string;
  onValueChange: (value: Value) => void;
  options: RadioOption<Value>[];
  value: Value;
}

export interface ListPreferenceFieldProps {
  items: string[];
  label: string;
  onItemsChange: (items: string[]) => void;
}

interface PreferenceSectionProps {
  children: ReactNode;
  title: string;
}

const formatListValue = (items: string[]) => items.join("\n");

const parseListValue = (value: string) =>
  value
    .split(/[\n,]/u)
    .map((item) => item.trim())
    .filter(Boolean);

export function PreferenceSwitch({ checked, label, onCheckedChange }: PreferenceSwitchProps) {
  const id = useId();

  return (
    <div className="flex items-center justify-between gap-4">
      <Label htmlFor={id}>{label}</Label>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

export function PreferenceRadioGroup<Value extends string>({
  label,
  onValueChange,
  options,
  value,
}: PreferenceRadioGroupProps<Value>) {
  const labelId = useId();

  return (
    <div className="grid gap-2">
      <Label id={labelId}>{label}</Label>
      <RadioGroup
        aria-labelledby={labelId}
        value={value}
        onValueChange={(nextValue) => onValueChange(nextValue as Value)}
        className="grid gap-2 sm:grid-cols-3"
      >
        {options.map((option) => {
          const id = `${labelId}-${option.value}`;

          return (
            <div key={option.value} className="flex items-center gap-2">
              <RadioGroupItem id={id} value={option.value} />
              <Label htmlFor={id} className="font-normal">
                {option.label}
              </Label>
            </div>
          );
        })}
      </RadioGroup>
    </div>
  );
}

export function ListPreferenceField({ items, label, onItemsChange }: ListPreferenceFieldProps) {
  const id = useId();
  const [prevItems, setPrevItems] = useState(items);
  const [draftValue, setDraftValue] = useState(() => formatListValue(items));

  if (items !== prevItems) {
    setPrevItems(items);
    setDraftValue(formatListValue(items));
  }

  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        id={id}
        value={draftValue}
        onChange={(event) => setDraftValue(event.currentTarget.value)}
        onBlur={() => onItemsChange(parseListValue(draftValue))}
        className="min-h-24 font-mono text-sm"
      />
    </div>
  );
}

export function PreferenceSection({ children, title }: PreferenceSectionProps) {
  const titleId = useId();

  return (
    <section aria-labelledby={titleId} className="grid gap-4">
      <h3 id={titleId} className="text-sm font-semibold">
        {title}
      </h3>
      <div className="grid gap-4">{children}</div>
    </section>
  );
}
